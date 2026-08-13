import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GradientButton, PageHeader } from "@/components/gradient-button";

export const Route = createFileRoute("/admin/")({ component: Page });

type Company = Tables<"companies">;

type CreateCompanyInput = {
  name: string;
  whatsapp_phone: string;
  owner_email: string;
  owner_password: string;
  due_date: string;
};

type UpdateCompanyInput = {
  company_id: string;
  name: string;
  whatsapp_phone: string;
  due_date: string;
};

const EMPTY_FORM: CreateCompanyInput = {
  name: "",
  whatsapp_phone: "",
  owner_email: "",
  owner_password: "",
  due_date: "",
};

async function fetchCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function createCompany(input: CreateCompanyInput) {
  return invokeEdgeFunction("admin-create-company", { body: input });
}

async function updateCompany(input: UpdateCompanyInput) {
  return invokeEdgeFunction("admin-update-company", { body: input });
}

async function deleteCompany(company_id: string) {
  return invokeEdgeFunction("admin-delete-company", { body: { company_id } });
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

function Page() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [form, setForm] = useState<CreateCompanyInput>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<UpdateCompanyInput>({
    company_id: "",
    name: "",
    whatsapp_phone: "",
    due_date: "",
  });

  const { data: companies, isLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: fetchCompanies,
  });

  const createMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: () => {
      toast.success("Empresa criada! Falta escanear o QR code do WhatsApp no Chatwoot.");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao criar empresa"),
  });

  const updateMutation = useMutation({
    mutationFn: updateCompany,
    onSuccess: () => {
      toast.success("Empresa atualizada!");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      setEditing(null);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao atualizar empresa"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCompany,
    onSuccess: () => {
      toast.success("Empresa apagada.");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      setDeleting(null);
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao apagar empresa"),
  });

  const openEdit = (company: Company) => {
    setEditing(company);
    setEditForm({
      company_id: company.id,
      name: company.name ?? "",
      whatsapp_phone: company.whatsapp_phone ?? "",
      due_date: company.due_date ?? "",
    });
  };

  return (
    <div>
      <PageHeader title="Empresas" description="Crie e acompanhe as empresas do painel." />
      <div className="mx-auto max-w-4xl p-6 lg:p-10">
        <div className="mb-6 flex justify-end">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <GradientButton>
                <Plus className="size-4" />
                Nova empresa
              </GradientButton>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar empresa</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate(form);
                }}
                className="flex flex-col gap-4"
              >
                <div>
                  <Label htmlFor="name">Nome da empresa</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="whatsapp_phone">WhatsApp (com DDI, ex: 5511999999999)</Label>
                  <Input
                    id="whatsapp_phone"
                    value={form.whatsapp_phone}
                    onChange={(e) => setForm((f) => ({ ...f, whatsapp_phone: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="owner_email">E-mail de login da empresa</Label>
                  <Input
                    id="owner_email"
                    type="email"
                    value={form.owner_email}
                    onChange={(e) => setForm((f) => ({ ...f, owner_email: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="owner_password">Senha de login da empresa</Label>
                  <Input
                    id="owner_password"
                    type="text"
                    value={form.owner_password}
                    onChange={(e) => setForm((f) => ({ ...f, owner_password: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="due_date">Vencimento (opcional)</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  />
                </div>
                <GradientButton type="submit" loading={createMutation.isPending} className="mt-2">
                  Criar empresa
                </GradientButton>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col gap-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {companies?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma empresa criada ainda.</p>
          )}
          {companies?.map((company) => {
            const overdue = isOverdue(company.due_date);
            return (
              <Card key={company.id} className="flex items-center gap-4 p-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="size-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{company.name || "(sem nome)"}</p>
                    {overdue && (
                      <Badge variant="destructive" className="gap-1 text-xs font-medium">
                        <AlertTriangle className="size-3" />
                        Vencida
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {company.whatsapp_phone || "sem WhatsApp"} · conta #{company.chatwoot_account_id || "-"} · inbox #
                    {company.chatwoot_inbox_id || "-"}
                    {company.due_date ? ` · vence em ${company.due_date}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(company)}
                  className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(company)}
                  className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate(editForm);
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <Label htmlFor="edit_name">Nome da empresa</Label>
              <Input
                id="edit_name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit_whatsapp_phone">WhatsApp (com DDI)</Label>
              <Input
                id="edit_whatsapp_phone"
                value={editForm.whatsapp_phone}
                onChange={(e) => setEditForm((f) => ({ ...f, whatsapp_phone: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit_due_date">Vencimento</Label>
              <Input
                id="edit_due_date"
                type="date"
                value={editForm.due_date}
                onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <GradientButton type="submit" loading={updateMutation.isPending} className="mt-2">
              Salvar
            </GradientButton>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga a conta inteira dessa empresa no Chatwoot (inbox, conversas, times) e o login dela no
              painel. Não tem como desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
