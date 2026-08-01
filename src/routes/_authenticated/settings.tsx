import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings · Project Phoenix" }] }),
  component: SettingsPage,
});

type Profile = {
  id: string;
  shop_name: string;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  tax_rate: number;
  invoice_footer: string | null;
};

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["business_profile"],
    queryFn: async () => {
      const { data } = await supabase.from("business_profile").select("*").limit(1).maybeSingle();
      return data as Profile | null;
    },
  });

  const [form, setForm] = useState<Partial<Profile>>({});
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        shop_name: form.shop_name?.trim() || "My Shop",
        owner_name: form.owner_name || null,
        phone: form.phone || null,
        address: form.address || null,
        currency: form.currency || "PKR",
        tax_rate: Number(form.tax_rate) || 0,
        invoice_footer: form.invoice_footer || null,
      };
      if (data?.id) {
        const { error } = await supabase.from("business_profile").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("business_profile").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Business profile saved"); qc.invalidateQueries({ queryKey: ["business_profile"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Settings" subtitle="Business Profile">
      <div className="mx-auto max-w-3xl space-y-6 p-6 xl:p-8">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-[14px] font-semibold text-foreground">Business Profile</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">Appears on invoices and reports.</p>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Shop Name *</Label><Input value={form.shop_name ?? ""} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Owner Name</Label><Input value={form.owner_name ?? ""} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Currency</Label><Input value={form.currency ?? "PKR"} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Tax Rate (%)</Label><Input type="number" step="0.01" value={form.tax_rate ?? 0} onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Address</Label><Textarea rows={2} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Invoice Footer</Label><Textarea rows={2} value={form.invoice_footer ?? ""} onChange={(e) => setForm({ ...form, invoice_footer: e.target.value })} placeholder="Thank you for your business!" /></div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button>
          </div>
        </section>

        <BackupPanel />
      </div>

    </AppShell>
  );
}
