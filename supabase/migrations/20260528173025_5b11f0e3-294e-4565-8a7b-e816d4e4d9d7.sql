CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_name TEXT NOT NULL DEFAULT '',
  exam_date TEXT NOT NULL DEFAULT '',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  main_goal TEXT NOT NULL DEFAULT '',
  body_classification TEXT NOT NULL DEFAULT '',
  pdf_file_name TEXT NOT NULL DEFAULT '',
  body_composition JSONB,
  clinical_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_generated_at ON public.reports (generated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view reports"
  ON public.reports FOR SELECT
  USING (true);

CREATE POLICY "Public can insert reports"
  ON public.reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update reports"
  ON public.reports FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete reports"
  ON public.reports FOR DELETE
  USING (true);