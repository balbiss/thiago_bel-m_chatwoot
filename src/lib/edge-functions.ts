// supabase-js sempre reporta erros de Edge Function com a mesma mensagem genérica
// ("Edge Function returned a non-2xx status code"), mesmo quando a function devolve
// um corpo JSON explicando o motivo real (ver `return json({ error: "..." }, 500)`
// em cada função). A mensagem de verdade só existe em `error.context`, que é o
// próprio Response da chamada HTTP — precisa ser lido e parseado à parte.
// Sem isso, todo erro de Edge Function aparece pro usuário (e pra quem debuga)
// como "Edge Function returned a non-2xx status code", sem nenhuma pista do que
// falhou de verdade (auth, validação, chamada pro Chatwoot, etc.).
import { supabase } from "@/integrations/supabase/client";

async function extractServerMessage(error: unknown): Promise<string | undefined> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!context || typeof context !== "object" || !("json" in context)) return undefined;
  try {
    const body = await (context as Response).clone().json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    try {
      const text = await (context as Response).clone().text();
      if (text) return text;
    } catch {
      // resposta não tem corpo legível, mantém undefined
    }
  }
  return undefined;
}

export async function invokeEdgeFunction<T = unknown>(
  name: string,
  options?: Parameters<typeof supabase.functions.invoke>[1],
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, options);
  if (error) {
    const serverMessage = await extractServerMessage(error);
    throw new Error(serverMessage ?? error.message ?? "Erro ao chamar o servidor");
  }
  if (data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string") {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}
