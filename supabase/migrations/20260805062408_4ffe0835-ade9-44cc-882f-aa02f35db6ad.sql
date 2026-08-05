CREATE TABLE public.demand_manual_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  code text NOT NULL DEFAULT 'MANUAL',
  unit text NOT NULL DEFAULT 'pcs',
  quantity integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_manual_items TO authenticated;
GRANT ALL ON public.demand_manual_items TO service_role;

ALTER TABLE public.demand_manual_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY dmi_select ON public.demand_manual_items FOR SELECT TO authenticated USING (true);
CREATE POLICY dmi_insert ON public.demand_manual_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY dmi_update ON public.demand_manual_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY dmi_delete ON public.demand_manual_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TRIGGER touch_dmi BEFORE UPDATE ON public.demand_manual_items
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();