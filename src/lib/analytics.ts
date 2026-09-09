import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Profit Analytics — every figure is derived from stored invoice lines and the
// product cost price at query time. Nothing is cached or hardcoded.
//   Revenue = Σ (unit_price × qty)  ·  Cost = Σ (cost_price × qty)
//   Profit  = Revenue − Cost        ·  Margin = Profit / Revenue
// ─────────────────────────────────────────────────────────────────────────────

const n = (v: unknown) => Math.round((Number(v ?? 0) + Number.EPSILON) * 100) / 100;

export type SaleLine = {
  invoice_id: string;
  invoice_date: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  product_id: string;
  product_name: string;
  category: string;
  revenue: number;
  cost: number;
  profit: number;
};

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return iso(d);
}

export const analyticsKeys = { lines: (from: string) => ["profit-analytics", from] as const };

/** All non-cancelled invoice lines since `from`, enriched with cost + category. */
export async function fetchSaleLines(from: string): Promise<SaleLine[]> {
  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_date, status, discount")
    .gte("invoice_date", from);
  if (invErr) throw new Error(invErr.message);

  const live = (invoices ?? []).filter((i) => i.status !== "cancelled");
  if (live.length === 0) return [];
  const dateById = new Map(live.map((i) => [i.id, i.invoice_date]));

  const ids = live.map((i) => i.id);
  const { data: items, error: itemErr } = await supabase
    .from("invoice_items")
    .select("invoice_id, product_id, quantity, unit_price, product:products(name, cost_price, category:categories(name))")
    .in("invoice_id", ids);
  if (itemErr) throw new Error(itemErr.message);

  return (items ?? []).map((l) => {
    const product = l.product as
      | { name?: string; cost_price?: number; category?: { name?: string } | null }
      | null;
    const qty = Number(l.quantity ?? 0);
    const price = Number(l.unit_price ?? 0);
    const cost = Number(product?.cost_price ?? 0);
    return {
      invoice_id: l.invoice_id,
      invoice_date: dateById.get(l.invoice_id) ?? from,
      quantity: qty,
      unit_price: price,
      cost_price: cost,
      product_id: l.product_id,
      product_name: product?.name ?? "Unknown product",
      category: product?.category?.name ?? "Uncategorised",
      revenue: n(price * qty),
      cost: n(cost * qty),
      profit: n((price - cost) * qty),
    };
  });
}

// ─── Aggregations ────────────────────────────────────────────────────────────

export type Totals = { revenue: number; cost: number; profit: number; margin: number; units: number };

export function totalsFor(lines: SaleLine[]): Totals {
  const revenue = n(lines.reduce((s, l) => s + l.revenue, 0));
  const cost = n(lines.reduce((s, l) => s + l.cost, 0));
  const profit = n(revenue - cost);
  return {
    revenue,
    cost,
    profit,
    margin: revenue > 0 ? n((profit / revenue) * 100) : 0,
    units: lines.reduce((s, l) => s + l.quantity, 0),
  };
}

export function inRange(lines: SaleLine[], from: string, to: string): SaleLine[] {
  return lines.filter((l) => l.invoice_date >= from && l.invoice_date <= to);
}

export function periodKeys() {
  const today = iso(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = iso(y);
  const now = new Date();
  return {
    today,
    yesterday,
    weekFrom: daysAgo(6),
    monthFrom: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
  };
}

export type TrendPoint = { date: string; revenue: number; profit: number };

export function dailyTrend(lines: SaleLine[], from: string, days: number): TrendPoint[] {
  const buckets = new Map<string, TrendPoint>();
  const start = new Date(`${from}T00:00:00`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    buckets.set(iso(d), { date: iso(d), revenue: 0, profit: 0 });
  }
  for (const l of lines) {
    const b = buckets.get(l.invoice_date);
    if (!b) continue;
    b.revenue = n(b.revenue + l.revenue);
    b.profit = n(b.profit + l.profit);
  }
  return [...buckets.values()];
}

export type GroupRow = {
  key: string;
  name: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

function group(lines: SaleLine[], keyOf: (l: SaleLine) => [string, string]): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const l of lines) {
    const [key, name] = keyOf(l);
    const row = map.get(key) ?? { key, name, units: 0, revenue: 0, cost: 0, profit: 0, margin: 0 };
    row.units += l.quantity;
    row.revenue = n(row.revenue + l.revenue);
    row.cost = n(row.cost + l.cost);
    row.profit = n(row.profit + l.profit);
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({
    ...r,
    margin: r.revenue > 0 ? n((r.profit / r.revenue) * 100) : 0,
  }));
}

export function byProduct(lines: SaleLine[]): GroupRow[] {
  return group(lines, (l) => [l.product_id, l.product_name]);
}

export function byCategory(lines: SaleLine[]): GroupRow[] {
  return group(lines, (l) => [l.category, l.category]);
}

// ─── Leakage + recommendations ───────────────────────────────────────────────

export type Leak = { name: string; detail: string; amount: number; severity: "critical" | "warning" };

export function leakage(lines: SaleLine[]): Leak[] {
  const products = byProduct(lines);
  const belowCost = products
    .filter((p) => p.profit < 0)
    .map<Leak>((p) => ({
      name: p.name,
      detail: `Sold below cost — losing ${Math.abs(p.profit).toFixed(0)} on ${p.units} units`,
      amount: p.profit,
      severity: "critical",
    }));
  const thin = products
    .filter((p) => p.profit >= 0 && p.revenue > 0 && p.margin < 5)
    .map<Leak>((p) => ({
      name: p.name,
      detail: `Very thin margin (${p.margin.toFixed(1)}%) across ${p.units} units`,
      amount: p.profit,
      severity: "warning",
    }));
  return [...belowCost, ...thin].sort((a, b) => a.amount - b.amount).slice(0, 12);
}

export type Recommendation = { title: string; detail: string; kind: "price" | "promote" | "review" };

export function recommendations(lines: SaleLine[]): Recommendation[] {
  const products = byProduct(lines);
  const out: Recommendation[] = [];

  for (const p of products.filter((p) => p.margin < 8 && p.units >= 3).slice(0, 4)) {
    const suggested = p.units > 0 ? (p.cost / p.units) * 1.15 : 0;
    out.push({
      kind: "price",
      title: `Raise the price of ${p.name}`,
      detail: `Margin is only ${p.margin.toFixed(1)}%. A price around ${suggested.toFixed(0)} per unit would restore a healthy 15% margin.`,
    });
  }

  for (const p of [...products].sort((a, b) => b.margin - a.margin).filter((p) => p.margin > 25 && p.units < 10).slice(0, 3)) {
    out.push({
      kind: "promote",
      title: `Promote ${p.name}`,
      detail: `Strong ${p.margin.toFixed(1)}% margin but only ${p.units} units sold. Pushing this line adds profit fast.`,
    });
  }

  const slow = [...products].sort((a, b) => a.profit - b.profit)[0];
  if (slow && slow.profit < 0) {
    out.push({
      kind: "review",
      title: `Review the cost of ${slow.name}`,
      detail: `This line is making a loss overall. Check the supplier cost or stop discounting it.`,
    });
  }

  if (out.length === 0) {
    out.push({
      kind: "review",
      title: "Margins look healthy",
      detail: "No loss-making or thin-margin lines were found in this period. Keep pricing as it is.",
    });
  }
  return out;
}
