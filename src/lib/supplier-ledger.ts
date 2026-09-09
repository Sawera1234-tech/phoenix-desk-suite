import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { fmtRs, fmtDate } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Supplier Ledger — payables mirror of the customer Market Ledger.
//
// Purchases are DEBITS against us (we owe the supplier), supplier payments are
// CREDITS. The running balance is derived chronologically from the stored rows
// exactly like the customer ledger, so it can never drift.
// ─────────────────────────────────────────────────────────────────────────────

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  opening_balance: number;
  is_active: boolean;
  created_at: string;
};

export type SupplierPurchase = {
  id: string;
  purchase_no: string;
  purchase_date: string;
  total: number;
  status: string;
  created_at: string;
};

export type SupplierPayment = {
  id: string;
  payment_no: string;
  supplier_id: string;
  payment_date: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export type SupplierPaymentInput = {
  supplier_id: string;
  payment_date: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
};

export const SUPPLIER_PAYMENT_METHODS = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"] as const;

export const supplierLedgerKeys = {
  all: ["supplier-ledger"] as const,
  supplier: (id: string) => ["supplier-ledger", "supplier", id] as const,
  purchases: (id: string) => ["supplier-ledger", "purchases", id] as const,
  payments: (id: string) => ["supplier-ledger", "payments", id] as const,
  balances: ["supplier-ledger", "balances"] as const,
};

const n = (v: unknown) => Math.round((Number(v ?? 0) + Number.EPSILON) * 100) / 100;

export function invalidateSupplierLedger(qc: {
  invalidateQueries: (o: { queryKey: readonly unknown[] }) => void;
}) {
  qc.invalidateQueries({ queryKey: supplierLedgerKeys.all });
  qc.invalidateQueries({ queryKey: ["suppliers"] });
  qc.invalidateQueries({ queryKey: ["purchases"] });
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export async function fetchSupplier(id: string): Promise<Supplier> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, phone, address, notes, opening_balance, is_active, created_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as Supplier;
}

export async function fetchSupplierPurchases(supplierId: string): Promise<SupplierPurchase[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select("id, purchase_no, purchase_date, total, status, created_at")
    .eq("supplier_id", supplierId)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierPurchase[];
}

export async function fetchSupplierPayments(supplierId: string): Promise<SupplierPayment[]> {
  const { data, error } = await supabase
    .from("supplier_payments")
    .select("id, payment_no, supplier_id, payment_date, amount, method, reference, notes, created_at")
    .eq("supplier_id", supplierId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierPayment[];
}

/** Outstanding payable per supplier id, for the supplier list. */
export async function fetchSupplierBalances(): Promise<Record<string, number>> {
  const [suppliers, purchases, payments] = await Promise.all([
    supabase.from("suppliers").select("id, opening_balance"),
    supabase.from("purchases").select("supplier_id, total, status"),
    supabase.from("supplier_payments").select("supplier_id, amount"),
  ]);
  if (suppliers.error) throw new Error(suppliers.error.message);

  const map: Record<string, number> = {};
  for (const s of suppliers.data ?? []) map[s.id] = n((s as { opening_balance?: number }).opening_balance);
  for (const p of purchases.data ?? []) {
    if (!p.supplier_id || p.status === "cancelled") continue;
    map[p.supplier_id] = n((map[p.supplier_id] ?? 0) + n(p.total));
  }
  for (const p of payments.data ?? []) {
    if (!p.supplier_id) continue;
    map[p.supplier_id] = n((map[p.supplier_id] ?? 0) - n(p.amount));
  }
  return map;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function validate(input: SupplierPaymentInput) {
  if (!input.supplier_id) throw new Error("Supplier is required");
  if (!input.payment_date) throw new Error("Payment date is required");
  if (!Number.isFinite(input.amount) || n(input.amount) <= 0)
    throw new Error("Payment amount must be greater than zero");
}

export async function createSupplierPayment(input: SupplierPaymentInput): Promise<SupplierPayment> {
  validate(input);
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("supplier_payments")
    .insert({
      supplier_id: input.supplier_id,
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
    table: "supplier_payments",
    recordId: data.id,
    label: `Supplier payment ${data.payment_no}`,
    action: "create",
    after: data as unknown as Record<string, unknown>,
  });
  return data as SupplierPayment;
}

export async function updateSupplierPayment(
  id: string,
  input: SupplierPaymentInput,
  before: SupplierPayment,
): Promise<void> {
  validate(input);
  const { data, error } = await supabase
    .from("supplier_payments")
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
  if (!data?.length) throw new Error("Update failed — no row was changed. Only admins can edit payments.");
  await logAudit({
    table: "supplier_payments",
    recordId: id,
    label: `Supplier payment ${before.payment_no}`,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: input as unknown as Record<string, unknown>,
  });
}

export async function deleteSupplierPayment(payment: SupplierPayment): Promise<void> {
  const { data, error } = await supabase
    .from("supplier_payments")
    .delete()
    .eq("id", payment.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Delete failed — no row was removed. Only admins can delete payments.");
  await logAudit({
    table: "supplier_payments",
    recordId: payment.id,
    label: `Supplier payment ${payment.payment_no}`,
    action: "delete",
    before: payment as unknown as Record<string, unknown>,
  });
}

// ─── Derived ledger ──────────────────────────────────────────────────────────

export type SupplierLedgerRow = {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  running: number;
  sortKey: string;
};

export function buildSupplierLedger(
  supplier: Supplier | undefined,
  purchases: SupplierPurchase[],
  payments: SupplierPayment[],
): SupplierLedgerRow[] {
  const raw = [
    ...purchases
      .filter((p) => p.status !== "cancelled")
      .map((p) => ({
        id: `pur-${p.id}`,
        date: p.purchase_date,
        description: `Purchase ${p.purchase_no}`,
        debit: n(p.total),
        credit: 0,
        sortKey: `${p.purchase_date}#${p.created_at}`,
      })),
    ...payments.map((p) => ({
      id: `pay-${p.id}`,
      date: p.payment_date,
      description: `Payment ${p.payment_no} (${p.method})`,
      debit: 0,
      credit: n(p.amount),
      sortKey: `${p.payment_date}#${p.created_at}`,
    })),
  ].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  let running = n(supplier?.opening_balance);
  return raw.map((r) => {
    running = n(running + r.debit - r.credit);
    return { ...r, running };
  });
}

export type SupplierSummary = {
  openingBalance: number;
  lifetimePurchases: number;
  lifetimePayments: number;
  outstanding: number;
  lastPurchase: SupplierPurchase | null;
  lastPayment: SupplierPayment | null;
};

export function buildSupplierSummary(
  supplier: Supplier | undefined,
  purchases: SupplierPurchase[],
  payments: SupplierPayment[],
): SupplierSummary {
  const opening = n(supplier?.opening_balance);
  const lifetimePurchases = purchases
    .filter((p) => p.status !== "cancelled")
    .reduce((s, p) => s + n(p.total), 0);
  const lifetimePayments = payments.reduce((s, p) => s + n(p.amount), 0);
  return {
    openingBalance: opening,
    lifetimePurchases: n(lifetimePurchases),
    lifetimePayments: n(lifetimePayments),
    outstanding: n(opening + lifetimePurchases - lifetimePayments),
    lastPurchase: purchases[0] ?? null,
    lastPayment: payments[0] ?? null,
  };
}

export type SupplierStatement = {
  from: string;
  to: string;
  openingBalance: number;
  rows: SupplierLedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
};

export function buildSupplierStatement(
  supplier: Supplier | undefined,
  rows: SupplierLedgerRow[],
  from: string,
  to: string,
): SupplierStatement {
  const before = rows.filter((r) => r.date < from);
  const opening = before.length
    ? before[before.length - 1]!.running
    : n(supplier?.opening_balance);
  const inRange = rows.filter((r) => r.date >= from && r.date <= to);
  const totalDebit = n(inRange.reduce((s, r) => s + r.debit, 0));
  const totalCredit = n(inRange.reduce((s, r) => s + r.credit, 0));
  return {
    from,
    to,
    openingBalance: n(opening),
    rows: inRange,
    totalDebit,
    totalCredit,
    closingBalance: inRange.length ? inRange[inRange.length - 1]!.running : n(opening),
  };
}

// ─── Statement printing (A4) ─────────────────────────────────────────────────

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function printSupplierStatement(opts: {
  supplier: Supplier;
  statement: SupplierStatement;
  business?: { shop_name?: string | null; address?: string | null; phone?: string | null } | null;
}) {
  const { supplier, statement, business } = opts;
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) throw new Error("Popup blocked — allow popups to print the statement.");

  const rows = statement.rows
    .map(
      (r) => `<tr>
        <td>${esc(fmtDate(r.date))}</td>
        <td>${esc(r.description)}</td>
        <td class="num">${r.debit ? esc(fmtRs(r.debit)) : "—"}</td>
        <td class="num">${r.credit ? esc(fmtRs(r.credit)) : "—"}</td>
        <td class="num bold">${esc(fmtRs(r.running))}</td>
      </tr>`,
    )
    .join("");

  win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>Supplier Statement — ${esc(supplier.name)}</title>
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
  @media print { body { margin: 12mm; } }
</style></head><body>
<div class="head">
  <div>
    <h1>${esc(business?.shop_name?.trim() || "Supplier Statement")}</h1>
    <div class="muted">${esc(business?.address ?? "")}</div>
    <div class="muted">${esc(business?.phone ?? "")}</div>
  </div>
  <div style="text-align:right">
    <div class="bold" style="font-size:15px">SUPPLIER STATEMENT</div>
    <div class="muted">${esc(fmtDate(statement.from))} — ${esc(fmtDate(statement.to))}</div>
  </div>
</div>

<div class="meta">
  <div class="box">
    <div class="muted">Supplier</div>
    <div class="bold">${esc(supplier.name)}</div>
    <div class="muted">${esc(supplier.phone ?? "")}</div>
    <div class="muted">${esc(supplier.address ?? "")}</div>
  </div>
  <div class="box">
    <div class="muted">Opening Balance</div>
    <div class="bold" style="font-size:16px">${esc(fmtRs(statement.openingBalance))}</div>
    <div class="muted" style="margin-top:6px">Closing Balance</div>
    <div class="bold" style="font-size:16px">${esc(fmtRs(statement.closingBalance))}</div>
  </div>
</div>

<table>
  <thead><tr><th>Date</th><th>Description</th><th class="num">Purchases</th><th class="num">Payments</th><th class="num">Balance</th></tr></thead>
  <tbody>
    <tr><td>${esc(fmtDate(statement.from))}</td><td class="bold">Opening Balance</td><td class="num">—</td><td class="num">—</td><td class="num bold">${esc(fmtRs(statement.openingBalance))}</td></tr>
    ${rows || `<tr><td colspan="5" style="text-align:center;padding:24px" class="muted">No transactions in this period.</td></tr>`}
  </tbody>
  <tfoot>
    <tr><td colspan="2">Totals</td><td class="num">${esc(fmtRs(statement.totalDebit))}</td><td class="num">${esc(fmtRs(statement.totalCredit))}</td><td class="num">${esc(fmtRs(statement.closingBalance))}</td></tr>
  </tfoot>
</table>

<script>
window.onload = () => { setTimeout(() => window.print(), 400); window.onafterprint = () => window.close(); };
</script>
</body></html>`);
  win.document.close();
}
