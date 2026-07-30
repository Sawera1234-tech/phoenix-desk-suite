import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Eye, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/daily-usage")({
  head: () => ({
    meta: [
      { title: "Daily Usage · Project Phoenix" },
      { name: "description", content: "Log and review parts consumed by daily repair work, with automatic stock deduction." },
    ],
  }),
  component: UsagePage,
});

type Row = {
  id: string;
  usage_date: string;
  quantity: number;
  notes: string | null;
  product_id: string;
  product: { code: string; name: string } | null;
};

function UsagePage() {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["daily-usage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_usage")
        .select("id, usage_date, quantity, notes, product_id, product:products(code, name)")
        .order("usage_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["daily-usage"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["low-stock"] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_usage").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usage entry deleted — stock restored");
      setDeleting(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete entry"),
  });

  const flat = useMemo(
    () => data.map((r) => ({ ...r, product_code: r.product?.code ?? "", product_name: r.product?.name ?? "" })),
    [data],
  );

  type FlatRow = (typeof flat)[number];

  return (
    <AppShell title="Daily Usage" subtitle="Repair Consumption Log">
      <div className="mx-auto max-w-[1400px] space-y-4 p-6 xl:p-8">
        <DataTable<FlatRow>
          rows={flat}
          isLoading={isLoading}
          rowKey={(r) => r.id}
          searchKeys={["product_code", "product_name", "notes", "usage_date"]}
          searchPlaceholder="Search product, date or note…"
          initialSort={{ key: "usage_date", dir: "desc" }}
          actions={<UsageDialog onSaved={refresh} />}
          emptyMessage="No usage recorded yet."
          columns={[
            { key: "usage_date", label: "Date", render: (r) => fmtDate(r.usage_date) },
            { key: "product_code", label: "Code", render: (r) => <span className="font-mono text-[12px] font-semibold">{r.product_code}</span> },
            { key: "product_name", label: "Product" },
            { key: "quantity", label: "Qty", align: "right", render: (r) => <span className="font-semibold text-destructive">-{r.quantity}</span> },
            { key: "notes", label: "Notes" },
            {
              key: "actions",
              label: "Actions",
              align: "right",
              sortable: false,
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="View entry" onClick={() => setViewing(r)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit entry" onClick={() => setEditing(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    aria-label="Delete entry"
                    onClick={() => setDeleting(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Usage Entry</DialogTitle></DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div><dt className="text-[11px] uppercase text-muted-foreground">Date</dt><dd className="font-medium">{fmtDate(viewing.usage_date)}</dd></div>
              <div><dt className="text-[11px] uppercase text-muted-foreground">Quantity</dt><dd className="font-medium">{viewing.quantity}</dd></div>
              <div><dt className="text-[11px] uppercase text-muted-foreground">Code</dt><dd className="font-mono font-medium">{viewing.product?.code ?? "—"}</dd></div>
              <div><dt className="text-[11px] uppercase text-muted-foreground">Product</dt><dd className="font-medium">{viewing.product?.name ?? "—"}</dd></div>
              <div className="col-span-2"><dt className="text-[11px] uppercase text-muted-foreground">Notes</dt><dd className="font-medium">{viewing.notes || "—"}</dd></div>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
            <Button onClick={() => { setEditing(viewing); setViewing(null); }}>Edit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UsageDialog
        entry={editing ?? undefined}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={refresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this usage entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.quantity} unit(s) of {deleting?.product?.name ?? "the product"} will be added back to stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting.id); }}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function UsageDialog({
  entry,
  open: controlledOpen,
  onOpenChange,
  onSaved,
}: {
  entry?: { id: string; product_id: string; quantity: number; notes: string | null; usage_date: string };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (o: boolean) => (isControlled ? onOpenChange?.(o) : setInternalOpen(o));

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [usageDate, setUsageDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setProductId(entry?.product_id ?? "");
    setQuantity(String(entry?.quantity ?? 1));
    setUsageDate(entry?.usage_date ?? new Date().toISOString().slice(0, 10));
    setNotes(entry?.notes ?? "");
  }, [open, entry]);

  const products = useQuery({
    queryKey: ["products-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, current_stock")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Select a product");
      const qty = Number(quantity) || 0;
      if (qty <= 0) throw new Error("Quantity must be greater than zero");

      // Stock is adjusted by insert/delete triggers, so an edit is applied as
      // a delete + re-insert to keep product stock accurate.
      if (entry) {
        const { error: delError } = await supabase.from("daily_usage").delete().eq("id", entry.id);
        if (delError) throw delError;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("daily_usage").insert({
        product_id: productId,
        quantity: qty,
        usage_date: usageDate,
        notes: notes || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(entry ? "Usage updated — stock adjusted" : "Usage recorded — stock reduced");
      setOpen(false);
      if (!entry) { setProductId(""); setQuantity("1"); setNotes(""); }
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Log Usage</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader><DialogTitle>{entry ? "Edit Usage Entry" : "Log Daily Usage"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Product *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {(products.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.name} (stock: {p.current_stock})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={usageDate} onChange={(e) => setUsageDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Used for iPhone 13 screen repair — counter #2" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : entry ? "Save Changes" : "Record Usage"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
