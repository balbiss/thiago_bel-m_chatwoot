ALTER TABLE public.company_documents ADD COLUMN content_text TEXT;
COMMENT ON COLUMN public.company_documents.content_text IS 'Texto extraído do PDF na hora do upload, usado pela IA como base de conhecimento (busca por palavra-chave).';
