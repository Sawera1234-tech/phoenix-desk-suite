
-- 1. Payments register -------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.payment_no_seq;

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_no text NOT NULL UNIQUE DEFAULT ('PAY-' || lpad(nextval('public.payment_no_seq')::text, 5, '0')),
  shopkeeper_id uuid NOT NULL REFERENCES public.shopkeepers(id) ON DELETE RESTRICT,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.payment_no_seq TO authenticated;
GRANT ALL ON SEQUENCE public.payment_no_seq TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY pay_select ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY pay_insert ON public.payments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY pay_admin_update ON public.payments FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY pay_admin_delete ON public.payments FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER touch_pay BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE INDEX IF NOT EXISTS payments_shopkeeper_idx ON public.payments(shopkeeper_id, payment_date);
CREATE INDEX IF NOT EXISTS ledger_entries_shopkeeper_idx ON public.ledger_entries(shopkeeper_id, entry_date);

-- 2. Deterministic ledger recalculation --------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_shopkeeper_ledger(_shopkeeper_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opening numeric(14,2);
  net numeric(14,2);
BEGIN
  IF _shopkeeper_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(opening_balance, 0) INTO opening
  FROM public.shopkeepers WHERE id = _shopkeeper_id;
  IF NOT FOUND THEN RETURN; END IF;

  WITH ordered AS (
    SELECT id,
      SUM(CASE WHEN entry_type = 'debit' THEN amount
               WHEN entry_type IN ('credit', 'payment') THEN -amount
               ELSE 0 END)
      OVER (ORDER BY entry_date, created_at, id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum
    FROM public.ledger_entries
    WHERE shopkeeper_id = _shopkeeper_id
  )
  UPDATE public.ledger_entries le
  SET balance_after = opening + o.cum
  FROM ordered o
  WHERE le.id = o.id AND le.balance_after IS DISTINCT FROM opening + o.cum;

  SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount
                           WHEN entry_type IN ('credit', 'payment') THEN -amount
                           ELSE 0 END), 0)
  INTO net FROM public.ledger_entries WHERE shopkeeper_id = _shopkeeper_id;

  UPDATE public.shopkeepers SET current_balance = opening + net WHERE id = _shopkeeper_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_shopkeeper_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_shopkeeper_ledger(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_ledger_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.recalc_shopkeeper_ledger(OLD.shopkeeper_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recalc_shopkeeper_ledger(NEW.shopkeeper_id);
  END IF;
  RETURN NULL;
END;
$$;

-- old incremental balance trigger is replaced by the recalc engine
DROP TRIGGER IF EXISTS ledger_balance ON public.ledger_entries;

DROP TRIGGER IF EXISTS ledger_recalc_ins ON public.ledger_entries;
CREATE TRIGGER ledger_recalc_ins AFTER INSERT ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_ledger_recalc();

DROP TRIGGER IF EXISTS ledger_recalc_del ON public.ledger_entries;
CREATE TRIGGER ledger_recalc_del AFTER DELETE ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_ledger_recalc();

DROP TRIGGER IF EXISTS ledger_recalc_upd ON public.ledger_entries;
CREATE TRIGGER ledger_recalc_upd AFTER UPDATE OF amount, entry_type, entry_date, shopkeeper_id
ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_ledger_recalc();

-- recalc when a customer's opening balance changes
CREATE OR REPLACE FUNCTION public.tg_shopkeeper_opening_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_shopkeeper_ledger(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS shopkeeper_opening_recalc ON public.shopkeepers;
CREATE TRIGGER shopkeeper_opening_recalc AFTER UPDATE OF opening_balance ON public.shopkeepers
FOR EACH ROW EXECUTE FUNCTION public.tg_shopkeeper_opening_recalc();

-- 3. Payments keep their ledger entry in sync --------------------------------
CREATE OR REPLACE FUNCTION public.tg_payment_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.ledger_entries
    WHERE reference_type = 'payment' AND reference_id = OLD.id;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ledger_entries
      (shopkeeper_id, entry_date, entry_type, description, amount, reference_type, reference_id, created_by)
    VALUES (NEW.shopkeeper_id, NEW.payment_date, 'payment',
      'Payment ' || NEW.payment_no || COALESCE(' (' || NEW.method || ')', ''),
      NEW.amount, 'payment', NEW.id, NEW.created_by);
    RETURN NEW;
  END IF;

  UPDATE public.ledger_entries
  SET shopkeeper_id = NEW.shopkeeper_id,
      entry_date = NEW.payment_date,
      amount = NEW.amount,
      description = 'Payment ' || NEW.payment_no || COALESCE(' (' || NEW.method || ')', '')
  WHERE reference_type = 'payment' AND reference_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_ledger ON public.payments;
CREATE TRIGGER payment_ledger AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.tg_payment_ledger();

-- 4. Unique invoice numbers ---------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_no_key ON public.invoices(invoice_no);

-- 5. Normalise existing balances ---------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.shopkeepers LOOP
    PERFORM public.recalc_shopkeeper_ledger(r.id);
  END LOOP;
END $$;
