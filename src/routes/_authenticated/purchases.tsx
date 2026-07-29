import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { fmtRs, fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({ meta: [{ title: "Purchases · Project Phoenix" }] }),
  component: PurchasesPage,
});

type PurchaseRow = {
  id: string;
  purchase_no: string;
  purchase_date: string;
  status: string;
  subtotal: number;
  total: number;
  supplier: { name: string } | null;
};

function PurchasesPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, purchase_no, purchase_date, status, subtotal, total, supplier:suppliers(name)")
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return data as unknown as PurchaseRow[];
    },
  });

  const flat = useMemo(
    () => data.map((r) => ({ ...r, supplier_name: r.supplier?.name ?? "—" })),
    [data],
  );

  return (
    <AppShell title="Purchases" subtitle="Supplier Orders">
      <div className="mx-auto max-w-[1600px] space-y-4 p-6 xl:p-8">
        <DataTable
          rows={flat}
          rowKey={(r) => r.id}
          searchKeys={["purchase_no", "supplier_name"]}
          searchPlaceholder="Search PO or supplier…"
          initialSort={{ key: "purchase_date", dir: "desc" }}
          actions={<NewPurchaseDialog onCreated={() => qc.invalidateQueries({ queryKey: ["purchases"] })} />}
          emptyMessage="No purchase orders yet."
          columns={[
            { key: "purchase_no", label: "PO #", render: (r) => <span className="font-mono text-[12px] font-semibold">{r.purchase_no}</span> },
            { key: "supplier_name", label: "Supplier" },
            { key: "purchase_date", label: "Date", align: "right", render: (r) => fmtDate(r.purchase_date) },
            { key: "total", label: "Total", align: "right", render: (r) => <span className="font-semibold">{fmtRs(r.total)}</span> },
            {
              key: "status",
              label: "Status",
              render: (r) => (
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${
                  r.status === "received" ? "bg-success-soft text-success" :
                  r.status === "pending" ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary"
                }`}>{r.status}</span>
              ),
            },
          ]}
        />
      </div>
    </AppShell>
  );
}

type LineItem = { product_id: string; quantity: string; unit_cost: string };

function NewPurchaseDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [status, setStatus] = useState("received");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ product_id: "", quantity: "1", unit_cost: "0" }]);

  const suppliers = useQuery({
    queryKey: ["suppliers-select"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
    enabled: open,
  });
  const products = useQuery({
    queryKey: ["products-select"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, code, name, cost_price").eq("is_active", true).order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0);

  const create = useMutation({
    mutationFn: async () => {
      const validItems = items.filter((i) => i.product_id && Number(i.quantity) > 0);
      if (validItems.length === 0) throw new Error("Add at least one line item");

      const purchaseNo = `PO-${Date.now().toString().slice(-8)}`;
      const { data: purchase, error: pErr } = await supabase
        .from("purchases")
        .insert({ purchase_no: purchaseNo, supplier_id: supplierId || null, status, notes: notes || null, subtotal, total: subtotal })
        .select("id")
        .single();
      if (pErr) throw pErr;

      const rows = validItems.map((i) => ({
        purchase_id: purchase.id,
        product_id: i.product_id,
        quantity: Number(i.quantity),
        unit_cost: Number(i.unit_cost),
        subtotal: Number(i.quantity) * Number(i.unit_cost),
      }));
      const { error: iErr } = await supabase.from("purchase_items").insert(rows);
      if (iErr) throw iErr;
    },
    onSuccess: () => {
      toast.success("Purchase recorded — stock updated");
      setOpen(false);
      setItems([{ product_id: "", quantity: "1", unit_cost: "0" }]);
      setSupplierId(""); setNotes("");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setItem = (i: number, patch: Partial<LineItem>) => setItems((prev) => prev.map((it, ix) => (ix === i ? { ...it, ...patch } : it)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Purchase</Button></DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>{(suppliers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>

        <div className="mt-2 rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Product</th>
                <th className="w-24 px-3 py-2 text-right font-semibold">Qty</th>
                <th className="w-32 px-3 py-2 text-right font-semibold">Unit Cost</th>
                <th className="w-32 px-3 py-2 text-right font-semibold">Subtotal</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Select value={it.product_id} onValueChange={(v) => {
                      const p = (products.data ?? []).find((x) => x.id === v);
                      setItem(i, { product_id: v, unit_cost: p ? String(p.cost_price) : it.unit_cost });
                    }}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>{(products.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2"><Input className="h-8 text-right" type="number" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} /></td>
                  <td className="px-3 py-2"><Input className="h-8 text-right" type="number" step="0.01" value={it.unit_cost} onChange={(e) => setItem(i, { unit_cost: e.target.value })} /></td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtRs(Number(it.quantity || 0) * Number(it.unit_cost || 0))}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setItems((prev) => prev.filter((_, ix) => ix !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
            <Button size="sm" variant="outline" onClick={() => setItems((prev) => [...prev, { product_id: "", quantity: "1", unit_cost: "0" }])}><Plus className="mr-1 h-3.5 w-3.5" /> Add line</Button>
            <div className="text-[13px] font-semibold">Total: {fmtRs(subtotal)}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : "Create Purchase"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
