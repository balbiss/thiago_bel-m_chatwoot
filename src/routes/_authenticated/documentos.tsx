import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileText, Pencil, Trash2, Upload, Video, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { useCompany } from "@/lib/company";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GradientButton, PageHeader } from "@/components/gradient-button";

export const Route = createFileRoute("/_authenticated/documentos")({ component: Page });

function Page() {
  const { data: company } = useCompany();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const { data: documents, isLoading } = useQuery({
    queryKey: ["company-documents", company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_documents")
        .select("*")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });

  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const handleUpload = async (file: File) => {
    if (!company) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error(
        `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). O limite atual é 50MB — vídeos maiores que isso precisam ser comprimidos antes, ou fale com o suporte para aumentar esse limite.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "-");
      const path = `${company.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("company-documents").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: signed } = await supabase.storage.from("company-documents").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      const file_url = signed?.signedUrl ?? path;

      const { data: inserted, error } = await supabase
        .from("company_documents")
        .insert({
          company_id: company.id,
          title: file.name.replace(/\.[a-z0-9]+$/i, ""),
          file_url,
          content_type: file.type || "application/pdf",
        })
        .select("id")
        .single();
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["company-documents", company.id] });
      toast.success("Documento enviado.");

      const isPdf = (file.type || "").includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf && inserted) {
        invokeEdgeFunction("process-document", { body: { document_id: inserted.id } })
          .then(() => {
            toast.success("A IA já leu o conteúdo desse PDF — pode consultar pra responder clientes.");
            queryClient.invalidateQueries({ queryKey: ["company-documents", company.id] });
          })
          .catch(() =>
            toast.error("O PDF foi enviado, mas não consegui ler o conteúdo dele automaticamente."),
          );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar o documento");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const saveRename = async (id: string) => {
    if (!editingTitle.trim()) {
      toast.error("O nome não pode ficar vazio.");
      return;
    }
    const { error } = await supabase.from("company_documents").update({ title: editingTitle.trim() }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["company-documents", company?.id] });
    toast.success("Nome atualizado.");
    cancelRename();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este documento?")) return;
    const { error } = await supabase.from("company_documents").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["company-documents", company?.id] });
    toast.success("Documento removido.");
  };

  return (
    <div>
      <PageHeader
        title="Documentos"
        description="PDFs: a IA lê o conteúdo e consulta pra responder dúvidas dos clientes. Vídeos: a IA pode identificar pelo nome e enviar durante o atendimento."
      />
      <div className="max-w-4xl p-8 lg:p-14">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
        <GradientButton onClick={() => fileInputRef.current?.click()} loading={uploading}>
          <Upload className="size-4" />
          Enviar PDF ou vídeo
        </GradientButton>
        <p className="mt-2 text-xs text-muted-foreground">
          Tamanho máximo: 50MB por arquivo — em vídeos isso costuma dar entre 1 e 3 minutos, dependendo da
          qualidade da gravação. Se passar do limite, grave em resolução menor ou comprima antes de enviar.
        </p>

        <div className="mt-6 space-y-2">
          {!isLoading && documents?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum documento enviado ainda.</p>
          )}
          {documents?.map((doc) => {
            const isVideo = doc.content_type?.startsWith("video/");
            const Icon = isVideo ? Video : FileText;
            return (
              <Card key={doc.id} className="flex items-center justify-between gap-3 p-4">
                {editingId === doc.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <Input
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(doc.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                      autoFocus
                      className="h-8"
                    />
                    <Button variant="ghost" size="icon" onClick={() => saveRename(doc.id)}>
                      <Check className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={cancelRename}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center gap-3 hover:underline">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium">{doc.title}</span>
                      <span className="text-xs text-muted-foreground">{isVideo ? "vídeo" : "PDF"}</span>
                      {!isVideo && (
                        <span className={`text-xs ${doc.content_text ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {doc.content_text ? "· IA já leu" : "· processando..."}
                        </span>
                      )}
                    </a>
                    <Button variant="ghost" size="icon" onClick={() => startRename(doc.id, doc.title)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
