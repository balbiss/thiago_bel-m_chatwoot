// Sem nenhuma lib externa de propósito: deploy direto via API de management
// (sem a CLI local, que precisaria de espaço em disco que não tínhamos) roda
// com --no-remote e não resolve NENHUM import remoto (jsr:, npm:, https://,
// nem std do Deno) — confirmado ao vivo 2026-08-13 testando várias formas.
// Por isso o extrator de texto de PDF abaixo é escrito na mão, só com Web
// APIs nativas do runtime (DecompressionStream pra FlateDecode). Cobre bem
// PDFs "de texto" simples (Word/Google Docs exportado etc.) com fontes
// simples — não lida com PDF escaneado (imagem) nem fontes CID/Type0
// complexas, mas é isso ou nada dado o limite do ambiente de deploy.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_CHARS = 60_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function bytesToLatin1(bytes: Uint8Array): string {
  let s = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return s;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  writer.write(bytes as BufferSource);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// PDFs costumam encadear filtros, ex: /Filter [ /ASCII85Decode /FlateDecode ]
// — primeiro decodifica de ASCII85 (texto imprimível) pra binário, depois
// aplica o filtro seguinte (normalmente FlateDecode) nesse binário.
function decodeAscii85(bytes: Uint8Array): Uint8Array {
  let s = bytesToLatin1(bytes).trim();
  if (s.endsWith("~>")) s = s.slice(0, -2);
  s = s.replace(/\s+/g, "");
  const out: number[] = [];
  let group: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "z" && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(s.charCodeAt(i) - 33);
    if (group.length === 5) {
      let val = 0;
      for (const g of group) val = val * 85 + g;
      out.push((val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff);
      group = [];
    }
  }
  if (group.length > 0) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let val = 0;
    for (const g of group) val = val * 85 + g;
    const tail = [(val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff];
    out.push(...tail.slice(0, n - 1));
  }
  return new Uint8Array(out);
}

function unescapePdfString(s: string): string {
  return s.replace(/\\(\d{1,3}|.)/gs, (_match, esc: string) => {
    if (/^\d+$/.test(esc)) return String.fromCharCode(parseInt(esc, 8));
    if (esc === "n") return "\n";
    if (esc === "r") return "\r";
    if (esc === "t") return "\t";
    if (esc === "(" || esc === ")" || esc === "\\") return esc;
    return "";
  });
}

// Operadores de texto do content stream: "(...)Tj" e "[(...) -123 (...)]TJ".
function extractTextFromContentStream(content: string): string {
  let out = "";
  const re = /\(((?:\\.|[^()\\])*)\)\s*Tj|\[((?:[^[\]]|\\.)*)\]\s*TJ/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m[1] !== undefined) {
      out += unescapePdfString(m[1]) + " ";
    } else if (m[2] !== undefined) {
      const strRe = /\(((?:\\.|[^()\\])*)\)/gs;
      let sm: RegExpExecArray | null;
      while ((sm = strRe.exec(m[2]))) out += unescapePdfString(sm[1]);
      out += " ";
    }
  }
  return out;
}

// Acha cada bloco "<<dict>> stream ... endstream" cru no PDF (heurística
// simples, sem parser de objeto PDF completo — suficiente pra achar os
// content streams das páginas na grande maioria dos PDFs gerados por
// exportação normal, não escaneados).
function extractStreams(raw: string, rawBytes: Uint8Array): { dict: string; data: Uint8Array }[] {
  const streams: { dict: string; data: Uint8Array }[] = [];
  let idx = 0;
  for (;;) {
    const streamIdx = raw.indexOf("stream", idx);
    if (streamIdx === -1) break;
    const dictEnd = raw.lastIndexOf(">>", streamIdx);
    const dictStart = raw.lastIndexOf("<<", dictEnd);
    const dict = dictStart !== -1 && dictEnd !== -1 ? raw.slice(dictStart, dictEnd + 2) : "";
    let dataStart = streamIdx + "stream".length;
    if (raw[dataStart] === "\r") dataStart++;
    if (raw[dataStart] === "\n") dataStart++;
    const endIdx = raw.indexOf("endstream", dataStart);
    if (endIdx === -1) break;
    streams.push({ dict, data: rawBytes.subarray(dataStart, endIdx) });
    idx = endIdx + "endstream".length;
  }
  return streams;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const raw = bytesToLatin1(bytes);
  const streams = extractStreams(raw, bytes);
  let text = "";
  for (const { dict, data } of streams) {
    // Streams de imagem/fonte (DCTDecode, CCITTFaxDecode etc.) não são texto — pula.
    if (/\/Filter\s*\/(DCTDecode|CCITTFaxDecode|JPXDecode|JBIG2Decode)/.test(dict)) continue;
    try {
      let bin = data;
      if (/\/ASCII85Decode/.test(dict)) bin = decodeAscii85(bin);
      if (/\/FlateDecode/.test(dict)) bin = await inflate(bin);
      const content = bytesToLatin1(bin);
      const extracted = extractTextFromContentStream(content);
      if (extracted.trim()) text += extracted + "\n";
    } catch {
      // stream corrompido ou filtro não suportado — ignora e segue
    }
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { document_id } = await req.json();
    if (!document_id) return json({ error: "document_id é obrigatório" }, 400);

    const docRes = await fetch(
      `${SUPABASE_URL}/rest/v1/company_documents?select=id,file_url,content_type,title&id=eq.${document_id}`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    if (!docRes.ok) throw new Error("Falha ao buscar documento");
    const doc = (await docRes.json())[0];
    if (!doc) return json({ error: "Documento não encontrado" }, 404);

    const isPdf = (doc.content_type || "").includes("pdf") || doc.file_url.toLowerCase().includes(".pdf");
    if (!isPdf) {
      return json({ ok: true, skipped: true, reason: "Não é PDF, nada pra extrair." });
    }

    const fileRes = await fetch(doc.file_url);
    if (!fileRes.ok) throw new Error(`Não consegui baixar o arquivo (${fileRes.status})`);
    const bytes = new Uint8Array(await fileRes.arrayBuffer());

    const contentText = (await extractPdfText(bytes)).slice(0, MAX_CHARS);

    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/company_documents?id=eq.${document_id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ content_text: contentText || null }),
    });
    if (!updateRes.ok) throw new Error("Falha ao salvar o texto extraído");

    return json({ ok: true, chars_extracted: contentText.length });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Erro ao processar documento" }, 500);
  }
});
