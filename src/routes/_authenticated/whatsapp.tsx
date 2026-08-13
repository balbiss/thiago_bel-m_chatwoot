import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, QrCode, Smartphone } from "lucide-react";
import { useCompany } from "@/lib/company";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradientButton, PageHeader } from "@/components/gradient-button";

export const Route = createFileRoute("/_authenticated/whatsapp")({ component: Page });

// Domínio fixo do Chatwoot dessa instância (kit "SaaS do Thiago" — flowqi).
const CHATWOOT_BASE_URL = "https://chat.flowqi.com.br";

function Page() {
  const { data: company } = useCompany();

  const connected = !!company?.whatsapp_phone;
  const inboxSettingsUrl =
    company?.chatwoot_account_id && company?.chatwoot_inbox_id
      ? `${CHATWOOT_BASE_URL}/app/accounts/${company.chatwoot_account_id}/settings/inboxes/${company.chatwoot_inbox_id}`
      : `${CHATWOOT_BASE_URL}/app/accounts/${company?.chatwoot_account_id ?? ""}/settings/inboxes/list`;

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        description="Conecte ou reconecte o número que a IA usa pra atender seus clientes."
      />
      <div className="mx-auto max-w-2xl p-6 lg:p-10">
        <Card className="flex items-start gap-4 p-6">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Smartphone className="size-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold">{company?.whatsapp_phone || "Nenhum número conectado ainda"}</p>
              <Badge variant="outline" className={connected ? "text-emerald-600" : "text-destructive"}>
                {connected ? "Cadastrado" : "Pendente"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Pra conectar (ou reconectar depois de trocar de celular, ficar sem internet, etc.), abra as
              configurações do WhatsApp no Chatwoot e escaneie o QR Code com o app do seu celular — igual conectar o
              WhatsApp Web.
            </p>
            <a href={inboxSettingsUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block">
              <GradientButton type="button">
                <QrCode className="size-4" />
                Abrir QR Code no Chatwoot
                <ExternalLink className="size-3.5" />
              </GradientButton>
            </a>
          </div>
        </Card>

        <p className="mt-4 text-xs text-muted-foreground">
          Você entra automaticamente porque sua conta já tem acesso de administrador nesse Chatwoot. Se a página
          pedir login, use o mesmo e-mail e senha que você usa aqui no painel.
        </p>
      </div>
    </div>
  );
}
