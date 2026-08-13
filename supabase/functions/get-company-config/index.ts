// Sem cliente supabase-js de propósito: deploy direto via API de management
// (sem a CLI local) roda com --no-remote e não resolve o import jsr:, então a
// function inteira ficava fora do ar com BOOT_ERROR (descoberto ao vivo
// 2026-08-13). Tudo aqui embaixo usa fetch cru contra REST do Supabase.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHATWOOT_BASE_URL = Deno.env.get("CHATWOOT_BASE_URL")!;
const CHATWOOT_API_TOKEN = Deno.env.get("CHATWOOT_API_TOKEN")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Aceita qualquer formato (com/sem +, espaços, @s.whatsapp.net do Baileys) e
// compara só pelos dígitos, pra não depender de como o número foi salvo.
function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    let phoneParam = url.searchParams.get("phone");

    const accountId = url.searchParams.get("account_id");
    const inboxId = url.searchParams.get("inbox_id");
    if (!phoneParam && accountId && inboxId) {
      const inboxResp = await fetch(
        `${CHATWOOT_BASE_URL}/api/v1/accounts/${accountId}/inboxes/${inboxId}`,
        { headers: { api_access_token: CHATWOOT_API_TOKEN } },
      );
      if (!inboxResp.ok) return json({ error: "Não foi possível buscar o inbox no Chatwoot" }, 502);
      const inbox = await inboxResp.json();
      phoneParam = inbox.phone_number ?? null;
    }

    if (!phoneParam) return json({ error: "Informe 'phone' ou 'account_id'+'inbox_id'" }, 400);

    const phoneDigits = onlyDigits(phoneParam);
    if (!phoneDigits) return json({ error: "Número de telefone inválido" }, 400);

    const companiesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/companies?select=id,name,ai_prompt,whatsapp_phone,due_date,followup_wait_hours,followup_max_attempts,website_url&whatsapp_phone=not.is.null`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    if (!companiesRes.ok) throw new Error("Falha ao buscar empresas");
    const companies = await companiesRes.json();

    const company = companies.find((c) => onlyDigits(c.whatsapp_phone ?? "") === phoneDigits);
    if (!company) return json({ error: "Empresa não encontrada para esse número" }, 404);

    // Vencida: a IA para de responder, mas o Chatwoot/painel continuam
    // acessíveis normalmente (bloqueio só do lado da IA).
    const today = new Date().toISOString().slice(0, 10);
    const blocked = !!company.due_date && company.due_date < today;
    if (blocked) {
      return json({
        company_id: company.id,
        name: company.name,
        blocked: true,
        blocked_message: "Ola! No momento nao consigo continuar o atendimento automatico. Por favor, entre em contato para regularizar o pagamento.",
      });
    }

    const resourcesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/resources?select=id,name,calendar_id,active,agenda_config(*)&company_id=eq.${company.id}&active=eq.true`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    if (!resourcesRes.ok) throw new Error("Falha ao buscar recursos");
    const resources = await resourcesRes.json();

    return json({
      company_id: company.id,
      name: company.name,
      ai_prompt: company.ai_prompt,
      website_url: company.website_url,
      blocked: false,
      followup_wait_hours: company.followup_wait_hours,
      followup_max_attempts: company.followup_max_attempts,
      resources,
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado ao buscar configuração da empresa" }, 500);
  }
});
