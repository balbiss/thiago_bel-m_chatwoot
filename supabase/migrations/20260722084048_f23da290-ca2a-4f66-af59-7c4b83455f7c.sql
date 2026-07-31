
-- Recria templates/deals/research/user_settings com RLS por user_id (a migration
-- inicial as criou sem auth, "public all"). DROP explicito porque nao ha dados
-- reais ainda em nenhuma instalacao nova do kit.
DROP TABLE IF EXISTS public.research CASCADE;
DROP TABLE IF EXISTS public.deals CASCADE;
DROP TABLE IF EXISTS public.templates CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.report_templates CASCADE;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  industry TEXT,
  icon TEXT,
  color_theme TEXT DEFAULT 'orange',
  parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  returns JSONB NOT NULL DEFAULT '[]'::jsonb,
  formulas JSONB NOT NULL DEFAULT '[]'::jsonb,
  outputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  scenarios JSONB NOT NULL DEFAULT '{"conservative":0.75,"expected":1,"optimistic":1.25}'::jsonb,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates select own" ON public.templates FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "templates insert own" ON public.templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "templates update own" ON public.templates FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "templates delete own" ON public.templates FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX templates_user_id_idx ON public.templates(user_id);
CREATE TRIGGER trg_templates_touch BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Deal',
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  prospect_company TEXT,
  prospect_logo_url TEXT,
  prospect_brand JSONB,
  color_theme TEXT DEFAULT 'orange',
  scenario TEXT NOT NULL DEFAULT 'expected',
  values JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_snapshot JSONB,
  ai_summary TEXT,
  ai_talking_points JSONB,
  report JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deals select own" ON public.deals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "deals insert own" ON public.deals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "deals update own" ON public.deals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "deals delete own" ON public.deals FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX deals_user_id_idx ON public.deals(user_id);
CREATE TRIGGER trg_deals_touch BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'fast',
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research TO authenticated;
GRANT ALL ON public.research TO service_role;
ALTER TABLE public.research ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research select own" ON public.research FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "research insert own" ON public.research FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "research update own" ON public.research FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "research delete own" ON public.research FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX research_user_id_idx ON public.research(user_id);

CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  product_description TEXT,
  default_currency TEXT DEFAULT 'USD',
  default_template_id UUID,
  scenario_multipliers JSONB DEFAULT '{"conservative":0.75,"expected":1,"optimistic":1.25}'::jsonb,
  preferences JSONB DEFAULT '{}'::jsonb,
  brand_logo_url TEXT,
  brand_primary_color TEXT DEFAULT '#0F0F0F',
  brand_tagline TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings select own" ON public.user_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "settings insert own" ON public.user_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings update own" ON public.user_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings delete own" ON public.user_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX user_settings_user_id_idx ON public.user_settings(user_id);
CREATE TRIGGER trg_settings_touch BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled report template',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO authenticated;
GRANT ALL ON public.report_templates TO service_role;
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_templates select own" ON public.report_templates FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "report_templates insert own" ON public.report_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "report_templates update own" ON public.report_templates FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "report_templates delete own" ON public.report_templates FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX report_templates_user_id_idx ON public.report_templates(user_id);
CREATE TRIGGER report_templates_touch_updated_at BEFORE UPDATE ON public.report_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage policies para bucket 'logos'
CREATE POLICY "logos authenticated read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'logos');
CREATE POLICY "logos authenticated write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logos');
CREATE POLICY "logos authenticated update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'logos') WITH CHECK (bucket_id = 'logos');
CREATE POLICY "logos authenticated delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'logos');
