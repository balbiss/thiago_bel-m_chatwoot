import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eraser, Download, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { useCompany } from "@/lib/company";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { GradientButton, PageHeader } from "@/components/gradient-button";

export const Route = createFileRoute("/_authenticated/leads")({ component: Page });

type Lead = Tables<"leads">;

async function fetchLeads(companyId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("company_id", companyId)
    .order("first_contact_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function toCsv(leads: Lead[]): string {
  const header = "Nome,Telefone,Primeiro contato\n";
  const rows = leads
    .map((l) => `"${(l.name ?? "").replace(/"/g, '""')}",${l.phone},${l.first_contact_at}`)
    .join("\n");
  return header + rows;
}

function downloadCsv(leads: Lead[]) {
  const blob = new Blob([toCsv(leads)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function clearChatMemory(phone: string) {
  await invokeEdgeFunction("clear-chat-memory", { body: { phone } });
}

function Page() {
  const { data: company } = useCompany();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [clearingPhone, setClearingPhone] = useState<string | null>(null);

  const handleClearMemory = async (lead: Lead) => {
    if (!confirm(`Limpar a memória da conversa da IA com "${lead.name || lead.phone}"? A IA vai esquecer todo o histórico dessa conversa.`)) return;
    setClearingPhone(lead.phone);
    try {
      await clearChatMemory(lead.phone);
      toast.success("Memória da IA limpa pra esse contato.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao limpar a memória");
    } finally {
      setClearingPhone(null);
    }
  };

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", company?.id],
    queryFn: () => fetchLeads(company!.id),
    enabled: !!company,
  });

  const filtered = useMemo(() => {
    if (!leads) return [];
    return leads.filter((l) => {
      const date = l.first_contact_at.slice(0, 10);
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    });
  }, [leads, from, to]);

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Nome e telefone de quem já entrou em contato pelo WhatsApp."
      />
      <div className="mx-auto max-w-5xl p-8 lg:p-14">
        <div className="mb-5">
          <StatTile icon={Users} label="Leads no período" value={filtered.length} className="max-w-xs" />
        </div>

        <Card className="mb-5 flex flex-wrap items-end gap-3 p-4">
          <div>
            <Label htmlFor="from">De</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">Até</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <GradientButton onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0} className="ml-auto">
            <Download className="size-4" />
            Baixar CSV
          </GradientButton>
        </Card>

        <div className="flex flex-col gap-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum lead encontrado.</p>
          )}
          {filtered.map((lead) => (
            <Card key={lead.id} className="flex items-center gap-3 p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Users className="size-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{lead.name || "(sem nome)"}</p>
                <p className="text-sm text-muted-foreground">{lead.phone}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(lead.first_contact_at).toLocaleDateString("pt-BR")}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearMemory(lead)}
                disabled={clearingPhone === lead.phone}
                title="Limpar memória da IA com esse contato (útil pra testes)"
              >
                <Eraser className="size-3.5" />
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
