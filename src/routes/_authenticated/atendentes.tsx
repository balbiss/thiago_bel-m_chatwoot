import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, CircleAlert } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { useCompany } from "@/lib/company";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GradientButton, PageHeader } from "@/components/gradient-button";

export const Route = createFileRoute("/_authenticated/atendentes")({ component: Page });

type Agent = {
  id: number;
  name: string;
  email: string;
  availability_status: string;
  role: string;
  confirmed: boolean;
};
type Team = { id: number; name: string; member_ids: number[] };

const EMPTY_FORM = { name: "", email: "", password: "" };

function AgentDialog({
  teams,
  open,
  onOpenChange,
  onSaved,
}: {
  teams: Team[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleTeam = (id: number) => {
    setTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      toast.error("Nome, e-mail e senha são obrigatórios.");
      return;
    }
    if (form.password.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (!/[!@#$%^&*()_+\-=[\]{}|\\/.,<>?~]/.test(form.password)) {
      toast.error("A senha precisa ter pelo menos 1 caractere especial (ex: !, @, #, $, %).");
      return;
    }
    setSaving(true);
    try {
      await invokeEdgeFunction("agent-create", {
        body: { name: form.name.trim(), email: form.email.trim(), password: form.password, team_ids: teamIds },
      });
      toast.success("Atendente criado — já pode entrar com o e-mail e senha cadastrados, sem precisar confirmar nada.");
      setForm(EMPTY_FORM);
      setTeamIds([]);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar atendente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo atendente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="a_name">Nome</Label>
            <Input id="a_name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="a_email">E-mail</Label>
            <Input
              id="a_email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="a_password">Senha</Label>
            <Input
              id="a_password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="mt-1.5"
              placeholder="Mínimo 8 caracteres, com 1 caractere especial"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Mínimo 8 caracteres e pelo menos 1 caractere especial (ex: !, @, #, $). Já entra ativo com essa senha
              — não precisa confirmar nenhum e-mail.
            </p>
          </div>
          {teams.length > 0 && (
            <div>
              <Label>Times</Label>
              <div className="mt-1.5 space-y-2 rounded-lg border border-border/60 p-3">
                {teams.map((team) => (
                  <label key={team.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={teamIds.includes(team.id)} onCheckedChange={() => toggleTeam(team.id)} />
                    {team.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <GradientButton onClick={handleSave} loading={saving}>
            Criar atendente
          </GradientButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Page() {
  const { data: company } = useCompany();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["agents", company?.id],
    queryFn: async () => invokeEdgeFunction<{ agents: Agent[]; teams: Team[] }>("agent-list"),
    enabled: !!company?.id,
  });

  const agents = data?.agents ?? [];
  const teams = data?.teams ?? [];

  const teamsFor = (agentId: number) => teams.filter((t) => t.member_ids.includes(agentId)).map((t) => t.name);

  const handleRemove = async (agent: Agent) => {
    if (!confirm(`Desligar "${agent.name}"? Ele deixa de aparecer pra ser atribuído em conversas.`)) return;
    try {
      await invokeEdgeFunction("agent-remove", { body: { agent_id: agent.id } });
      queryClient.invalidateQueries({ queryKey: ["agents", company?.id] });
      toast.success("Atendente desligado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desligar atendente");
    }
  };

  return (
    <div>
      <PageHeader
        title="Atendentes"
        description="Cadastre e desligue quem atende no seu WhatsApp — já entra ativo, sem precisar confirmar e-mail."
      />
      <div className="max-w-7xl p-8 lg:p-14">
        <div className="mb-5 flex justify-end">
          <GradientButton onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Novo atendente
          </GradientButton>
        </div>

        {!isLoading && agents.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum atendente cadastrado ainda.</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{agent.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{agent.email}</p>
                </div>
                {agent.role !== "administrator" && (
                  <Button variant="outline" size="sm" onClick={() => handleRemove(agent)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  {agent.availability_status === "online" ? "Online" : "Offline"}
                </Badge>
                {agent.role === "administrator" && (
                  <Badge variant="outline" className="text-[10px]">
                    Administrador
                  </Badge>
                )}
                {!agent.confirmed && (
                  <Badge variant="outline" className="gap-1 text-[10px] text-destructive">
                    <CircleAlert className="size-3" />
                    Pendente de ativação
                  </Badge>
                )}
                {teamsFor(agent.id).map((name) => (
                  <Badge key={name} variant="outline" className="text-[10px]">
                    {name}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <AgentDialog
        teams={teams}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["agents", company?.id] })}
      />
    </div>
  );
}
