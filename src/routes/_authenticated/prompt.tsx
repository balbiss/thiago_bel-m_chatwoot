import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, CreditCard, Sparkles, Wand2, UserRoundSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { useCompany, useInvalidateCompany } from "@/lib/company";
import { PROMPT_TEMPLATES } from "@/lib/prompt-templates";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GradientButton, PageHeader } from "@/components/gradient-button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/prompt")({ component: Page });

function Page() {
  const { data: company, isLoading } = useCompany();
  const invalidateCompany = useInvalidateCompany();
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [waitHours, setWaitHours] = useState(2);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [savingFollowup, setSavingFollowup] = useState(false);
  const [reengajamentoEnabled, setReengajamentoEnabled] = useState(false);
  const [diasInativo, setDiasInativo] = useState(3);
  const [savingReengajamento, setSavingReengajamento] = useState(false);
  const [mercadoPagoToken, setMercadoPagoToken] = useState("");
  const [savingMercadoPago, setSavingMercadoPago] = useState(false);

  useEffect(() => {
    if (company) {
      setPrompt(company.ai_prompt ?? "");
      setWaitHours(company.followup_wait_hours ?? 2);
      setMaxAttempts(company.followup_max_attempts ?? 3);
      setReengajamentoEnabled(company.reengajamento_enabled ?? false);
      setDiasInativo(company.reengajamento_dias_inativo ?? 3);
      setMercadoPagoToken(company.mercadopago_access_token ?? "");
    }
  }, [company]);

  const handleSaveFollowup = async () => {
    if (!company) return;
    setSavingFollowup(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({ followup_wait_hours: waitHours, followup_max_attempts: maxAttempts })
        .eq("id", company.id);
      if (error) throw error;
      invalidateCompany();
      toast.success("Configuração de follow-up salva.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar follow-up");
    } finally {
      setSavingFollowup(false);
    }
  };

  const handleSaveReengajamento = async () => {
    if (!company) return;
    setSavingReengajamento(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({ reengajamento_enabled: reengajamentoEnabled, reengajamento_dias_inativo: diasInativo })
        .eq("id", company.id);
      if (error) throw error;
      invalidateCompany();
      toast.success("Configuração de reengajamento salva.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar reengajamento");
    } finally {
      setSavingReengajamento(false);
    }
  };

  const handleSaveMercadoPago = async () => {
    if (!company) return;
    setSavingMercadoPago(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({ mercadopago_access_token: mercadoPagoToken.trim() || null })
        .eq("id", company.id);
      if (error) throw error;
      invalidateCompany();
      toast.success("Token do Mercado Pago salvo.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar o token do Mercado Pago");
    } finally {
      setSavingMercadoPago(false);
    }
  };

  const replacePrompt = (newPrompt: string) => {
    if (prompt.trim() && !confirm("Isso vai substituir o texto atual do prompt. Continuar?")) {
      return;
    }
    setPrompt(newPrompt);
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast.error("Descreva seu negócio em algumas frases primeiro.");
      return;
    }
    setGenerating(true);
    try {
      const data = await invokeEdgeFunction<{ prompt: string }>("generate-prompt", {
        body: { description: description.trim() },
      });
      replacePrompt(data.prompt);
      toast.success("Prompt gerado — revise e salve quando estiver bom.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar o prompt com IA");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!company) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("companies").update({ ai_prompt: prompt }).eq("id", company.id);
      if (error) throw error;
      invalidateCompany();
      toast.success("Prompt salvo.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar o prompt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Prompt da IA"
        description="Explique como a IA deve se comportar, o tom de voz e as regras de atendimento."
      />
      <div className="max-w-7xl p-8 lg:p-14">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wand2 className="size-4 text-primary" />
                  Não sabe por onde começar?
                </CardTitle>
                <CardDescription>
                  Descreva seu negócio em poucas frases (o que vocês fazem, horário, tipo de atendimento) e a IA escreve um prompt profissional pra você revisar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Ex: Somos uma imobiliária em Curitiba, vendemos e alugamos apartamentos, atendemos de segunda a sábado das 9h às 18h."
                  className="resize-y"
                />
                <div className="mt-3 flex justify-end">
                  <GradientButton onClick={handleGenerate} loading={generating} disabled={isLoading}>
                    <Wand2 className="size-4" />
                    Gerar com IA
                  </GradientButton>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ou comece com um modelo pronto</CardTitle>
                <CardDescription>Escolha o tipo de negócio mais parecido com o seu.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {PROMPT_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => replacePrompt(t.prompt)}
                      className={cn(
                        "rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="size-4 text-primary" />
                  Follow-up automático
                </CardTitle>
                <CardDescription>
                  Se o lead não responder, a IA manda uma mensagem de retomada. Configure o tempo de espera e
                  quantas vezes tentar antes de desistir.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="wait_hours">Espera entre tentativas (horas)</Label>
                    <Input
                      id="wait_hours"
                      type="number"
                      min={1}
                      value={waitHours}
                      onChange={(e) => setWaitHours(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="max_attempts">Número de tentativas</Label>
                    <Input
                      id="max_attempts"
                      type="number"
                      min={0}
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <GradientButton onClick={handleSaveFollowup} loading={savingFollowup} disabled={isLoading}>
                    Salvar follow-up
                  </GradientButton>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserRoundSearch className="size-4 text-primary" />
                  Reengajamento de lead frio
                </CardTitle>
                <CardDescription>
                  Reabre contato com leads que pararam de responder e ainda não foram qualificados nem
                  transferidos pra um humano, depois de alguns dias sem atividade.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                  <Label htmlFor="reengajamento_enabled" className="cursor-pointer">
                    Ativar reengajamento automático
                  </Label>
                  <Switch
                    id="reengajamento_enabled"
                    checked={reengajamentoEnabled}
                    onCheckedChange={setReengajamentoEnabled}
                  />
                </div>
                <div className="mt-3">
                  <Label htmlFor="dias_inativo">Dias sem atividade antes de reengajar</Label>
                  <Input
                    id="dias_inativo"
                    type="number"
                    min={1}
                    value={diasInativo}
                    onChange={(e) => setDiasInativo(Number(e.target.value))}
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <GradientButton onClick={handleSaveReengajamento} loading={savingReengajamento} disabled={isLoading}>
                    Salvar reengajamento
                  </GradientButton>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="size-4 text-primary" />
                  Mercado Pago
                </CardTitle>
                <CardDescription>
                  Ative pagamento automático via Pix: a IA gera a cobrança, confirma o pagamento sozinha e libera
                  o produto — sem você precisar fazer nada manualmente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  <p className="mb-1 font-medium text-foreground">Como configurar:</p>
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>
                      Entre em <span className="font-medium text-foreground">developers.mercadopago.com.br</span> →
                      Suas integrações → sua aplicação → Credenciais.
                    </li>
                    <li>Copie o <span className="font-medium text-foreground">Access Token de produção</span> e cole abaixo.</li>
                    <li>
                      Vá em <span className="font-medium text-foreground">Produtos</span> e ative "Vender com Pix
                      automático" em cada produto que quiser vender assim.
                    </li>
                  </ol>
                  <p className="mt-2 font-medium text-foreground">Como funciona depois de configurado:</p>
                  <ul className="list-disc space-y-1 pl-4">
                    <li>A IA só gera o Pix depois que o cliente confirmar que quer comprar — nunca sozinha.</li>
                    <li>Confere o estoque antes de gerar a cobrança (se tiver zerado, avisa o cliente e não cobra).</li>
                    <li>
                      Você não precisa configurar nada no site do Mercado Pago além do token — o aviso de pagamento
                      é registrado automaticamente a cada cobrança.
                    </li>
                    <li>Quando o Mercado Pago confirma o pagamento, a IA entrega o produto na hora (se for digital) ou avisa o time de vendas (se for físico).</li>
                    <li>Se o cliente não pagar dentro de ~30 minutos, a IA manda um lembrete perguntando se ainda quer comprar.</li>
                  </ul>
                </div>
                <Label htmlFor="mp_token">Access Token</Label>
                <Input
                  id="mp_token"
                  type="password"
                  value={mercadoPagoToken}
                  onChange={(e) => setMercadoPagoToken(e.target.value)}
                  placeholder="APP_USR-..."
                  autoComplete="off"
                />
                <div className="mt-3 flex justify-end">
                  <GradientButton onClick={handleSaveMercadoPago} loading={savingMercadoPago} disabled={isLoading}>
                    Salvar Mercado Pago
                  </GradientButton>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 lg:col-span-7">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" />
                  Instruções para a IA
                </CardTitle>
                <CardDescription>
                  Depois de gerar ou escolher um modelo, ajuste os detalhes (nome da empresa, regras específicas) antes de salvar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isLoading}
                  rows={22}
                  placeholder="Ex: Você é a assistente virtual da Imobiliária XPTO. Seja cordial, responda dúvidas sobre imóveis disponíveis e sempre ofereça agendar uma visita..."
                  className="resize-y font-mono text-[13px] leading-relaxed"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{prompt.length} caracteres</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <GradientButton onClick={handleSave} loading={saving} disabled={isLoading}>
                Salvar prompt
              </GradientButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
