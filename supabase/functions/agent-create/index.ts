// Sem cliente supabase-js de propósito: deploy direto via API de management
// (sem a CLI local) roda com --no-remote e não resolve o import jsr:, então a
// function inteira ficava fora do ar com BOOT_ERROR (descoberto ao vivo
// 2026-08-13). Tudo aqui embaixo usa fetch cru contra REST/Auth do Supabase.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHATWOOT_BASE_URL = Deno.env.get("CHATWOOT_BASE_URL")!;
const CHATWOOT_API_TOKEN = Deno.env.get("CHATWOOT_API_TOKEN")!;
const CHATWOOT_PLATFORM_TOKEN = Deno.env.get("CHATWOOT_PLATFORM_TOKEN")!;

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

async function chatwootFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${CHATWOOT_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", api_access_token: token, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chatwoot ${path} falhou (${res.status}): ${text}`);
  }
  return res.json();
}

// O convite normal do Chatwoot (Configuracoes > Agentes, dentro da propria conta)
// manda um e-mail de confirmacao pro atendente clicar antes de poder entrar --
// nesse self-host o e-mail nao chega (SMTP nao configurado), entao o dono ficava
// preso tendo que ativar manualmente pelo Super Admin do Chatwoot. A Platform API
// (usada aqui, mesma usada pra criar o dono da empresa em admin-create-company)
// cria o usuario JA CONFIRMADO, sem depender de e-mail nenhum.
async function createCompanyOwner(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("UNAUTHORIZED");

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: authHeader },
  });
  if (!userRes.ok) throw new Error("UNAUTHORIZED");
  const userData = await userRes.json();
  if (!userData?.id) throw new Error("UNAUTHORIZED");

  const companyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/companies?select=id,chatwoot_account_id,chatwoot_inbox_id&user_id=eq.${userData.id}`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  if (!companyRes.ok) throw new Error("Falha ao buscar empresa");
  const companies = await companyRes.json();
  const company = companies[0];
  if (!company) throw new Error("FORBIDDEN");

  return company;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  let company;
  try {
    company = await createCompanyOwner(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNAUTHORIZED";
    return json({ error: "Nao foi possivel identificar sua empresa." }, message === "FORBIDDEN" ? 403 : 401);
  }

  try {
    const { name, email, password, team_ids } = await req.json();
    if (!name || !email || !password) {
      return json({ error: "name, email e password sao obrigatorios" }, 400);
    }
    if (password.length < 8) {
      return json({ error: "A senha precisa ter pelo menos 8 caracteres" }, 400);
    }
    if (!/[!@#$%^&*()_+\-=[\]{}|\\/.,<>?~]/.test(password)) {
      return json({ error: "A senha precisa ter pelo menos 1 caractere especial (ex: !, @, #, $)" }, 400);
    }

    const accountId = company.chatwoot_account_id;

    const user = await chatwootFetch("/platform/api/v1/users", CHATWOOT_PLATFORM_TOKEN, {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });

    // Nao usa /platform/api/v1/accounts/{id}/account_users aqui: essa rota exige
    // que a CONTA esteja registrada como "permissible" pro platform app do token
    // (só acontece automaticamente pra contas criadas via Platform API depois da
    // automacao existir -- contas mais antigas, como a 1, nunca ganharam esse
    // registro e a chamada falha com "Non permissible resource"). Em vez disso,
    // usa o endpoint normal de agentes da propria conta (mesmo token de agencia
    // que ja e admin em toda conta): como o usuario ja existe e ja esta
    // confirmado (criado acima via Platform API com skip_confirmation!), o
    // AgentBuilder do Chatwoot so vincula ele a conta, sem mandar convite/e-mail.
    await chatwootFetch(`/api/v1/accounts/${accountId}/agents`, CHATWOOT_API_TOKEN, {
      method: "POST",
      body: JSON.stringify({ agent: { name, email, role: "agent" } }),
    });

    // Sem isso o atendente nunca aparece como atribuivel na caixa de entrada,
    // mesmo depois de virar agente da conta (permissao separada no Chatwoot).
    if (company.chatwoot_inbox_id) {
      await chatwootFetch(`/api/v1/accounts/${accountId}/inbox_members`, CHATWOOT_API_TOKEN, {
        method: "POST",
        body: JSON.stringify({ inbox_id: Number(company.chatwoot_inbox_id), user_ids: [user.id] }),
      });
    }

    if (Array.isArray(team_ids)) {
      for (const teamId of team_ids) {
        await chatwootFetch(`/api/v1/accounts/${accountId}/teams/${teamId}/team_members`, CHATWOOT_API_TOKEN, {
          method: "POST",
          body: JSON.stringify({ user_ids: [user.id] }),
        });
      }
    }

    return json({ id: user.id, name: user.name, email: user.email });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Erro ao criar atendente" }, 500);
  }
});
