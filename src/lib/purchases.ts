import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

/**
 * Purchase order persistence.
 *
 * Stock is maintained by database triggers on `purchase_items`, so an edit
 * removes the old lines (reverting their stock) before writing the new ones.
 * That keeps inventory, cost price and every downstream report in sync.
 */

export interface PurchaseLineInput {
  product_id: string;
  quantity: number;
  unit_cost: number;
}

export interface PurchaseInput {
  supplier_id: string | null;
  purchase_date: string;
  status: string;
  notes: string | null;
  discount: number;
  items: PurchaseLineInput[];
}

export interface PurchaseItemRow {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  product?: { name: string; code: string } | null;
}

export const purchaseKeys = {
  list: ["purchases"] as const,
  items: (id: string) => ["purchase-items", id] as const,
};

export async function fetchPurchaseItems(purchaseId: string): Promise<PurchaseItemRow[]> {
  const { data, error } = await supabase
    .from("purchase_items")
    .select("id, product_id, quantity, unit_cost, subtotal, product:products(name, code)")
    .eq("purchase_id", purchaseId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PurchaseItemRow[];
}

function totals(input: PurchaseInput) {
  const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
  return { subtotal, total: Math.max(0, subtotal - (input.discount || 0)) };
}

async function writeItems(purchaseId: string, items: PurchaseLineInput[]) {
  const rows = items
    .filter((i) => i.product_id && i.quantity > 0)
    .map((i) => ({
      purchase_id: purchaseId,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
      subtotal: i.quantity * i.unit_cost,
    }));
  if (rows.length === 0) throw new Error("Add at least one line item");
  const { error } = await supabase.from("purchase_items").insert(rows);
  if (error) throw new Error(error.message);
}

/** Removes every line of a purchase; triggers roll the stock back. */
async function clearItems(purchaseId: string) {
  const { error } = await supabase.from("purchase_items").delete().eq("purchase_id", purchaseId);
  if (error) throw new Error(error.message);
}

export async function createPurchase(input: PurchaseInput): Promise<string> {
  const { subtotal, total } = totals(input);
  const purchaseNo = `PO-${Date.now().toString().slice(-8)}`;
  const { data, error } = await supabase
    .from("purchases")
    .insert({
      purchase_no: purchaseNo,
      supplier_id: input.supplier_id,
      purchase_date: input.purchase_date,
      status: input.status,
      notes: input.notes,
      discount: input.discount,
      subtotal,
      total,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await writeItems(data.id, input.items);
  await logAudit({ table: "purchases", recordId: data.id, label: purchaseNo, action: "create", after: { ...input, subtotal, total } });
  return data.id;
}

export async function updatePurchase(id: string, input: PurchaseInput): Promise<void> {
  const { data: before, error: beforeErr } = await supabase
    .from("purchases")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (beforeErr) throw new Error(beforeErr.message);
  if (!before) throw new Error("This purchase no longer exists.");

  const { subtotal, total } = totals(input);

  // Roll back the old stock movements, then apply the new lines.
  await clearItems(id);
  await writeItems(id, input.items);

  const { data, error } = await supabase
    .from("purchases")
    .update({
      supplier_id: input.supplier_id,
      purchase_date: input.purchase_date,
      status: input.status,
      notes: input.notes,
      discount: input.discount,
      subtotal,
      total,
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Nothing was updated — check your permissions.");

  await logAudit({
    table: "purchases",
    recordId: id,
    label: before.purchase_no,
    action: "update",
    before,
    after: { ...input, subtotal, total },
  });
}

export async function deletePurchase(id: string): Promise<void> {
  const { data: before } = await supabase.from("purchases").select("*").eq("id", id).maybeSingle();
  // Lines go first so the stock trigger reverses the received quantities.
  await clearItems(id);
  const { data, error } = await supabase.from("purchases").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Nothing was deleted — check your permissions.");
  await logAudit({
    table: "purchases",
    recordId: id,
    label: before?.purchase_no ?? "Purchase",
    action: "delete",
    before,
  });
}
