import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────
// NOTE: the database columns are `invoice_no`, `amount_paid` (invoices),
// `subtotal` (invoice_items) and `code` (products). The app-level types below
// keep friendlier names and the query helpers map between the two.

export type InvoiceStatus = "paid" | "partial" | "credit";

export interface Shopkeeper {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  wholesale_price: number | null;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  shopkeeper_id: string;
  total: number;
  paid: number;
  status: InvoiceStatus;
  notes: string | null;
  created_at: string;
  shopkeepers?: { name: string; current_balance: number; opening_balance: number; } | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  products?: Pick<Product, "name" | "sku"> | null;
}

export interface InvoiceWithItems extends Invoice {
  invoice_items: InvoiceItem[];
}

export interface DraftLineItem {
  key: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceFormData {
  shopkeeper_id: string;
  invoice_date: string;
  paid: number;
  notes: string;
  lines: DraftLineItem[];
}

export interface WholesaleStats {
  totalInvoices: number;
  todaySales: number;
  outstandingBalance: number;
  partialCount: number;
}

// ─── Query keys ──────────────────────────────────────────────────────────────

export const wholesaleKeys = {
  all: ["wholesale"] as const,
  invoices: () => [...wholesaleKeys.all, "invoices"] as const,
  invoice: (id: string) => [...wholesaleKeys.all, "invoice", id] as const,
  products: () => [...wholesaleKeys.all, "products"] as const,
  shopkeepers: () => [...wholesaleKeys.all, "shopkeepers"] as const,
  stats: () => [...wholesaleKeys.all, "stats"] as const,
};

// ─── Formatting & calculations ───────────────────────────────────────────────


export function fmtRs(amount: number): string {
  return `Rs ${Number(amount ?? 0).toLocaleString("en-PK")}`;
}

export function calcLineTotal(quantity: number, unitPrice: number): number {
  return quantity * unitPrice;
}

export function calcSubtotal(lines: DraftLineItem[]): number {
  return lines.reduce((sum, line) => sum + calcLineTotal(line.quantity, line.unit_price), 0);
}

export function calcRemaining(total: number, paid: number): number {
  return Math.max(0, Number(total ?? 0) - Number(paid ?? 0));
}

export function calcInvoiceStatus(total: number, paid: number): InvoiceStatus {
  if (total <= 0 || paid >= total) return "paid";
  if (paid > 0) return "partial";
  return "credit";
}

export function normalizeStatus(status: string | null | undefined, total: number, paid: number): InvoiceStatus {
  if (status === "paid" || status === "partial" || status === "credit") return status;
  return calcInvoiceStatus(total, paid);
}

export function newDraftLine(product?: Product): DraftLineItem {
  return {
    key: crypto.randomUUID(),
    product_id: product?.id ?? "",
    product_name: product?.name ?? "",
    quantity: 1,
    unit_price: product?.wholesale_price ?? 0,
  };
}

export function draftLinesFromItems(items: InvoiceItem[]): DraftLineItem[] {
  return items.map((item) => ({
    key: crypto.randomUUID(),
    product_id: item.product_id,
    product_name: item.products?.name ?? "",
    quantity: item.quantity,
    unit_price: item.unit_price,
  }));
}

export function statusLabel(status: InvoiceStatus): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    case "credit":
      return "Credit";
  }
}

export function statusBadgeClass(status: InvoiceStatus): string {
  switch (status) {
    case "paid":
      return "bg-success-soft text-success";
    case "partial":
      return "bg-warning-soft text-warning";
    case "credit":
      return "bg-destructive-soft text-destructive";
  }
}

// ─── Row mappers (db columns → app types) ────────────────────────────────────

type InvoiceRow = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  shopkeeper_id: string | null;
  total: number;
  amount_paid: number;
  status: string;
  notes: string | null;
  created_at: string;
  shopkeepers?: { name: string; current_balance: number; opening_balance: number } | null;
};

function mapInvoice(row: InvoiceRow): Invoice {
  const total = Number(row.total ?? 0);
  const paid = Number(row.amount_paid ?? 0);
  return {
    id: row.id,
    invoice_number: row.invoice_no,
    invoice_date: row.invoice_date,
    shopkeeper_id: row.shopkeeper_id ?? "",
    total,
    paid,
    status: normalizeStatus(row.status, total, paid),
    notes: row.notes,
    created_at: row.created_at,
    shopkeepers: row.shopkeepers ?? null,
  };
}

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  products?: { name: string; code: string | null } | null;
};

function mapInvoiceItem(row: InvoiceItemRow): InvoiceItem {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    product_id: row.product_id,
    quantity: Number(row.quantity ?? 0),
    unit_price: Number(row.unit_price ?? 0),
    line_total: Number(row.subtotal ?? 0),
    products: row.products ? { name: row.products.name, sku: row.products.code ?? null } : null,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

const INVOICE_SELECT = "id, invoice_no, invoice_date, shopkeeper_id, total, amount_paid, status, notes, created_at, shopkeepers(name,current_balance,opening_balance)";

// ─── Supabase queries ─────────────────────────────────────────────────────────

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as InvoiceRow[]).map(mapInvoice);
}

export async function fetchInvoiceWithItems(id: string): Promise<InvoiceWithItems> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .single();

  if (invoiceError) throw invoiceError;

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("id, invoice_id, product_id, quantity, unit_price, subtotal, products(name, code)")
    .eq("invoice_id", id)
    .order("created_at", { ascending: true });

  if (itemsError) throw itemsError;

  return {
    ...mapInvoice(invoice as unknown as InvoiceRow),
    invoice_items: ((items ?? []) as unknown as InvoiceItemRow[]).map(mapInvoiceItem),
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, code, wholesale_price")
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.code ?? null,
    wholesale_price: Number(p.wholesale_price ?? 0),
  }));
}

export async function fetchShopkeepers(): Promise<Shopkeeper[]> {
  const { data, error } = await supabase
    .from("shopkeepers")
    .select("id, name, phone, address")
    .order("name");

  if (error) throw error;
  return (data ?? []) as Shopkeeper[];
}

export async function fetchWholesaleStats(): Promise<WholesaleStats> {
  const { data, error } = await supabase
    .from("invoices")
    .select("total, amount_paid, status, invoice_date");

  if (error) throw error;

  const invoices = data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  return {
    totalInvoices: invoices.length,
    todaySales: invoices
      .filter((inv) => inv.invoice_date === today)
      .reduce((sum, inv) => sum + Number(inv.total ?? 0), 0),
    outstandingBalance: invoices.reduce(
      (sum, inv) => sum + Math.max(0, Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0)),
      0,
    ),
    partialCount: invoices.filter(
      (inv) => normalizeStatus(inv.status, Number(inv.total ?? 0), Number(inv.amount_paid ?? 0)) === "partial",
    ).length,
  };
}

export async function generateInvoiceNumber(): Promise<string> {
  const { data, error } = await supabase
    .from("invoices")
    .select("invoice_no")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  const latest = data?.[0]?.invoice_no;
  if (!latest) return "INV-0001";

  const match = latest.match(/(\d+)/);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `INV-${String(next).padStart(4, "0")}`;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

function itemsPayloadFrom(lines: DraftLineItem[], invoiceId: string) {
  return lines
    .filter((line) => line.product_id && line.quantity > 0)
    .map((line) => ({
      invoice_id: invoiceId,
      product_id: line.product_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      subtotal: calcLineTotal(line.quantity, line.unit_price),
    }));
}

export async function createInvoice(form: InvoiceFormData): Promise<Invoice> {
  const total = calcSubtotal(form.lines);
  const status = calcInvoiceStatus(total, form.paid);
  const invoiceNumber = await generateInvoiceNumber();
  const userId = await currentUserId();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_no: invoiceNumber,
      invoice_date: form.invoice_date,
      shopkeeper_id: form.shopkeeper_id || null,
      subtotal: total,
      total,
      amount_paid: form.paid,
      status,
      notes: form.notes || null,
      created_by: userId,
    })
    .select(INVOICE_SELECT)
    .single();

  if (invoiceError) throw invoiceError;

  const mapped = mapInvoice(invoice as unknown as InvoiceRow);

  const itemsPayload = itemsPayloadFrom(form.lines, mapped.id);
  if (itemsPayload.length > 0) {
    const { error: itemsError } = await supabase.from("invoice_items").insert(itemsPayload);
    if (itemsError) throw itemsError;
  }

  const remaining = calcRemaining(total, form.paid);
  if (remaining > 0 && form.shopkeeper_id) {
    const { error: ledgerError } = await supabase.from("ledger_entries").insert({
      shopkeeper_id: form.shopkeeper_id,
      entry_date: form.invoice_date,
      amount: remaining,
      entry_type: "debit",
      description: `Invoice ${invoiceNumber} — outstanding balance`,
      reference_type: "invoice",
      reference_id: mapped.id,
      created_by: userId,
    });
    if (ledgerError) throw ledgerError;
  }

  return mapped;
}

export async function updateInvoice(id: string, form: InvoiceFormData): Promise<Invoice> {
  const total = calcSubtotal(form.lines);
  const status = calcInvoiceStatus(total, form.paid);
  const userId = await currentUserId();

  // ── 1. Reverse the OLD invoice balance from the shopkeeper before saving ──
  const { data: existing, error: existingError } = await supabase
    .from("invoices")
    .select("shopkeeper_id, total, amount_paid")
    .eq("id", id)
    .single();
  if (existingError) throw existingError;

  const oldRemaining = calcRemaining(
    Number(existing?.total ?? 0),
    Number(existing?.amount_paid ?? 0),
  );
  const oldShopkeeperId = existing?.shopkeeper_id ?? null;

  if (oldShopkeeperId && oldRemaining !== 0) {
    const { data: sk, error: skError } = await supabase
      .from("shopkeepers")
      .select("current_balance")
      .eq("id", oldShopkeeperId)
      .single();
    if (skError) throw skError;

    const { error: reverseError } = await supabase
      .from("shopkeepers")
      .update({ current_balance: Number(sk?.current_balance ?? 0) - oldRemaining })
      .eq("id", oldShopkeeperId);
    if (reverseError) throw reverseError;
  }


  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .update({
      invoice_date: form.invoice_date,
      shopkeeper_id: form.shopkeeper_id || null,
      subtotal: total,
      total,
      amount_paid: form.paid,
      status,
      notes: form.notes || null,
    })
    .eq("id", id)
    .select(INVOICE_SELECT)
    .single();

  if (invoiceError) throw invoiceError;

  const mapped = mapInvoice(invoice as unknown as InvoiceRow);

  const { error: deleteItemsError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id);
  if (deleteItemsError) throw deleteItemsError;

  const itemsPayload = itemsPayloadFrom(form.lines, id);
  if (itemsPayload.length > 0) {
    const { error: itemsError } = await supabase.from("invoice_items").insert(itemsPayload);
    if (itemsError) throw itemsError;
  }

  const { error: deleteLedgerError } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("reference_type", "invoice")
    .eq("reference_id", id);
  if (deleteLedgerError) throw deleteLedgerError;

  const remaining = calcRemaining(total, form.paid);
  if (remaining > 0 && form.shopkeeper_id) {
    const { error: ledgerError } = await supabase.from("ledger_entries").insert({
      shopkeeper_id: form.shopkeeper_id,
      entry_date: form.invoice_date,
      amount: remaining,
      entry_type: "debit",
      description: `Invoice ${mapped.invoice_number} — outstanding balance`,
      reference_type: "invoice",
      reference_id: id,
      created_by: userId,
    });
    if (ledgerError) throw ledgerError;
  }

  return mapped;
}

export async function deleteInvoice(id: string): Promise<void> {
  // Reverse the outstanding amount this invoice contributed to the customer
  // balance before removing its ledger entries (ledger deletes do not trigger
  // a balance recalculation).
  const { data: existing, error: existingError } = await supabase
    .from("invoices")
    .select("shopkeeper_id, total, amount_paid")
    .eq("id", id)
    .single();
  if (existingError) throw existingError;

  const oldRemaining = calcRemaining(Number(existing?.total ?? 0), Number(existing?.amount_paid ?? 0));
  const shopkeeperId = existing?.shopkeeper_id ?? null;

  const { error: ledgerError } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("reference_type", "invoice")
    .eq("reference_id", id);
  if (ledgerError) throw ledgerError;

  if (shopkeeperId && oldRemaining !== 0) {
    const { data: sk, error: skError } = await supabase
      .from("shopkeepers")
      .select("current_balance")
      .eq("id", shopkeeperId)
      .single();
    if (skError) throw skError;

    const { error: balError } = await supabase
      .from("shopkeepers")
      .update({ current_balance: Number(sk?.current_balance ?? 0) - oldRemaining })
      .eq("id", shopkeeperId);
    if (balError) throw balError;
  }

  const { error: itemsError } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
  if (itemsError) throw itemsError;

  const { error: invoiceError } = await supabase.from("invoices").delete().eq("id", id);
  if (invoiceError) throw invoiceError;
}


export function invalidateWholesaleQueries(queryClient: {
  invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void;
}) {
  queryClient.invalidateQueries({ queryKey: wholesaleKeys.all });
  queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  queryClient.invalidateQueries({ queryKey: ["ledger"] });
  queryClient.invalidateQueries({ queryKey: ["products"] });
}
