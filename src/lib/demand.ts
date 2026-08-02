import { supabase } from "@/integrations/supabase/client";
import { fetchBusinessProfile } from "@/components/wholesale/ThermalReceipt";

/**
 * Demand list engine.
 *
 * The list is always derived from live product stock — it is never authored by
 * hand. A product appears when current stock has fallen to (or below) its
 * minimum stock level. Required quantity tops the product back up to its
 * maximum stock level, falling back to the minimum when no maximum is set.
 */

export type DemandRow = {
  id: string;
  name: string;
  code: string;
  unit: string;
  category_id: string | null;
  category: string;
  current_stock: number;
  min_stock: number;
  max_stock: number;
  required: number;
};

export type DemandSort = "category" | "name" | "lowest_stock" | "highest_required";

export const demandKeys = {
  list: ["demand-list"] as const,
};

export function requiredQty(current: number, min: number, max: number): number {
  const target = max > 0 ? max : min;
  return Math.max(0, Math.ceil(target - current));
}

export async function fetchDemandRows(): Promise<DemandRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, code, unit, category_id, current_stock, min_stock, max_stock, categories(name)")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    name: string;
    code: string;
    unit: string | null;
    category_id: string | null;
    current_stock: number | null;
    min_stock: number | null;
    max_stock: number | null;
    categories: { name: string } | null;
  }>;

  return rows
    .map((p) => {
      const current = Number(p.current_stock ?? 0);
      const min = Number(p.min_stock ?? 0);
      const max = Number(p.max_stock ?? 0);
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        unit: p.unit?.trim() || "pcs",
        category_id: p.category_id,
        category: p.categories?.name ?? "Uncategorised",
        current_stock: current,
        min_stock: min,
        max_stock: max,
        required: requiredQty(current, min, max),
      };
    })
    .filter((r) => r.current_stock <= r.min_stock && r.required > 0);
}

export function sortDemand(rows: DemandRow[], mode: DemandSort): DemandRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (mode) {
      case "name":
        return a.name.localeCompare(b.name);
      case "lowest_stock":
        return a.current_stock - b.current_stock || a.name.localeCompare(b.name);
      case "highest_required":
        return b.required - a.required || a.name.localeCompare(b.name);
      default:
        return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    }
  });
  return copy;
}

export function groupByCategory(rows: DemandRow[]): Array<{ category: string; rows: DemandRow[] }> {
  const map = new Map<string, DemandRow[]>();
  for (const r of rows) {
    const list = map.get(r.category) ?? [];
    list.push(r);
    map.set(r.category, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, list]) => ({ category, rows: list }));
}

// ── "Mark as ordered" state (device-local, resets every day) ────────────────

const orderedKey = () => `phoenix.demand.ordered.${new Date().toISOString().slice(0, 10)}`;

export function readOrdered(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(orderedKey()) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function writeOrdered(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(orderedKey(), JSON.stringify([...new Set(ids)]));
}

// ── Printing ────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

function stamp(d: Date) {
  return `${d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })} ${d.toLocaleTimeString(
    "en-PK",
    { hour: "2-digit", minute: "2-digit" },
  )}`;
}

async function buildDemandHtml(rows: DemandRow[], pageSize: "80mm" | "A4") {
  const business = await fetchBusinessProfile().catch(() => null);
  const groups = groupByCategory(rows);
  const now = new Date();
  const width = pageSize === "80mm" ? "72mm" : "170mm";

  const body = groups
    .map(
      (g) => `
    <div class="sep"></div>
    <div class="cat">Category: ${esc(g.category)}</div>
    <div class="sep"></div>
    ${g.rows
      .map(
        (r) => `<div class="item">
          <div class="pname">${esc(r.name)}</div>
          <div class="line">Stock: ${r.current_stock} ${esc(r.unit)}</div>
          <div class="line">Need: ${r.required} ${esc(r.unit)}</div>
        </div>`,
      )
      .join("")}`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><title>Demand List</title><style>
    @page { size: ${pageSize === "80mm" ? "80mm auto" : "A4"}; margin: ${pageSize === "80mm" ? "3mm" : "12mm"}; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { width:${width}; margin:0 auto; font-family:'Courier New', monospace; font-size:13px; font-weight:700; line-height:1.5; color:#000; background:#fff; }
    .center { text-align:center; }
    .shop { font-size:16px; font-weight:800; text-transform:uppercase; }
    .muted { font-weight:700; font-size:12px; }
    .title { margin-top:6px; font-size:14px; letter-spacing:2px; text-transform:uppercase; }
    .sep { border-top:1px dashed #000; margin:6px 0; }
    .cat { text-transform:uppercase; }
    .item { margin-bottom:6px; }
    .pname { text-transform:uppercase; }
    .line { padding-left:2mm; font-weight:700; }
  </style></head><body>
    <div class="sep"></div>
    <div class="center">
      <div class="shop">${esc(business?.shop_name?.trim() || "Demand List")}</div>
      ${business?.address ? `<div class="muted">${esc(business.address)}</div>` : ""}
      ${business?.phone ? `<div class="muted">Phone: ${esc(business.phone)}</div>` : ""}
    </div>
    <div class="sep"></div>
    <div class="center title">Demand List</div>
    <div class="center muted">Generated: ${stamp(now)}</div>
    ${body}
    <div class="sep"></div>
    <div>Total Products: ${rows.length}</div>
    <div class="sep"></div>
    <div class="center muted">${stamp(now)}</div>
    <div class="sep"></div>
  </body></html>`;
}

export async function printDemandList(rows: DemandRow[], pageSize: "80mm" | "A4" = "80mm") {
  const html = await buildDemandHtml(rows, pageSize);
  const win = window.open("", "_blank", "width=380,height=700");
  if (!win) throw new Error("Allow pop-ups to print the demand list");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 350);
}
