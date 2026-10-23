CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  provider_message_id text UNIQUE,
  shopkeeper_id uuid REFERENCES public.shopkeepers(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  phone text,
  body text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  sent_at timestamptz,
  status_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_messages_shopkeeper ON public.whatsapp_messages(shopkeeper_id);
CREATE INDEX idx_whatsapp_messages_invoice ON public.whatsapp_messages(invoice_id);
CREATE INDEX idx_whatsapp_messages_status ON public.whatsapp_messages(status) WHERE status = 'pending';
CREATE INDEX idx_whatsapp_events_unprocessed ON public.whatsapp_webhook_events(received_at) WHERE processed_at IS NULL;

GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;

ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read whatsapp inbox"
  ON public.whatsapp_webhook_events FOR SELECT TO authenticated USING (true);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read whatsapp messages"
  ON public.whatsapp_messages FOR SELECT TO authenticated USING (true);
