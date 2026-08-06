
REVOKE ALL ON FUNCTION public.tg_ledger_recalc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_payment_ledger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_shopkeeper_opening_recalc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_shopkeeper_ledger(uuid) FROM PUBLIC, anon;
