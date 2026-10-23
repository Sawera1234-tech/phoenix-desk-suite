import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sendSchema = z.object({ invoice_id: z.string().uuid() });

/**
 * Sends a saved invoice to the customer's WhatsApp number through the
 * WhatsApp Business gateway. The message, its provider id and every later
 * delivery status are persisted in `whatsapp_messages`.
 */
export const sendInvoiceWhatsAppFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      composeInvoiceText,
      invoiceTemplateParams,
      listApprovedInvoiceTemplate,
      normalizePhone,
      reconcileStatusCallbacks,
      sendWhatsAppMessage,
    } = await import("@/lib/whatsapp.server");
    const admin = supabaseAdmin;

    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id, invoice_no, invoice_date, total, amount_paid, status, shopkeeper_id")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!inv) throw new Error("Invoice not found");

    type ItemRow = {
      quantity: number | null;
      unit_price: number | null;
      subtotal: number | null;
      products: { name: string } | null;
    };
    const { data: items, error: itemsErr } = await admin
      .from("invoice_items")
      .select("quantity, unit_price, subtotal, products(name)")
      .eq("invoice_id", inv.id)
      .order("created_at");
    if (itemsErr) throw new Error(itemsErr.message);

    const { data: sk, error: skErr } = await admin
      .from("shopkeepers")
      .select("id, name, phone")
      .eq("id", inv.shopkeeper_id ?? "")
      .maybeSingle();
    if (skErr) throw new Error(skErr.message);

    const { data: profile } = await admin
      .from("business_profile")
      .select("shop_name, phone, invoice_footer")
      .limit(1)
      .maybeSingle();

    const phone = normalizePhone(sk?.phone);
    if (!phone) {
      throw new Error(
        `Customer "${sk?.name ?? "unknown"}" has no valid phone number. Add a mobile number to their Market Ledger account first.`,
      );
    }

    const total = Number(inv.total ?? 0);
    const paid = Number(inv.amount_paid ?? 0);
    const composed = {
      shopName: profile?.shop_name?.trim() || "Our Shop",
      shopPhone: profile?.phone ?? null,
      invoiceNo: inv.invoice_no,
      invoiceDate: inv.invoice_date,
      customerName: sk?.name ?? "",
      items: (items as ItemRow[] | null ?? []).map((it) => ({
        name: it.products?.name ?? "Item",
        quantity: Number(it.quantity ?? 0),
        unit_price: Number(it.unit_price ?? 0),
        line_total: Number(it.subtotal ?? 0),
      })),
      total,
      paid,
      balance: Math.max(0, total - paid),
      footer: profile?.invoice_footer ?? null,
    };

    const { data: outbox, error: outboxErr } = await admin
      .from("whatsapp_messages")
      .insert({
        direction: "outbound",
        shopkeeper_id: sk?.id ?? null,
        invoice_id: inv.id,
        phone,
        body: composeInvoiceText(composed),
        status: "pending",
      })
      .select("id")
      .single();
    if (outboxErr) throw new Error(`Could not record the message: ${outboxErr.message}`);

    try {
      const tpl = await listApprovedInvoiceTemplate();
      const messageId = tpl
        ? await sendWhatsAppMessage(phone, {
            template: { name: tpl.name, language: tpl.language, params: invoiceTemplateParams(composed) },
          })
        : await sendWhatsAppMessage(phone, { text: composeInvoiceText(composed) });

      await admin
        .from("whatsapp_messages")
        .update({
          provider_message_id: messageId,
          status: "accepted",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", outbox.id);

      // Status callbacks may have arrived before this row existed — replay them.
      await reconcileStatusCallbacks(admin, messageId);

      return {
        ok: true as const,
        message_id: messageId,
        note: tpl
          ? "Sent with the approved invoice template."
          : "Sent as a free-form message (works within 24h of the customer's last message).",
      };
    } catch (e) {
      const message = (e as Error).message;
      await admin
        .from("whatsapp_messages")
        .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
        .eq("id", outbox.id);
      throw new Error(message);
    }
  });
