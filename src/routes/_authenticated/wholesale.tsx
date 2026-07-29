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

export const Route = createFileRoute("/_authenticated/wholesale")({
  head: () => ({ meta: [{ title: "Wholesale · Project Phoenix" }] }),
  component: WholesalePage,
});

type Invoice = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: string;
  total: number;
  amount_paid: number;
  customer_name: string | null;
  shopkeeper: { name: string } | null;
};

function WholesalePage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_no, invoice_date, status, total, amount_paid, customer_name, shopkeeper:shopkeepers(name)")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data as unknown as Invoice[];
    },
  });

  const flat = useMemo(
    () => data.map((r) => ({ ...r, buyer: r.shopkeeper?.name ?? r.customer_name ?? "Walk-in" })),
    [data],
  );

  return (
    <AppShell title="Wholesale" subtitle="Invoicing & Sales">
      <div className="mx-auto max-w-[1600px] space-y-4 p-6 xl:p-8">
        <DataTable
          rows={flat}
          rowKey={(r) => r.id}
          searchKeys={["invoice_no", "buyer"]}
          searchPlaceholder="Search invoice or customer…"
          initialSort={{ key: "invoice_date", dir: "desc" }}
          actions={<NewInvoiceDialog onCreated={() => { qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); }} />}
          emptyMessage="No invoices yet."
          columns={[
            { key: "invoice_no", label: "Invoice #", render: (r) => <span className="font-mono text-[12px] font-semibold">{r.invoice_no}</span> },
            { key: "buyer", label: "Customer" },
            { key: "invoice_date", label: "Date", align: "right", render: (r) => fmtDate(r.invoice_date) },
            { key: "total", label: "Total", align: "right", render: (r) => <span className="font-semibold">{fmtRs(r.total)}</span> },
            { key: "amount_paid", label: "Paid", align: "right", render: (r) => fmtRs(r.amount_paid) },
            {
              key: "status",
              label: "Status",
              render: (r) => (
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${
                  r.status === "paid" ? "bg-success-soft text-success" :
                  r.status === "partial" ? "bg-warning-soft text-warning" :
                  r.status === "credit" ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"
                }`}>{r.status}</span>
              ),
            },
          ]}
        />
      </div>
    </AppShell>
  );
}

type LineItem = { product_id: string; quantity: string; unit_price: string };

function NewInvoiceDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [shopkeeperId, setShopkeeperId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ product_id: "", quantity: "1", unit_price: "0" }]);

  const shopkeepers = useQuery({
    queryKey: ["shopkeepers-select"],
    queryFn: async () => (await supabase.from("shopkeepers").select("id, name").eq("is_active", true).order("name")).data ?? [],
    enabled: open,
  });
  const products = useQuery({
    queryKey: ["products-select"],
    queryFn: async () => (await supabase.from("products").select("id, code, name, wholesale_price, current_stock").eq("is_active", true).order("name")).data ?? [],
    enabled: open,
  });

  const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const paid = Number(amountPaid || 0);
  const status = paid >= subtotal ? "paid" : paid > 0 ? "partial" : "credit";

  const create = useMutation({
    mutationFn: async () => {
      const validItems = items.filter((i) => i.product_id && Number(i.quantity) > 0);
      if (validItems.length === 0) throw new Error("Add at least one line item");
      if (!shopkeeperId && !customerName.trim()) throw new Error("Choose a shopkeeper or enter customer name");

      const invoiceNo = `INV-${Date.now().toString().slice(-8)}`;
      const { data: inv, error: iErr } = await supabase
        .from("invoices")
        .insert({
          invoice_no: invoiceNo,
          shopkeeper_id: shopkeeperId || null,
          customer_name: shopkeeperId ? null : customerName.trim(),
          subtotal, total: subtotal, amount_paid: paid, status,
        })
        .select("id")
        .single();
      if (iErr) throw iErr;

      const rows = validItems.map((i) => ({
        invoice_id: inv.id,
        product_id: i.product_id,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        subtotal: Number(i.quantity) * Number(i.unit_price),
      }));
      const { error: itErr } = await supabase.from("invoice_items").insert(rows);
      if (itErr) throw itErr;

      // Post credit ledger entry for unpaid balance if shopkeeper selected
      const outstanding = subtotal - paid;
      if (shopkeeperId && outstanding > 0) {
        await supabase.from("ledger_entries").insert({
          shopkeeper_id: shopkeeperId,
          entry_type: "credit",
          amount: outstanding,
          description: `Invoice ${invoiceNo}`,
          reference_type: "invoice",
          reference_id: inv.id,
        });
      }
    },
    onSuccess: () => {
      toast.success("Invoice issued");
      setOpen(false);
      setItems([{ product_id: "", quantity: "1", unit_price: "0" }]);
      setShopkeeperId(""); setCustomerName(""); setAmountPaid("");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setItem = (i: number, patch: Partial<LineItem>) => setItems((prev) => prev.map((it, ix) => (ix === i ? { ...it, ...patch } : it)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Invoice</Button></DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>New Wholesale Invoice</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Shopkeeper (market)</Label>
            <Select value={shopkeeperId} onValueChange={setShopkeeperId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{(shopkeepers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Or Walk-in Customer</Label><Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={!!shopkeeperId} /></div>
          <div className="space-y-1.5"><Label>Amount Paid</Label><Input type="number" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} /></div>
        </div>

        <div className="mt-2 rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Product</th>
                <th className="w-24 px-3 py-2 text-right font-semibold">Qty</th>
                <th className="w-32 px-3 py-2 text-right font-semibold">Unit Price</th>
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
                      setItem(i, { product_id: v, unit_price: p ? String(p.wholesale_price) : it.unit_price });
                    }}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>{(products.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name} (stock: {p.current_stock})</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2"><Input className="h-8 text-right" type="number" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} /></td>
                  <td className="px-3 py-2"><Input className="h-8 text-right" type="number" step="0.01" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: e.target.value })} /></td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtRs(Number(it.quantity || 0) * Number(it.unit_price || 0))}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setItems((prev) => prev.filter((_, ix) => ix !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
            <Button size="sm" variant="outline" onClick={() => setItems((prev) => [...prev, { product_id: "", quantity: "1", unit_price: "0" }])}><Plus className="mr-1 h-3.5 w-3.5" /> Add line</Button>
            <div className="flex items-center gap-6 text-[13px]">
              <span className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{fmtRs(subtotal)}</span></span>
              <span className="text-muted-foreground">Outstanding: <span className={subtotal - paid > 0 ? "font-semibold text-destructive" : "font-semibold text-success"}>{fmtRs(Math.max(0, subtotal - paid))}</span></span>
              <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-semibold uppercase text-primary">{status}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : "Issue Invoice"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
