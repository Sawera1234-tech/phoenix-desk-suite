ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) NOT NULL DEFAULT 0;

CREATE SEQUENCE IF NOT EXISTS public.supplier_payment_no_seq;

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_no text NOT NULL DEFAULT ('SPAY-' || lpad(nextval('public.supplier_payment_no_seq')::text, 5, '0')),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.supplier_payment_no_seq TO authenticated;
GRANT ALL ON SEQUENCE public.supplier_payment_no_seq TO service_role;

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY sp_select ON public.supplier_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY sp_insert ON public.supplier_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY sp_admin_update ON public.supplier_payments FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY sp_admin_delete ON public.supplier_payments FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx ON public.supplier_payments (supplier_id, payment_date);

CREATE TRIGGER touch_sp BEFORE UPDATE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();