ALTER TABLE public.companies ADD COLUMN website_url TEXT;
COMMENT ON COLUMN public.companies.website_url IS 'Site oficial da empresa (opcional). Usado pela IA quando o cliente pede um link — nunca inventar um se estiver vazio.';
