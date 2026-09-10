import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/phoenix/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Printer, Plus, Pencil, Trash2 } from "lucide-react";
import { fmtRs, fmtDate } from "@/lib/format";
import { useBusinessProfile } from "@/components/wholesale/ThermalReceipt";
import {
  buildSupplierLedger, buildSupplierStatement, buildSupplierSummary, createSupplierPayment,
  deleteSupplierPayment, fetchSupplier, fetchSupplierPayments, fetchSupplierPurchases,
  invalidateSupplierLedger, printSupplierStatement, supplierLedgerKeys, updateSupplierPayment,
  SUPPLIER_PAYMENT_METHODS, type SupplierPayment, type SupplierPaymentInput,
} from "@/lib/supplier-ledger";

export const Route = createFileRoute("/_authenticated/supplier-ledger/$supplierId")({
  head: () => ({
    meta: [
      { title: "Supplier Account · Supplier Ledger" },
      { name: "description", content: "Supplier payable account: purchases, payments, running balance and printable statements." },
      { property: "og:title", content: "Supplier Account · Supplier Ledger" },
      { property: "og:description", content: "Supplier payable account with purchases, payments and running balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupplierAccountPage,
});

const todayISO = () => new Date().toISOString().slice(0, 10);

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this-month", label: "Current Month" },
  { key: "last-month", label: "Previous Month" },
  { key: "custom", label: "Custom Range" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rangeFor(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  if (key === "today") return { from: iso(now), to: iso(now) };
  if (key === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: iso(y), to: iso(y) };
  }
  if (key === "last-month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(from), to: iso(to) };
  }
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

function SupplierAccountPage() {
  const { supplierId } = Route.useParams();
  const qc = useQueryClient();
  const { data: business } = useBusinessProfile();

  const supplierQ = useQuery({ queryKey: supplierLedgerKeys.supplier(supplierId), queryFn: () => fetchSupplier(supplierId) });
  const purchasesQ = useQuery({ queryKey: supplierLedgerKeys.purchases(supplierId), queryFn: () => fetchSupplierPurchases(supplierId) });
  const paymentsQ = useQuery({ queryKey: supplierLedgerKeys.payments(supplierId), queryFn: () => fetchSupplierPayments(supplierId) });

  const [payOpen, setPayOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<SupplierPayment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierPayment | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>("this-month");
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());

  const supplier = supplierQ.data;
  const purchases = useMemo(() => purchasesQ.data ?? [], [purchasesQ.data]);
  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);

  const summary = useMemo(() => buildSupplierSummary(supplier, purchases, payments), [supplier, purchases, payments]);
  const rows = useMemo(() => buildSupplierLedger(supplier, purchases, payments), [supplier, purchases, payments]);
  const range = rangeKey === "custom" ? { from: customFrom, to: customTo } : rangeFor(rangeKey);
  const statement = useMemo(
    () => buildSupplierStatement(supplier, rows, range.from, range.to),
    [supplier, rows, range.from, range.to],
  );

  const removePayment = useMutation({
    mutationFn: (p: SupplierPayment) => deleteSupplierPayment(p),
    onSuccess: () => { toast.success("Payment deleted — balance recalculated"); setDeleteTarget(null); invalidateSupplierLedger(qc); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Supplier Account" subtitle={supplier?.name ?? "Supplier Ledger"}>
      <div className="mx-auto max-w-[1400px] space-y-5 p-6 xl:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/suppliers">
            <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> All suppliers</Button>
          </Link>
          <Button size="sm" className="gap-1.5" onClick={() => setPayOpen(true)}><Plus className="h-4 w-4" /> Record payment</Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-semibold">{supplier?.name ?? "…"}</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {supplier?.phone ?? "No phone"} · {supplier?.address ?? "No address"}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {supplier?.is_active ? "Active supplier" : "Inactive supplier"} · Since {fmtDate(supplier?.created_at)}
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 px-5 py-3 text-right">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding Payable</div>
              <div className={`text-[26px] font-bold tabular-nums ${summary.outstanding > 0 ? "text-destructive" : "text-success"}`}>
                {fmtRs(summary.outstanding)}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Opening Balance" value={summary.openingBalance} />
            <Stat label="Lifetime Purchases" value={summary.lifetimePurchases} />
            <Stat label="Lifetime Payments" value={summary.lifetimePayments} />
            <Stat label="Final Balance" value={summary.outstanding} strong />
          </div>

          <div className="mt-3 grid gap-3 text-[12px] text-muted-foreground sm:grid-cols-2">
            <div>Last purchase: <span className="font-medium text-foreground">
              {summary.lastPurchase ? `${summary.lastPurchase.purchase_no} · ${fmtDate(summary.lastPurchase.purchase_date)} · ${fmtRs(summary.lastPurchase.total)}` : "—"}
            </span></div>
            <div>Last payment: <span className="font-medium text-foreground">
              {summary.lastPayment ? `${summary.lastPayment.payment_no} · ${fmtDate(summary.lastPayment.payment_date)} · ${fmtRs(summary.lastPayment.amount)}` : "—"}
            </span></div>
          </div>
        </div>

        <Tabs defaultValue="ledger">
          <TabsList>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="purchases">Purchases ({purchases.length})</TabsTrigger>
            <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Period</Label>
                <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
                  <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {rangeKey === "custom" && (
                <>
                  <div className="space-y-1"><Label className="text-[11px]">From</Label>
                    <Input type="date" className="h-9" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-[11px]">To</Label>
                    <Input type="date" className="h-9" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
                </>
              )}
              <Button
                variant="outline" size="sm" className="h-9 gap-1.5"
                onClick={() => {
                  if (!supplier) return;
                  try { printSupplierStatement({ supplier, statement, business }); }
                  catch (e) { toast.error((e as Error).message); }
                }}
              >
                <Printer className="h-4 w-4" /> Print / PDF statement
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-4 py-2.5 text-right">Purchases</th>
                    <th className="px-4 py-2.5 text-right">Payments</th>
                    <th className="px-4 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(statement.from)}</td>
                    <td className="px-4 py-2.5 font-semibold">Opening Balance</td>
                    <td className="px-4 py-2.5 text-right">—</td>
                    <td className="px-4 py-2.5 text-right">—</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtRs(statement.openingBalance)}</td>
                  </tr>
                  {statement.rows.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 1 ? "bg-muted/15" : ""}>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(r.date)}</td>
                      <td className="px-4 py-2.5">{r.description}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.debit ? fmtRs(r.debit) : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-success">{r.credit ? fmtRs(r.credit) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtRs(r.running)}</td>
                    </tr>
                  ))}
                  {statement.rows.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No transactions in this period.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-foreground/20 bg-muted/30 font-semibold">
                    <td className="px-4 py-2.5" colSpan={2}>Closing Balance</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtRs(statement.totalDebit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtRs(statement.totalCredit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtRs(statement.closingBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="purchases" className="mt-4">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Purchase #</th>
                    <th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 1 ? "bg-muted/15" : ""}>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(p.purchase_date)}</td>
                      <td className="px-4 py-2.5 font-mono font-medium">{p.purchase_no}</td>
                      <td className="px-4 py-2.5 capitalize">{p.status}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtRs(p.total)}</td>
                    </tr>
                  ))}
                  {purchases.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No purchases from this supplier yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="mt-4">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Payment #</th>
                    <th className="px-4 py-2.5">Method</th><th className="px-4 py-2.5">Reference</th>
                    <th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 1 ? "bg-muted/15" : ""}>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(p.payment_date)}</td>
                      <td className="px-4 py-2.5 font-mono font-medium">{p.payment_no}</td>
                      <td className="px-4 py-2.5 capitalize">{p.method}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.reference ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-success">{fmtRs(p.amount)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" className="h-7 gap-1" onClick={() => setEditPayment(p)}><Pencil className="h-3 w-3" /> Edit</Button>
                          <Button size="sm" variant="destructive" className="h-7 gap-1" onClick={() => setDeleteTarget(p)}><Trash2 className="h-3 w-3" /> Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No payments recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <SupplierPaymentDialog
        open={payOpen || !!editPayment}
        payment={editPayment}
        supplierId={supplierId}
        outstanding={summary.outstanding}
        onClose={() => { setPayOpen(false); setEditPayment(null); }}
        onSaved={() => invalidateSupplierLedger(qc)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.payment_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              The payment will be removed and the supplier balance recalculated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removePayment.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removePayment.isPending}
              onClick={(e) => { e.preventDefault(); if (deleteTarget) removePayment.mutate(deleteTarget); }}
            >
              {removePayment.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Stat({ label, value, strong }: { label: string; value: number | undefined; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 tabular-nums ${strong ? "text-[17px] font-bold" : "text-[15px] font-semibold"}`}>{fmtRs(value)}</div>
    </div>
  );
}

function SupplierPaymentDialog({
  open, payment, supplierId, outstanding, onClose, onSaved,
}: {
  open: boolean;
  payment: SupplierPayment | null;
  supplierId: string;
  outstanding: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ payment_date: todayISO(), amount: "", method: "cash", reference: "", notes: "" });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const key = payment?.id ?? (open ? "new" : null);
  if (open && key !== loadedFor) {
    setLoadedFor(key);
    setForm(
      payment
        ? {
            payment_date: payment.payment_date,
            amount: String(payment.amount),
            method: payment.method,
            reference: payment.reference ?? "",
            notes: payment.notes ?? "",
          }
        : { payment_date: todayISO(), amount: "", method: "cash", reference: "", notes: "" },
    );
  }

  const save = useMutation({
    mutationFn: async () => {
      const input: SupplierPaymentInput = {
        supplier_id: supplierId,
        payment_date: form.payment_date,
        amount: Number(form.amount),
        method: form.method,
        reference: form.reference || null,
        notes: form.notes || null,
      };
      if (payment) await updateSupplierPayment(payment.id, input, payment);
      else await createSupplierPayment(input);
    },
    onSuccess: () => {
      toast.success(payment ? "Payment updated" : "Payment recorded");
      onSaved();
      setLoadedFor(null);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setLoadedFor(null); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{payment ? `Edit ${payment.payment_no}` : "Record Supplier Payment"}</DialogTitle></DialogHeader>

        <div className="rounded-lg bg-muted/40 px-3 py-2 text-[12px]">
          Outstanding payable: <span className="font-semibold">{fmtRs(outstanding)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Payment Date *</Label>
            <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Amount *</Label>
            <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Method</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPLIER_PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Reference</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Cheque / txn no." /></div>
          <div className="col-span-2 space-y-1.5"><Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setForm({ ...form, amount: String(Math.max(0, outstanding)) })}>
            Full amount
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setLoadedFor(null); onClose(); }}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.amount || Number(form.amount) <= 0 || save.isPending}>
            {save.isPending ? "Saving…" : payment ? "Save changes" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
