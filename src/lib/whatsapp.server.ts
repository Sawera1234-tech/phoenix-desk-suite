import type { Database } from "@/integrations/supabase/types";

/**
 * WhatsApp Business gateway transport (server-only).
 *
 * Sends invoice messages through the Lovable connector gateway and reconciles
 * delivery status callbacks that arrive on the public webhook route.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/whatsapp";
export const INVOICE_TEMPLATE_NAME = "phoenix_invoice";

const STATUS_RANK: Record<string, number> = { pending: 0, accepted: 0, sent: 1, delivered: 2, read: 3 };

type Admin = import("@supabase/supabase-js").SupabaseClient<Database>;

export function whatsappHeaders(): Record<string, string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["WHATSAPP_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("WhatsApp Business is not connected for this app. Connect it under Connectors → WhatsApp Business first.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

/** E.164 digits only, no leading `+`. Returns null when unusable. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function digitsOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  return digits || null;
}

async function gatewayFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...whatsappHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`WhatsApp gateway request failed [${res.status}]: ${body}`);
  }
  return res;
}

export interface ComposedInvoice {
  shopName: string;
  shopPhone: string | null;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  items: { name: string; quantity: number; unit_price: number; line_total: number }[];
  total: number;
  paid: number;
  balance: number;
  footer: string | null;
}

const rs = (v: number) => `Rs ${(Math.round((Number(v) + Number.EPSILON) * 100) / 100).toLocaleString("en-PK")}`;

export function composeInvoiceText(x: ComposedInvoice): string {
  const lines = x.items.map(
    (i, idx) => `${idx + 1}. ${i.name} × ${i.quantity} — ${rs(i.line_total)}`,
  );
  return [
    `*${x.shopName}*`,
    `Invoice ${x.invoiceNo}`,
    `Date: ${x.invoiceDate}`,
    x.customerName ? `Customer: ${x.customerName}` : null,
    "",
    ...lines,
    "",
    `Total: ${rs(x.total)}`,
    `Paid: ${rs(x.paid)}`,
    `*Balance due: ${rs(x.balance)}*`,
    x.footer ? `\n${x.footer}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** Positional template parameters — must match the created template order. */
export function invoiceTemplateParams(x: ComposedInvoice): string[] {
  const num = (v: number) => (Math.round((Number(v) + Number.EPSILON) * 100) / 100).toFixed(2);
  return [
    x.customerName || "Customer",
    x.invoiceNo,
    x.invoiceDate,
    x.shopName,
    num(x.total),
    num(x.paid),
    num(x.balance),
  ];
}

export async function listApprovedInvoiceTemplate(): Promise<{ name: string; language: string } | null> {
  const res = await gatewayFetch(`/message_templates?limit=50&fields=${encodeURIComponent("name,status,language,components")}`);
  const data = (await res.json()) as { data?: { name: string; status: string; language: string }[] };
  const tpl = (data.data ?? []).find((t) => t.name === INVOICE_TEMPLATE_NAME && t.status === "APPROVED");
  return tpl ? { name: tpl.name, language: tpl.language } : null;
}

export async function sendWhatsAppMessage(
  to: string,
  opts: { text?: string; template?: { name: string; language: string; params: string[] } },
): Promise<string> {
  const payload = opts.template
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: opts.template.name,
          language: { code: opts.template.language },
          components: [
            { type: "body", parameters: opts.template.params.map((text) => ({ type: "text", text })) },
          ],
        },
      }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: opts.text ?? "" } };

  const res = await gatewayFetch(`/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let json: { messages?: { id?: string }[]; error?: { code?: number; message?: string } } = {};
  try {
    json = JSON.parse(raw) as typeof json;
  } catch {
    // non-JSON body
  }
  if (!res.ok) throw new Error(readableSendError(res.status, raw, json));
  const id = json?.messages?.[0]?.id;
  if (!id) throw new Error(`WhatsApp accepted the request but returned no message id: ${raw.slice(0, 300)}`);
  return id;
}

function readableSendError(status: number, raw: string, json: { error?: { code?: number; message?: string } }): string {
  const code = json?.error?.code;
  const msg = json?.error?.message ?? raw.slice(0, 300);
  if (code === 131047) {
    return "This customer has not messaged this WhatsApp number in the last 24 hours, so free-form replies are blocked. Ask the customer to send a message first, or wait for the invoice template to be approved by Meta.";
  }
  if (code === 131026) {
    return "Message was not delivered — the recipient may need to accept the business messaging terms. Ask them to message this number once.";
  }
  return `WhatsApp send failed [${status}]: ${msg}`;
}

interface StatusCallback {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: { message?: string; title?: string }[];
}
interface InboundMessage {
  id?: string;
  from?: string;
  text?: { body?: string };
}
interface MetaWebhookValue {
  statuses?: StatusCallback[];
  messages?: InboundMessage[];
  [key: string]: unknown;
}
interface MetaWebhookPayload {
  entry?: { changes?: { value?: MetaWebhookValue }[] }[];
}

/** Applies a Meta status callback to the outbound message row, monotonically. */
async function applyStatus(
  admin: Admin,
  providerMessageId: string,
  s: Omit<StatusCallback, "id">,
): Promise<void> {
  if (!s?.status) return;
  const ts = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString();

  if (s.status === "failed") {
    const { error } = await admin
      .from("whatsapp_messages")
      .update({
        status: "failed",
        error: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? "Delivery failed",
        status_updated_at: ts,
        updated_at: ts,
      })
      .eq("provider_message_id", providerMessageId);
    if (error) throw new Error(error.message);
    return;
  }

  const rank = STATUS_RANK[s.status];
  if (!rank) return;
  const { data: cur, error: curErr } = await admin
    .from("whatsapp_messages")
    .select("status")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  if (curErr) throw new Error(curErr.message);
  // No outbound row yet — the send path reconciles stored callbacks after it saves the row.
  if (!cur) return;
  if ((STATUS_RANK[cur.status] ?? 0) >= rank) return; // never downgrade delivered/read
  const { error } = await admin
    .from("whatsapp_messages")
    .update({ status: s.status, error: null, status_updated_at: ts, updated_at: ts })
    .eq("provider_message_id", providerMessageId);
  if (error) throw new Error(error.message);
}

/**
 * Replays every stored status callback for a message id. Used by the webhook
 * (as callbacks arrive) and by the send path (for callbacks that arrived
 * before the outbound row was saved).
 */
export async function reconcileStatusCallbacks(admin: Admin, providerMessageId: string): Promise<void> {
  const { data: events, error } = await admin
    .from("whatsapp_webhook_events")
    .select("payload")
    .eq("event", "whatsapp.status")
    .order("received_at", { ascending: true });
  if (error) throw new Error(error.message);
  for (const ev of events ?? []) {
    const value = (ev.payload as { entry?: { changes?: { value?: { statuses?: unknown[] } }[] } } | null)?.entry?.[0]?.changes?.[0]?.value;
    for (const s of (value?.statuses ?? []) as Parameters<typeof applyStatus>[2][]) {
      if (s?.id !== providerMessageId) continue;
      await applyStatus(admin, providerMessageId, s);
    }
  }
}

/** Processes one verified webhook delivery. Unknown events stay stored only. */
export async function processWebhookEvent(
  admin: Admin,
  event: string,
  payload: unknown,
): Promise<void> {
  const value =
    (payload as { entry?: { changes?: { value?: Record<string, unknown> }[] } } | null)?.entry?.[0]?.changes?.[0]?.value ?? {};

  if (event === "whatsapp.status") {
    for (const s of (value.statuses ?? []) as Parameters<typeof applyStatus>[2][]) {
      if (!s?.id) continue;
      await applyStatus(admin, s.id, s);
    }
    return;
  }

  if (event === "whatsapp.message") {
    const messages = (value.messages ?? []) as { id?: string; from?: string; text?: { body?: string } }[];
    for (const m of messages) {
      if (!m?.id) continue;
      const phone = digitsOf(m.from);
      let shopkeeperId: string | null = null;
      if (phone) {
        const { data: sks } = await admin.from("shopkeepers").select("id, phone").limit(500);
        shopkeeperId = (sks ?? []).find((s) => digitsOf(s.phone) === phone)?.id ?? null;
      }
      const { error } = await admin.from("whatsapp_messages").upsert(
        {
          direction: "inbound",
          provider_message_id: m.id,
          shopkeeper_id: shopkeeperId,
          phone,
          body: m.text?.body ?? null,
          status: "received",
        },
        { onConflict: "provider_message_id" },
      );
      if (error) throw new Error(error.message);
    }
    return;
  }

  // whatsapp.message_error, whatsapp.template_status, whatsapp.account_update,
  // history/echoes/state-sync etc. — durably stored in the inbox row already.
}
