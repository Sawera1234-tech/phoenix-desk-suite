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
import { ArrowLeft, Printer, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { fmtRs, fmtDate } from "@/lib/format";
import { ViewInvoiceDialog } from "@/components/wholesale/ViewInvoiceDialog";
import { printThermalReceipt, useBusinessProfile } from "@/components/wholesale/ThermalReceipt";
import { fetchInvoiceWithItems } from "@/lib/wholesale";
import {
  buildAccountSummary, buildStatement, createPayment, deletePayment, fetchCustomer,
  fetchCustomerInvoices, fetchLedgerEntries, fetchPayments, invalidateLedger, ledgerKeys,
  printStatement, rangeFor, todayISO, updatePayment, PAYMENT_METHODS, STATEMENT_RANGES,
  type Payment, type PaymentInput, type StatementRangeKey,
} from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/ledger/$customerId")({
  head: () => ({
    meta: [
      { title: "Customer Account · Market Ledger" },
      { name: "description", content: "Customer credit account: invoices, payments, running ledger balance and printable statements." },
      { property: "og:title", content: "Customer Account · Market Ledger" },
      { property: "og:description", content: "Customer credit account with invoices, payments and running balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomerAccountPage,
});

function CustomerAccountPage() {
  const { customerId } = Route.useParams();
  const qc = useQueryClient();
  const { data: business } = useBusinessProfile();

  const customerQ = useQuery({ queryKey: ledgerKeys.customer(customerId), queryFn: () => fetchCustomer(customerId) });
  const entriesQ = useQuery({ queryKey: ledgerKeys.entries(customerId), queryFn: () => fetchLedgerEntries(customerId) });
  const invoicesQ = useQuery({ queryKey: ledgerKeys.invoices(customerId), queryFn: () => fetchCustomerInvoices(customerId) });
  const paymentsQ = useQuery({ queryKey: ledgerKeys.payments(customerId), queryFn: () => fetchPayments(customerId) });

  const [payOpen, setPayOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [viewInvoice, setViewInvoice] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<StatementRangeKey>("this-month");
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());

  const customer = customerQ.data;
  const entries = entriesQ.data ?? [];
  const invoices = invoicesQ.data ?? [];
  const payments = paymentsQ.data ?? [];

  const summary = useMemo(
    () => (customer ? buildAccountSummary(customer, entries, invoices, payments) : null),
    [customer, entries, invoices, payments],
  );

  const range = rangeKey === "custom" ? { from: customFrom, to: customTo } : rangeFor(rangeKey);
  const statement = useMemo(
    () => (customer ? buildStatement(customer, entries, range.from, range.to) : null),
    [customer, entries, range.from, range.to],
  );

  const removePayment = useMutation({
    mutationFn: (p: Payment) => deletePayment(p),
    onSuccess: () => { toast.success("Payment deleted — balances recalculated"); setDeleteTarget(null); invalidateLedger(qc); },
    onError: (e: Error) => toast.error(e.message),
  });

  const printInvoice = async (id: string) => {
    try {
      const inv = await fetchInvoiceWithItems(id);
      await printThermalReceipt(inv);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AppShell title="Customer Account" subtitle={customer?.name ?? "Market Ledger"}>
      <div className="mx-auto max-w-[1400px] space-y-5 p-6 xl:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/shopkeepers">
            <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> All customers</Button>
          </Link>
          <Button size="sm" className="gap-1.5" onClick={() => setPayOpen(true)}><Plus className="h-4 w-4" /> Record payment</Button>
        </div>

        {/* Customer header */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-semibold">{customer?.name ?? "…"}</h2>
              <p className="text-[13px] text-muted-foreground">{customer?.shop_name ?? "—"}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {customer?.phone ?? "No phone"} · {customer?.address ?? "No address"}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {customer?.is_active ? "Active account" : "Inactive account"} · Since {fmtDate(customer?.created_at)}
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 px-5 py-3 text-right">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Current Outstanding</div>
              <div className={`text-[26px] font-bold tabular-nums ${Number(customer?.current_balance ?? 0) > 0 ? "text-destructive" : "text-success"}`}>
                {fmtRs(customer?.current_balance)}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Previous Balance" value={summary?.previousBalance} />
            <Stat label="Today's Sales" value={summary?.todaySales} />
            <Stat label="Today's Payment" value={summary?.todayPayments} />
            <Stat label="Lifetime Sales" value={summary?.lifetimeSales} />
            <Stat label="Lifetime Payments" value={summary?.lifetimePayments} />
            <Stat label="Final Balance" value={summary?.finalBalance} strong />
          </div>

          <div className="mt-3 grid gap-3 text-[12px] text-muted-foreground sm:grid-cols-2">
            <div>Last invoice: <span className="font-medium text-foreground">
              {summary?.lastInvoice ? `${summary.lastInvoice.invoice_no} · ${fmtDate(summary.lastInvoice.invoice_date)} · ${fmtRs(summary.lastInvoice.total)}` : "—"}
            </span></div>
            <div>Last payment: <span className="font-medium text-foreground">
              {summary?.lastPayment ? `${summary.lastPayment.payment_no} · ${fmtDate(summary.lastPayment.payment_date)} · ${fmtRs(summary.lastPayment.amount)}` : "—"}
            </span></div>
          </div>
        </div>

        <Tabs defaultValue="ledger">
          <TabsList>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
            <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          </TabsList>

          {/* LEDGER + STATEMENT */}
          <TabsContent value="ledger" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Period</Label>
                <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as StatementRangeKey)}>
                  <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATEMENT_RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
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
                  if (!customer || !statement) return;
                  try { printStatement({ customer, statement, business }); }
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
                    <th className="px-4 py-2.5 text-right">Debit</th>
                    <th className="px-4 py-2.5 text-right">Credit</th>
                    <th className="px-4 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(statement?.from)}</td>
                    <td className="px-4 py-2.5 font-semibold">Opening Balance</td>
                    <td className="px-4 py-2.5 text-right">—</td>
                    <td className="px-4 py-2.5 text-right">—</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtRs(statement?.openingBalance)}</td>
                  </tr>
                  {(statement?.rows ?? []).map((r, i) => (
                    <tr key={r.id} className={i % 2 === 1 ? "bg-muted/15" : ""}>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(r.entry_date)}</td>
                      <td className="px-4 py-2.5">{r.description ?? (r.debit ? "Sale" : "Payment")}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.debit ? fmtRs(r.debit) : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-success">{r.credit ? fmtRs(r.credit) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtRs(r.running)}</td>
                    </tr>
                  ))}
                  {(statement?.rows.length ?? 0) === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No transactions in this period.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-foreground/20 bg-muted/30 font-semibold">
                    <td className="px-4 py-2.5" colSpan={2}>Closing Balance</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtRs(statement?.totalDebit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtRs(statement?.totalCredit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtRs(statement?.closingBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </TabsContent>

          {/* INVOICES */}
          <TabsContent value="invoices" className="mt-4">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Invoice #</th>
                    <th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5 text-right">Paid</th>
                    <th className="px-4 py-2.5 text-right">Remaining</th><th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, i) => (
                    <tr key={inv.id} className={i % 2 === 1 ? "bg-muted/15" : ""}>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-4 py-2.5 font-mono font-medium">{inv.invoice_no}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtRs(inv.total)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-success">{fmtRs(inv.amount_paid)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtRs(Math.max(0, Number(inv.total) - Number(inv.amount_paid)))}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setViewInvoice(inv.id)}><Eye className="h-3 w-3" /> View</Button>
                          <Button size="sm" variant="secondary" className="h-7 gap-1" onClick={() => printInvoice(inv.id)}><Printer className="h-3 w-3" /> Print</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No invoices for this customer yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* PAYMENTS */}
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

      <PaymentDialog
        open={payOpen || !!editPayment}
        payment={editPayment}
        customerId={customerId}
        outstanding={Number(customer?.current_balance ?? 0)}
        onClose={() => { setPayOpen(false); setEditPayment(null); }}
        onSaved={() => invalidateLedger(qc)}
      />

      <ViewInvoiceDialog invoiceId={viewInvoice} open={!!viewInvoice} onOpenChange={(o) => !o && setViewInvoice(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.payment_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              The payment and its ledger entry will be removed and the customer balance recalculated.
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

function PaymentDialog({
  open, payment, customerId, outstanding, onClose, onSaved,
}: {
  open: boolean;
  payment: Payment | null;
  customerId: string;
  outstanding: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<{ payment_date: string; amount: string; method: string; reference: string; notes: string }>({
    payment_date: todayISO(), amount: "", method: "cash", reference: "", notes: "",
  });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // sync form when the dialog target changes (render-phase state sync)
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
      const input: PaymentInput = {
        shopkeeper_id: customerId,
        payment_date: form.payment_date,
        amount: Number(form.amount),
        method: form.method,
        reference: form.reference || null,
        notes: form.notes || null,
      };
      if (payment) await updatePayment(payment.id, input, payment);
      else await createPayment(input);
    },
    onSuccess: () => {
      toast.success(payment ? "Payment updated — balances recalculated" : "Payment recorded");
      onSaved();
      setLoadedFor(null);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setLoadedFor(null); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{payment ? `Edit ${payment.payment_no}` : "Record Payment"}</DialogTitle></DialogHeader>

        <div className="rounded-lg bg-muted/40 px-3 py-2 text-[12px]">
          Outstanding balance: <span className="font-semibold">{fmtRs(outstanding)}</span>
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
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
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
