import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  shopkeepers?: Pick<Shopkeeper, "name"> | null;
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

export const STORE_NAME = "Raza Mobile Parts";

export function fmtRs(amount: number): string {
  return `Rs ${amount.toLocaleString("en-PK")}`;
}

export function calcLineTotal(quantity: number, unitPrice: number): number {
  return quantity * unitPrice;
}

export function calcSubtotal(lines: DraftLineItem[]): number {
  return lines.reduce((sum, line) => sum + calcLineTotal(line.quantity, line.unit_price), 0);
}

export function calcRemaining(total: number, paid: number): number {
  return Math.max(0, total - paid);
}

export function calcInvoiceStatus(total: number, paid: number): InvoiceStatus {
  if (total <= 0 || paid >= total) return "paid";
  if (paid > 0) return "partial";
  return "credit";
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

// ─── Supabase queries ─────────────────────────────────────────────────────────

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, shopkeepers(name)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Invoice[];
}

export async function fetchInvoiceWithItems(id: string): Promise<InvoiceWithItems> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*, shopkeepers(name)")
    .eq("id", id)
    .single();

  if (invoiceError) throw invoiceError;

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*, products(name, sku)")
    .eq("invoice_id", id)
    .order("created_at", { ascending: true });

  if (itemsError) throw itemsError;

  return {
    ...(invoice as Invoice),
    invoice_items: (items ?? []) as InvoiceItem[],
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, wholesale_price")
    .order("name");

  if (error) throw error;
  return (data ?? []) as Product[];
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
  const { data, error } = await supabase.from("invoices").select("total, paid, status, invoice_date");

  if (error) throw error;

  const invoices = data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  return {
    totalInvoices: invoices.length,
    todaySales: invoices
      .filter((inv) => inv.invoice_date === today)
      .reduce((sum, inv) => sum + Number(inv.total), 0),
    outstandingBalance: invoices.reduce(
      (sum, inv) => sum + Math.max(0, Number(inv.total) - Number(inv.paid)),
      0,
    ),
    partialCount: invoices.filter((inv) => inv.status === "partial").length,
  };
}

export async function generateInvoiceNumber(): Promise<string> {
  const { data, error } = await supabase
    .from("invoices")
    .select("invoice_number")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  const latest = data?.[0]?.invoice_number;
  if (!latest) return "INV-0001";

  const match = latest.match(/INV-(\d+)/i);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `INV-${String(next).padStart(4, "0")}`;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createInvoice(form: InvoiceFormData): Promise<Invoice> {
  const total = calcSubtotal(form.lines);
  const status = calcInvoiceStatus(total, form.paid);
  const invoiceNumber = await generateInvoiceNumber();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      invoice_date: form.invoice_date,
      shopkeeper_id: form.shopkeeper_id,
      total,
      paid: form.paid,
      status,
      notes: form.notes || null,
    })
    .select()
    .single();

  if (invoiceError) throw invoiceError;

  const itemsPayload = form.lines
    .filter((line) => line.product_id && line.quantity > 0)
    .map((line) => ({
      invoice_id: invoice.id,
      product_id: line.product_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: calcLineTotal(line.quantity, line.unit_price),
    }));

  if (itemsPayload.length > 0) {
    const { error: itemsError } = await supabase.from("invoice_items").insert(itemsPayload);
    if (itemsError) throw itemsError;
  }

  const remaining = calcRemaining(total, form.paid);
  if (remaining > 0) {
    const { error: ledgerError } = await supabase.from("ledger_entries").insert({
      invoice_id: invoice.id,
      shopkeeper_id: form.shopkeeper_id,
      amount: remaining,
      entry_type: "debit",
      description: `Invoice ${invoiceNumber} — outstanding balance`,
    });
    if (ledgerError) throw ledgerError;
  }

  return invoice as Invoice;
}

export async function updateInvoice(id: string, form: InvoiceFormData): Promise<Invoice> {
  const total = calcSubtotal(form.lines);
  const status = calcInvoiceStatus(total, form.paid);

  const { data: existing } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("id", id)
    .single();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .update({
      invoice_date: form.invoice_date,
      shopkeeper_id: form.shopkeeper_id,
      total,
      paid: form.paid,
      status,
      notes: form.notes || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (invoiceError) throw invoiceError;

  const { error: deleteItemsError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id);

  if (deleteItemsError) throw deleteItemsError;

  const itemsPayload = form.lines
    .filter((line) => line.product_id && line.quantity > 0)
    .map((line) => ({
      invoice_id: id,
      product_id: line.product_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: calcLineTotal(line.quantity, line.unit_price),
    }));

  if (itemsPayload.length > 0) {
    const { error: itemsError } = await supabase.from("invoice_items").insert(itemsPayload);
    if (itemsError) throw itemsError;
  }

  const { error: deleteLedgerError } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("invoice_id", id);

  if (deleteLedgerError) throw deleteLedgerError;

  const remaining = calcRemaining(total, form.paid);
  if (remaining > 0) {
    const invoiceNumber = existing?.invoice_number ?? invoice.invoice_number;
    const { error: ledgerError } = await supabase.from("ledger_entries").insert({
      invoice_id: id,
      shopkeeper_id: form.shopkeeper_id,
      amount: remaining,
      entry_type: "debit",
      description: `Invoice ${invoiceNumber} — outstanding balance`,
    });
    if (ledgerError) throw ledgerError;
  }

  return invoice as Invoice;
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error: ledgerError } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("invoice_id", id);

  if (ledgerError) throw ledgerError;

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id);

  if (itemsError) throw itemsError;

  const { error: invoiceError } = await supabase.from("invoices").delete().eq("id", id);

  if (invoiceError) throw invoiceError;
}

export function invalidateWholesaleQueries(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly string[] }) => void },
) {
  queryClient.invalidateQueries({ queryKey: wholesaleKeys.invoices() });
  queryClient.invalidateQueries({ queryKey: wholesaleKeys.stats() });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}
