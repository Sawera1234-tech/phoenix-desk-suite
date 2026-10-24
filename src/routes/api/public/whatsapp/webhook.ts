import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest, WebhookError } from "@lovable.dev/webhooks-js";

/**
 * WhatsApp Business webhook receiver (Meta → Lovable → this app).
 * Every delivery is signature-verified, durably stored, then processed
 * idempotently. Failures return 5xx so the gateway retries the same delivery.
 */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          const verified = await verifyWebhookRequest({
            req: request,
            secret: process.env["WHATSAPP_API_KEY"],
            maxBodyBytes: 4 * 1024 * 1024,
          });
          payload = verified.payload;
        } catch (e) {
          if (e instanceof WebhookError) {
            console.error(`WhatsApp webhook verification failed: ${e.code}`);
            return new Response("Invalid webhook signature", { status: 401 });
          }
          throw e;
        }

        const deliveryId = request.headers.get("X-Lovable-Delivery") ?? "";
        const event = request.headers.get("X-Lovable-Event") ?? "";
        if (!deliveryId || !event) {
          return new Response("Missing delivery headers", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin;

        // Durable receipt — a failed write must never return 200.
        const { data: existing, error: dupErr } = await admin
          .from("whatsapp_webhook_events")
          .select("id, processed_at")
          .eq("delivery_id", deliveryId)
          .maybeSingle();
        if (dupErr) {
          console.error(`WhatsApp inbox read failed: ${dupErr.message}`);
          return new Response("Inbox write failed", { status: 500 });
        }
        if (existing?.processed_at) return new Response("ok");
        if (!existing) {
          const { error: insErr } = await admin.from("whatsapp_webhook_events").insert({
            delivery_id: deliveryId,
            event,
            payload: payload as never,
          });
          if (insErr) {
            console.error(`WhatsApp inbox write failed: ${insErr.message}`);
            return new Response("Inbox write failed", { status: 500 });
          }
        }

        try {
          const { processWebhookEvent } = await import("@/lib/whatsapp.server");
          await processWebhookEvent(admin, event, payload);
          const { error: updErr } = await admin
            .from("whatsapp_webhook_events")
            .update({ processed_at: new Date().toISOString(), processing_error: null })
            .eq("delivery_id", deliveryId);
          if (updErr) throw new Error(updErr.message);
          return new Response("ok");
        } catch (procErr) {
          const message = String((procErr as Error)?.message ?? procErr);
          console.error(`WhatsApp webhook processing failed (${deliveryId}): ${message}`);
          await admin
            .from("whatsapp_webhook_events")
            .update({ processing_error: message })
            .eq("delivery_id", deliveryId);
          return new Response("Processing failed", { status: 500 });
        }
      },
    },
  },
});
