import { supabase } from "@/integrations/supabase/client";

/**
 * Change history + safe deletion helpers.
 *
 * Every create / update / delete performed through the UI is written to
 * `audit_log` so important records keep a readable history, and deletions are
 * checked against dependent tables first so linked data can never be orphaned.
 */

export type AuditAction = "create" | "update" | "delete";

export interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string | null;
  record_label: string | null;
  action: AuditAction;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  actor_id: string | null;
  actor_email: string | null;
  created_at: string;
}

export const auditKeys = {
  record: (table: string, id: string) => ["audit", table, id] as const,
  recent: ["audit", "recent"] as const,
};

/** Records an action. Never throws — history must not block a real mutation. */
export async function logAudit(input: {
  table: string;
  recordId?: string | null;
  label?: string | null;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;
    await supabase.from("audit_log").insert({
      table_name: input.table,
      record_id: input.recordId ?? null,
      record_label: input.label ?? null,
      action: input.action,
      before_data: (input.before ?? null) as never,
      after_data: (input.after ?? null) as never,
      actor_id: user.id,
      actor_email: user.email ?? null,
    });
  } catch {
    // History is best-effort.
  }
}

export async function fetchRecordHistory(table: string, recordId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("table_name", table)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as AuditEntry[];
}

export async function fetchRecentHistory(limit = 200): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AuditEntry[];
}

/** Tables that reference a given table, used to block unsafe deletions. */
type Dependency = { table: string; column: string; label: string };

const DEPENDENCIES: Record<string, Dependency[]> = {
  categories: [{ table: "products", column: "category_id", label: "product(s)" }],
  brands: [{ table: "products", column: "brand_id", label: "product(s)" }],
  suppliers: [
    { table: "products", column: "supplier_id", label: "product(s)" },
    { table: "purchases", column: "supplier_id", label: "purchase(s)" },
  ],
  products: [
    { table: "purchase_items", column: "product_id", label: "purchase line(s)" },
    { table: "invoice_items", column: "product_id", label: "invoice line(s)" },
    { table: "daily_usage", column: "product_id", label: "daily usage record(s)" },
  ],
  shopkeepers: [
    { table: "invoices", column: "shopkeeper_id", label: "invoice(s)" },
    { table: "ledger_entries", column: "shopkeeper_id", label: "ledger entry(s)" },
  ],
  purchases: [],
  invoices: [],
  daily_usage: [],
};

export interface DeleteBlock {
  blocked: boolean;
  reason?: string;
}

/** Counts dependent rows and returns a human readable reason when blocked. */
export async function checkDeletable(table: string, id: string): Promise<DeleteBlock> {
  const deps = DEPENDENCIES[table] ?? [];
  const found: string[] = [];
  for (const dep of deps) {
    const { count, error } = await supabase
      .from(dep.table as never)
      .select("id", { count: "exact", head: true })
      .eq(dep.column, id);
    if (error) continue;
    if ((count ?? 0) > 0) found.push(`${count} ${dep.label}`);
  }
  if (found.length === 0) return { blocked: false };
  return {
    blocked: true,
    reason: `This record is linked to ${found.join(", ")}. Remove or reassign them first, or mark this record inactive instead.`,
  };
}

/** True when the table carries an `is_active` flag we can use for soft delete. */
export const SOFT_DELETE_TABLES = new Set(["categories", "brands", "suppliers", "products"]);

/**
 * Deletes a record after checking dependents, verifying the row really went
 * away, and writing the change to history.
 */
export async function deleteRecord(opts: {
  table: string;
  id: string;
  label?: string;
  before?: Record<string, unknown> | null;
  /** Skip the dependency check (used by modules that unwind their own links). */
  force?: boolean;
}): Promise<void> {
  if (!opts.force) {
    const check = await checkDeletable(opts.table, opts.id);
    if (check.blocked) throw new Error(check.reason);
  }
  const { data, error } = await supabase
    .from(opts.table as never)
    .delete()
    .eq("id", opts.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Nothing was deleted — you may not have permission to remove this record.");
  }
  await logAudit({
    table: opts.table,
    recordId: opts.id,
    label: opts.label,
    action: "delete",
    before: opts.before ?? null,
  });
}

/** Marks a record inactive instead of deleting it. */
export async function deactivateRecord(table: string, id: string, label?: string): Promise<void> {
  const { data, error } = await supabase
    .from(table as never)
    .update({ is_active: false } as never)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not update this record.");
  await logAudit({ table, recordId: id, label, action: "update", after: { is_active: false } });
}
