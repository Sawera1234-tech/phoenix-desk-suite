import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/daily-usage")({
  head: () => ({ meta: [{ title: "Daily Usage · Project Phoenix" }] }),
  component: UsagePage,
});

type Row = {
  id: string;
  usage_date: string;
  quantity: number;
  notes: string | null;
  product: { code: string; name: string } | null;
};

function UsagePage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["daily-usage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_usage")
        .select("id, usage_date, quantity, notes, product:products(code, name)")
        .order("usage_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const flat = useMemo(
    () => data.map((r) => ({ ...r, product_code: r.product?.code ?? "", product_name: r.product?.name ?? "" })),
    [data],
  );

  return (
    <AppShell title="Daily Usage" subtitle="Repair Consumption Log">
      <div className="mx-auto max-w-[1400px] space-y-4 p-6 xl:p-8">
        <DataTable
          rows={flat}
          rowKey={(r) => r.id}
          searchKeys={["product_code", "product_name", "notes"]}
          searchPlaceholder="Search product or note…"
          initialSort={{ key: "usage_date", dir: "desc" }}
          actions={<NewUsageDialog onCreated={() => qc.invalidateQueries({ queryKey: ["daily-usage"] })} />}
          emptyMessage="No usage recorded yet."
          columns={[
            { key: "usage_date", label: "Date", render: (r) => fmtDate(r.usage_date) },
            { key: "product_code", label: "Code", render: (r) => <span className="font-mono text-[12px] font-semibold">{r.product_code}</span> },
            { key: "product_name", label: "Product" },
            { key: "quantity", label: "Qty", align: "right", render: (r) => <span className="font-semibold text-destructive">-{r.quantity}</span> },
            { key: "notes", label: "Notes" },
          ]}
        />
      </div>
    </AppShell>
  );
}

function NewUsageDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");

  const products = useQuery({
    queryKey: ["products-select"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, code, name, current_stock").eq("is_active", true).order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Select a product");
      const { error } = await supabase.from("daily_usage").insert({
        product_id: productId,
        quantity: Number(quantity) || 0,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usage recorded — stock reduced");
      setOpen(false);
      setProductId(""); setQuantity("1"); setNotes("");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Log Usage</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log Daily Usage</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Product *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>{(products.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name} (stock: {p.current_stock})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Used for iPhone 13 screen repair — counter #2" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : "Record Usage"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
