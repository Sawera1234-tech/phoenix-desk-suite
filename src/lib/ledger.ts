import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { fmtRs, fmtDate } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Market Ledger / Customer Credit Accounts
//
// ALL balances are database-driven. `ledger_entries.balance_after` and
// `shopkeepers.current_balance` are recalculated by the database
// (`recalc_shopkeeper_ledger`) on every insert / update / delete of a ledger
// entry, payment or opening balance. The frontend NEVER writes a balance.
// ─────────────────────────────────────────────────────────────────────────────

export type Customer = {
  id: string;
  name: string;
  shop_name: string | null;
  phone: string | null;
  address: string | null;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  shopkeeper_id: string;
  entry_date: string;
  entry_type: string;
  description: string | null;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  payment_no: string;
  shopkeeper_id: string;
  payment_date: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export type CustomerInvoice = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  total: number;
  amount_paid: number;
  status: string;
  created_at: string;
};

export type PaymentInput = {
  shopkeeper_id: string;
  payment_date: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
};

export const PAYMENT_METHODS = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"] as const;

export const ledgerKeys = {
  all: ["market-ledger"] as const,
  customers: () => [...ledgerKeys.all, "customers"] as const,
  customer: (id: string) => [...ledgerKeys.all, "customer", id] as const,
  entries: (id: string) => [...ledgerKeys.all, "entries", id] as const,
  payments: (id: string) => [...ledgerKeys.all, "payments", id] as const,
  invoices: (id: string) => [...ledgerKeys.all, "invoices", id] as const,
};

export function invalidateLedger(qc: {
  invalidateQueries: (o: { queryKey: readonly unknown[] }) => void;
}) {
  qc.invalidateQueries({ queryKey: ledgerKeys.all });
  qc.invalidateQueries({ queryKey: ["shopkeepers"] });
  qc.invalidateQueries({ queryKey: ["ledger"] });
  qc.invalidateQueries({ queryKey: ["wholesale"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const n = (v: unknown) => Math.round((Number(v ?? 0) + Number.EPSILON) * 100) / 100;

export function isCredit(entryType: string): boolean {
  return entryType === "credit" || entryType === "payment";
}

/** Signed effect of a ledger entry on the outstanding balance. */
export function entryDelta(entry: Pick<LedgerEntry, "entry_type" | "amount">): number {
  if (entry.entry_type === "debit") return n(entry.amount);
  if (isCredit(entry.entry_type)) return -n(entry.amount);
  return 0;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("shopkeepers")
    .select("id, name, shop_name, phone, address, opening_balance, current_balance, is_active, created_at")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function fetchCustomer(id: string): Promise<Customer> {
  const { data, error } = await supabase
    .from("shopkeepers")
    .select("id, name, shop_name, phone, address, opening_balance, current_balance, is_active, created_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function fetchLedgerEntries(shopkeeperId: string): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("id, shopkeeper_id, entry_date, entry_type, description, amount, balance_after, reference_type, reference_id, created_at")
    .eq("shopkeeper_id", shopkeeperId)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LedgerEntry[];
}

export async function fetchCustomerInvoices(shopkeeperId: string): Promise<CustomerInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_no, invoice_date, total, amount_paid, status, created_at")
    .eq("shopkeeper_id", shopkeeperId)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerInvoice[];
}

export async function fetchPayments(shopkeeperId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("id, payment_no, shopkeeper_id, payment_date, amount, method, reference, notes, created_at")
    .eq("shopkeeper_id", shopkeeperId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Payment[];
}

// ─── Mutations (payments) ────────────────────────────────────────────────────
// The database trigger `payment_ledger` mirrors every payment into
// ledger_entries and the recalc engine re-derives every running balance.

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function validatePayment(input: PaymentInput) {
  if (!input.shopkeeper_id) throw new Error("Customer is required");
  if (!input.payment_date) throw new Error("Payment date is required");
  if (!Number.isFinite(input.amount) || n(input.amount) <= 0)
    throw new Error("Payment amount must be greater than zero");
}

export async function createPayment(input: PaymentInput): Promise<Payment> {
  validatePayment(input);
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("payments")
    .insert({
      shopkeeper_id: input.shopkeeper_id,
      payment_date: input.payment_date,
      amount: n(input.amount),
      method: input.method || "cash",
      reference: input.reference || null,
      notes: input.notes || null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logAudit({
    table: "payments",
    recordId: data.id,
    label: `Payment ${data.payment_no}`,
    action: "create",
    after: data as unknown as Record<string, unknown>,
  });
  return data as Payment;
}

export async function updatePayment(id: string, input: PaymentInput, before: Payment): Promise<void> {
  validatePayment(input);
  const { data, error } = await supabase
    .from("payments")
    .update({
      payment_date: input.payment_date,
      amount: n(input.amount),
      method: input.method || "cash",
      reference: input.reference || null,
      notes: input.notes || null,
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0)
    throw new Error("Update failed — no row was changed. Only admins can edit payments.");

  await logAudit({
    table: "payments",
    recordId: id,
    label: `Payment ${before.payment_no}`,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: input as unknown as Record<string, unknown>,
  });
}

export async function deletePayment(payment: Payment): Promise<void> {
  const { data, error } = await supabase.from("payments").delete().eq("id", payment.id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0)
    throw new Error("Delete failed — no row was removed. Only admins can delete payments.");

  await logAudit({
    table: "payments",
    recordId: payment.id,
    label: `Payment ${payment.payment_no}`,
    action: "delete",
    before: payment as unknown as Record<string, unknown>,
  });
}

// ─── Account summary (derived from database rows only) ───────────────────────

export type AccountSummary = {
  previousBalance: number;
  todaySales: number;
  todayPayments: number;
  currentOutstanding: number;
  lifetimeSales: number;
  lifetimePayments: number;
  finalBalance: number;
  lastInvoice: CustomerInvoice | null;
  lastPayment: Payment | null;
};

export function buildAccountSummary(
  customer: Customer,
  entries: LedgerEntry[],
  invoices: CustomerInvoice[],
  payments: Payment[],
  today = todayISO(),
): AccountSummary {
  const opening = n(customer.opening_balance);

  const previousBalance = entries
    .filter((e) => e.entry_date < today)
    .reduce((sum, e) => sum + entryDelta(e), opening);

  const todaySales = invoices
    .filter((i) => i.invoice_date === today && i.status !== "cancelled")
    .reduce((s, i) => s + n(i.total), 0);

  const todayPayments = entries
    .filter((e) => e.entry_date === today && isCredit(e.entry_type))
    .reduce((s, e) => s + n(e.amount), 0);

  const lifetimeSales = invoices
    .filter((i) => i.status !== "cancelled")
    .reduce((s, i) => s + n(i.total), 0);

  const lifetimePayments = entries
    .filter((e) => isCredit(e.entry_type))
    .reduce((s, e) => s + n(e.amount), 0);

  const finalBalance = n(customer.current_balance);

  return {
    previousBalance: n(previousBalance),
    todaySales: n(todaySales),
    todayPayments: n(todayPayments),
    currentOutstanding: finalBalance,
    lifetimeSales: n(lifetimeSales),
    lifetimePayments: n(lifetimePayments),
    finalBalance,
    lastInvoice: invoices[0] ?? null,
    lastPayment: payments[0] ?? null,
  };
}

// ─── Statement ───────────────────────────────────────────────────────────────

export type StatementRow = LedgerEntry & { debit: number; credit: number; running: number };

export type Statement = {
  from: string;
  to: string;
  openingBalance: number;
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
};

export function buildStatement(
  customer: Customer,
  entries: LedgerEntry[],
  from: string,
  to: string,
): Statement {
  const opening = entries
    .filter((e) => e.entry_date < from)
    .reduce((sum, e) => sum + entryDelta(e), n(customer.opening_balance));

  let running = opening;
  let totalDebit = 0;
  let totalCredit = 0;

  const rows: StatementRow[] = entries
    .filter((e) => e.entry_date >= from && e.entry_date <= to)
    .map((e) => {
      const debit = e.entry_type === "debit" ? n(e.amount) : 0;
      const credit = isCredit(e.entry_type) ? n(e.amount) : 0;
      totalDebit = n(totalDebit + debit);
      totalCredit = n(totalCredit + credit);
      running = n(running + debit - credit);
      return { ...e, debit, credit, running };
    });

  return {
    from,
    to,
    openingBalance: n(opening),
    rows,
    totalDebit,
    totalCredit,
    closingBalance: n(running),
  };
}

export type StatementRangeKey =
  | "today"
  | "yesterday"
  | "this-month"
  | "last-month"
  | "all"
  | "custom";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function rangeFor(key: StatementRangeKey): { from: string; to: string } {
  const now = new Date();
  switch (key) {
    case "today":
      return { from: iso(now), to: iso(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: iso(y), to: iso(y) };
    }
    case "this-month":
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case "last-month":
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    default:
      return { from: "1900-01-01", to: iso(now) };
  }
}

export const STATEMENT_RANGES: { key: StatementRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this-month", label: "Current Month" },
  { key: "last-month", label: "Previous Month" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom range" },
];

// ─── Statement printing (A4, print + save as PDF) ────────────────────────────

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function printStatement(opts: {
  customer: Customer;
  statement: Statement;
  business?: { shop_name?: string | null; address?: string | null; phone?: string | null } | null;
}) {
  const { customer, statement, business } = opts;
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    throw new Error("Popup blocked — allow popups to print the statement.");
  }

  const rows = statement.rows
    .map(
      (r) => `<tr>
        <td>${esc(fmtDate(r.entry_date))}</td>
        <td>${esc(r.description ?? (r.entry_type === "debit" ? "Sale" : "Payment"))}</td>
        <td class="num">${r.debit ? esc(fmtRs(r.debit)) : "—"}</td>
        <td class="num">${r.credit ? esc(fmtRs(r.credit)) : "—"}</td>
        <td class="num bold">${esc(fmtRs(r.running))}</td>
      </tr>`,
    )
    .join("");

  win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>Statement — ${esc(customer.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Inter, Arial, sans-serif; color: #111827; margin: 28px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0; }
  .muted { color: #6b7280; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 12px; }
  .meta { margin-top: 16px; display: flex; justify-content: space-between; gap: 24px; }
  .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; flex: 1; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  th, td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
  th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bold { font-weight: 700; }
  tfoot td { border-top: 2px solid #111827; font-weight: 700; }
  .totals { margin-top: 16px; float: right; width: 300px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .final { border-top: 2px solid #111827; font-weight: 700; font-size: 14px; }
  @media print { body { margin: 12mm; } }
</style></head><body>
<div class="head">
  <div>
    <h1>${esc(business?.shop_name?.trim() || "Customer Statement")}</h1>
    <div class="muted">${esc(business?.address ?? "")}</div>
    <div class="muted">${esc(business?.phone ?? "")}</div>
  </div>
  <div style="text-align:right">
    <div class="bold" style="font-size:15px">ACCOUNT STATEMENT</div>
    <div class="muted">${esc(fmtDate(statement.from))} — ${esc(fmtDate(statement.to))}</div>
  </div>
</div>

<div class="meta">
  <div class="box">
    <div class="muted">Customer</div>
    <div class="bold">${esc(customer.name)}</div>
    <div>${esc(customer.shop_name ?? "")}</div>
    <div class="muted">${esc(customer.phone ?? "")}</div>
    <div class="muted">${esc(customer.address ?? "")}</div>
  </div>
  <div class="box">
    <div class="muted">Opening Balance</div>
    <div class="bold" style="font-size:16px">${esc(fmtRs(statement.openingBalance))}</div>
    <div class="muted" style="margin-top:6px">Closing Balance</div>
    <div class="bold" style="font-size:16px">${esc(fmtRs(statement.closingBalance))}</div>
  </div>
</div>

<table>
  <thead><tr><th>Date</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead>
  <tbody>
    <tr><td>${esc(fmtDate(statement.from))}</td><td class="bold">Opening Balance</td><td class="num">—</td><td class="num">—</td><td class="num bold">${esc(fmtRs(statement.openingBalance))}</td></tr>
    ${rows || `<tr><td colspan="5" style="text-align:center;padding:24px" class="muted">No transactions in this period.</td></tr>`}
  </tbody>
  <tfoot>
    <tr><td colspan="2">Totals</td><td class="num">${esc(fmtRs(statement.totalDebit))}</td><td class="num">${esc(fmtRs(statement.totalCredit))}</td><td class="num">${esc(fmtRs(statement.closingBalance))}</td></tr>
  </tfoot>
</table>

<div class="totals">
  <div><span>Opening Balance</span><span>${esc(fmtRs(statement.openingBalance))}</span></div>
  <div><span>Total Invoices (Debit)</span><span>${esc(fmtRs(statement.totalDebit))}</span></div>
  <div><span>Total Payments (Credit)</span><span>${esc(fmtRs(statement.totalCredit))}</span></div>
  <div class="final"><span>Closing Balance</span><span>${esc(fmtRs(statement.closingBalance))}</span></div>
</div>

<script>
window.onload = () => { setTimeout(() => window.print(), 400); window.onafterprint = () => window.close(); };
</script>
</body></html>`);
  win.document.close();
}
