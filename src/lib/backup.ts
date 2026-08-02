import { supabase } from "@/integrations/supabase/client";

/**
 * Local + downloadable backup engine.
 *
 * Snapshots every business table into a single JSON document. Daily, weekly
 * and monthly snapshots are kept in separate local slots so the newest of each
 * cadence is always restorable from the device.
 */

export const BACKUP_TABLES = [
  "business_profile",
  "categories",
  "brands",
  "suppliers",
  "products",
  "purchases",
  "purchase_items",
  "shopkeepers",
  "ledger_entries",
  "invoices",
  "invoice_items",
  "daily_usage",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupCadence = "daily" | "weekly" | "monthly";

export interface BackupFile {
  app: "project-phoenix";
  version: 1;
  cadence: BackupCadence | "manual";
  created_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface BackupSlot {
  cadence: BackupCadence;
  created_at: string;
  rows: number;
  bytes: number;
  payload: string;
}

const SLOT_KEY = (c: BackupCadence) => `phoenix.backup.${c}`;
const SETTINGS_KEY = "phoenix.backup.settings";

export interface BackupSettings {
  auto: boolean;
  last_run: string | null;
  last_status: "idle" | "ok" | "error";
  last_message: string | null;
}

const DEFAULT_SETTINGS: BackupSettings = { auto: true, last_run: null, last_status: "idle", last_message: null };

export function readSettings(): BackupSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<BackupSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(patch: Partial<BackupSettings>): BackupSettings {
  const next = { ...readSettings(), ...patch };
  if (typeof window !== "undefined") window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function periodStamp(cadence: BackupCadence, d = new Date()): string {
  if (cadence === "daily") return d.toISOString().slice(0, 10);
  if (cadence === "monthly") return d.toISOString().slice(0, 7);
  // ISO-ish week bucket
  const start = new Date(d);
  start.setDate(start.getDate() - start.getDay());
  return `w-${start.toISOString().slice(0, 10)}`;
}

export async function createBackup(cadence: BackupCadence | "manual" = "manual"): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  for (const table of BACKUP_TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw new Error(`${table}: ${error.message}`);
    tables[table] = (data ?? []) as Record<string, unknown>[];
  }
  return { app: "project-phoenix", version: 1, cadence, created_at: new Date().toISOString(), tables };
}

export function countRows(file: BackupFile): number {
  return Object.values(file.tables).reduce((s, rows) => s + rows.length, 0);
}

export function readSlot(cadence: BackupCadence): BackupSlot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SLOT_KEY(cadence));
    return raw ? (JSON.parse(raw) as BackupSlot) : null;
  } catch {
    return null;
  }
}

export function readAllSlots(): BackupSlot[] {
  return (["daily", "weekly", "monthly"] as BackupCadence[])
    .map(readSlot)
    .filter((s): s is BackupSlot => !!s);
}

function writeSlot(cadence: BackupCadence, file: BackupFile) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(file);
  const slot: BackupSlot = {
    cadence,
    created_at: file.created_at,
    rows: countRows(file),
    bytes: payload.length,
    payload,
  };
  try {
    window.localStorage.setItem(SLOT_KEY(cadence), JSON.stringify(slot));
  } catch {
    // Storage full — drop the payload so at least the metadata survives.
    window.localStorage.setItem(SLOT_KEY(cadence), JSON.stringify({ ...slot, payload: "" }));
  }
}

/** True when the current period has no snapshot yet. */
export function isSlotDue(cadence: BackupCadence): boolean {
  const slot = readSlot(cadence);
  if (!slot) return true;
  return periodStamp(cadence, new Date(slot.created_at)) !== periodStamp(cadence);
}

/**
 * Runs any due daily/weekly/monthly snapshot in the background. Safe to call on
 * every page load — it exits immediately when nothing is due.
 */
export async function runAutoBackup(): Promise<BackupCadence[]> {
  const due = (["daily", "weekly", "monthly"] as BackupCadence[]).filter(isSlotDue);
  if (due.length === 0) return [];
  const file = await createBackup(due[0]);
  for (const cadence of due) writeSlot(cadence, { ...file, cadence });
  return due;
}

export async function backupNow(cadence: BackupCadence): Promise<BackupSlot> {
  const file = await createBackup(cadence);
  writeSlot(cadence, file);
  return readSlot(cadence)!;
}

export function downloadBackup(file: BackupFile, label = file.cadence) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `phoenix-backup-${label}-${file.created_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackup(text: string): BackupFile {
  const parsed = JSON.parse(text) as BackupFile;
  if (parsed?.app !== "project-phoenix" || !parsed.tables) {
    throw new Error("This file is not a Project Phoenix backup");
  }
  return parsed;
}

/**
 * Restores a backup by upserting rows in dependency order. Existing rows with
 * the same id are overwritten; rows created after the backup are left alone.
 */
export async function restoreBackup(file: BackupFile): Promise<number> {
  let restored = 0;
  const upsert = async (table: BackupTable, rows: Record<string, unknown>[]) => {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabase.from(table).upsert(chunk as never, { onConflict: "id" });
      if (error) throw new Error(`${table}: ${error.message}`);
      restored += chunk.length;
    }
  };

  for (const table of BACKUP_TABLES) {
    await upsert(table, file.tables[table] ?? []);
  }

  // Stock and balance triggers fire while restoring line items and ledger
  // entries, so replay products and shopkeepers last to restore their exact
  // recorded values.
  for (const table of ["products", "shopkeepers"] as BackupTable[]) {
    const rows = file.tables[table] ?? [];
    if (rows.length > 0) await upsert(table, rows);
  }

  return restored;
}

