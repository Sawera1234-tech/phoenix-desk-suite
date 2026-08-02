ALTER TABLE public.products ADD COLUMN IF NOT EXISTS max_stock numeric NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pcs';
ALTER TABLE public.daily_usage ADD COLUMN IF NOT EXISTS unit_price numeric;
ALTER TABLE public.daily_usage ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;