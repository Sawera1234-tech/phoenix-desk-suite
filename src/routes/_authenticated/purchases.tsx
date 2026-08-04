import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { RowActions } from "@/components/phoenix/RowActions";
import { fmtRs, fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  createPurchase,
  deletePurchase,
  fetchPurchaseItems,
  purchaseKeys,
  updatePurchase,
  type PurchaseLineInput,
} from "@/lib/purchases";

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
  discount: number;
  total: number;
  notes: string | null;
  supplier_id: string | null;
  supplier: { name: string } | null;
};

function PurchasesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseRow | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: purchaseKeys.list,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, purchase_no, purchase_date, status, subtotal, discount, total, notes, supplier_id, supplier:suppliers(name)")
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return data as unknown as PurchaseRow[];
    },
  });

  const flat = useMemo(
    () => data.map((r) => ({ ...r, supplier_name: r.supplier?.name ?? "—" })),
    [data],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: purchaseKeys.list });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
    qc.invalidateQueries({ queryKey: ["demand"] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => deletePurchase(id),
    onSuccess: () => { toast.success("Purchase deleted — stock reverted"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Purchases" subtitle="Supplier Orders">
      <div className="mx-auto max-w-[1600px] space-y-4 p-6 xl:p-8">
        <DataTable
          rows={flat}
          isLoading={isLoading}
          rowKey={(r) => r.id}
          searchKeys={["purchase_no", "supplier_name"]}
          searchPlaceholder="Search PO or supplier…"
          initialSort={{ key: "purchase_date", dir: "desc" }}
          actions={
            <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4" /> New Purchase
            </Button>
          }
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
            {
              key: "actions",
              label: "Actions",
              align: "right",
              sortable: false,
              render: (r) => (
                <PurchaseActions
                  row={r}
                  onEdit={() => { setEditing(r); setOpen(true); }}
                  onDelete={() => remove.mutate(r.id)}
                />
              ),
            },
          ]}
        />
      </div>
      <PurchaseDialog open={open} onOpenChange={setOpen} record={editing} onSaved={refresh} />
    </AppShell>
  );
}

function PurchaseActions({
  row,
  onEdit,
  onDelete,
}: {
  row: PurchaseRow & { supplier_name: string };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: items = [] } = useQuery({
    queryKey: purchaseKeys.items(row.id),
    queryFn: () => fetchPurchaseItems(row.id),
  });

  return (
    <RowActions
      table="purchases"
      id={row.id}
      label={row.purchase_no}
      onEdit={onEdit}
      onDeleted={onDelete}
      fields={[
        { label: "Supplier", value: row.supplier_name },
        { label: "Date", value: fmtDate(row.purchase_date) },
        { label: "Status", value: row.status },
        { label: "Subtotal", value: fmtRs(row.subtotal) },
        { label: "Discount", value: fmtRs(row.discount) },
        { label: "Total", value: fmtRs(row.total) },
        { label: "Notes", value: row.notes ?? "—" },
        {
          label: "Line items",
          value: (
            <ul className="space-y-0.5">
              {items.map((i) => (
                <li key={i.id}>
                  {i.product?.name ?? "Product"} × {i.quantity} @ {fmtRs(i.unit_cost)}
                </li>
              ))}
              {items.length === 0 && <li>—</li>}
            </ul>
          ),
        },
      ]}
    />
  );
}

type LineItem = { product_id: string; quantity: string; unit_cost: string };

const EMPTY_LINE: LineItem = { product_id: "", quantity: "1", unit_cost: "0" };

function PurchaseDialog({
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record: PurchaseRow | null;
  onSaved: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState("received");
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [discount, setDiscount] = useState("0");
  const [items, setItems] = useState<LineItem[]>([EMPTY_LINE]);

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
  const existingItems = useQuery({
    queryKey: purchaseKeys.items(record?.id ?? "new"),
    queryFn: () => fetchPurchaseItems(record!.id),
    enabled: open && !!record,
  });

  useEffect(() => {
    if (!open) return;
    setSupplierId(record?.supplier_id ?? "");
    setStatus(record?.status ?? "received");
    setNotes(record?.notes ?? "");
    setPurchaseDate(record?.purchase_date ?? new Date().toISOString().slice(0, 10));
    setDiscount(String(record?.discount ?? 0));
    if (!record) setItems([EMPTY_LINE]);
  }, [open, record]);

  useEffect(() => {
    if (!open || !record || !existingItems.data) return;
    setItems(
      existingItems.data.length > 0
        ? existingItems.data.map((i) => ({
            product_id: i.product_id,
            quantity: String(i.quantity),
            unit_cost: String(i.unit_cost),
          }))
        : [EMPTY_LINE],
    );
  }, [open, record, existingItems.data]);

  const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0);
  const total = Math.max(0, subtotal - Number(discount || 0));

  const save = useMutation({
    mutationFn: async () => {
      const payloadItems: PurchaseLineInput[] = items
        .filter((i) => i.product_id && Number(i.quantity) > 0)
        .map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) }));
      if (payloadItems.length === 0) throw new Error("Add at least one line item");
      const payload = {
        supplier_id: supplierId || null,
        purchase_date: purchaseDate,
        status,
        notes: notes.trim() || null,
        discount: Number(discount || 0),
        items: payloadItems,
      };
      if (record) await updatePurchase(record.id, payload);
      else await createPurchase(payload);
    },
    onSuccess: () => {
      toast.success(record ? "Purchase updated — stock recalculated" : "Purchase recorded — stock updated");
      onOpenChange(false);
      setItems([EMPTY_LINE]);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setItem = (i: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, ix) => (ix === i ? { ...it, ...patch } : it)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{record ? `Edit ${record.purchase_no}` : "New Purchase Order"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>{(suppliers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
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
                    <button
                      type="button"
                      aria-label="Remove line"
                      onClick={() => setItems((prev) => (prev.length === 1 ? [EMPTY_LINE] : prev.filter((_, ix) => ix !== i)))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-2">
            <Button size="sm" variant="outline" onClick={() => setItems((prev) => [...prev, { ...EMPTY_LINE }])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add line
            </Button>
            <div className="flex items-center gap-3">
              <Label className="text-[12px]">Discount</Label>
              <Input className="h-8 w-28 text-right" type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              <div className="text-[13px] font-semibold">Total: {fmtRs(total)}</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : record ? "Save changes" : "Create Purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
