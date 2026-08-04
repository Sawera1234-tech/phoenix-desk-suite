CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  record_label text,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  before_data jsonb,
  after_data jsonb,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_table_record_idx ON public.audit_log (table_name, record_id, created_at DESC);
CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at DESC);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read history"
  ON public.audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can write history"
  ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);