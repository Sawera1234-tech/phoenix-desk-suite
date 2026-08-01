import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { StatCard } from "@/components/phoenix/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { fmtRs, fmtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TrendingUp, Wallet, ShoppingCart, PackageSearch, Boxes, Users, Receipt, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports · Project Phoenix" },
      { name: "description", content: "Daily, weekly, monthly and custom-range business reports: sales, purchases, usage, stock movement, profit and outstanding balances." },
    ],
  }),
  component: ReportsPage,
});

type PeriodKey = "daily" | "weekly" | "monthly" | "custom";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function rangeFor(period: PeriodKey, from: string, to: string) {
  const today = new Date();
  if (period === "daily") return { from: iso(today), to: iso(today) };
  if (period === "weekly") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: iso(start), to: iso(today) };
  }
  if (period === "monthly") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(start), to: iso(today) };
  }
  return { from, to };
}

function ReportsPage() {
  const [period, setPeriod] = useState<PeriodKey>("daily");
  const [customFrom, setCustomFrom] = useState(iso(new Date()));
  const [customTo, setCustomTo] = useState(iso(new Date()));

  const range = useMemo(() => rangeFor(period, customFrom, customTo), [period, customFrom, customTo]);

  const { data, isFetching } = useQuery({
    queryKey: ["reports", range.from, range.to],
    queryFn: async () => {
      const [invoices, purchases, usage, products, shopkeepers] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_no, invoice_date, total, amount_paid, status, shopkeeper:shopkeepers(name)")
          .gte("invoice_date", range.from)
          .lte("invoice_date", range.to)
          .order("invoice_date", { ascending: false }),
        supabase
          .from("purchases")
          .select("id, purchase_no, purchase_date, total, status, supplier:suppliers(name)")
          .gte("purchase_date", range.from)
          .lte("purchase_date", range.to)
          .order("purchase_date", { ascending: false }),
        supabase
          .from("daily_usage")
          .select("id, usage_date, quantity, product:products(name, code, cost_price)")
          .gte("usage_date", range.from)
          .lte("usage_date", range.to),
        supabase.from("products").select("id, current_stock, cost_price"),
        supabase.from("shopkeepers").select("id, current_balance"),
      ]);

      const invRows = (invoices.data ?? []).filter((r) => r.status !== "cancelled");
      const sales = invRows.reduce((s, r) => s + Number(r.total ?? 0), 0);
      const collected = invRows.reduce((s, r) => s + Number(r.amount_paid ?? 0), 0);

      // Real gross profit from invoice lines vs product cost.
      let profit = 0;
      let unitsSold = 0;
      const ids = invRows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: lines } = await supabase
          .from("invoice_items")
          .select("quantity, unit_price, product:products(cost_price)")
          .in("invoice_id", ids);
        for (const l of lines ?? []) {
          const cost = Number((l.product as { cost_price?: number } | null)?.cost_price ?? 0);
          profit += (Number(l.unit_price ?? 0) - cost) * Number(l.quantity ?? 0);
          unitsSold += Number(l.quantity ?? 0);
        }
      }

      const purchaseRows = purchases.data ?? [];
      const purchaseTotal = purchaseRows.reduce((s, r) => s + Number(r.total ?? 0), 0);

      const usageRows = usage.data ?? [];
      const usageUnits = usageRows.reduce((s, r) => s + Number(r.quantity ?? 0), 0);
      const usageCost = usageRows.reduce(
        (s, r) => s + Number(r.quantity ?? 0) * Number((r.product as { cost_price?: number } | null)?.cost_price ?? 0),
        0,
      );

      const usageByProduct = new Map<string, { name: string; code: string; qty: number; value: number }>();
      for (const r of usageRows) {
        const p = r.product as { name?: string; code?: string; cost_price?: number } | null;
        const key = p?.code ?? "—";
        const prev = usageByProduct.get(key) ?? { name: p?.name ?? "—", code: key, qty: 0, value: 0 };
        prev.qty += Number(r.quantity ?? 0);
        prev.value += Number(r.quantity ?? 0) * Number(p?.cost_price ?? 0);
        usageByProduct.set(key, prev);
      }

      let purchasedUnits = 0;
      const pIds = purchaseRows.map((p) => p.id);
      if (pIds.length > 0) {
        const { data: pItems } = await supabase.from("purchase_items").select("quantity").in("purchase_id", pIds);
        purchasedUnits = (pItems ?? []).reduce((s, r) => s + Number(r.quantity ?? 0), 0);
      }

      const invValue = (products.data ?? []).reduce(
        (s, p) => s + Number(p.cost_price ?? 0) * Number(p.current_stock ?? 0),
        0,
      );
      const outstanding = (shopkeepers.data ?? []).reduce((s, r) => s + Number(r.current_balance ?? 0), 0);

      return {
        sales,
        collected,
        receivable: sales - collected,
        purchaseTotal,
        expenses: purchaseTotal + usageCost,
        profit,
        netProfit: profit - usageCost,
        usageUnits,
        usageCost,
        usageByProduct: [...usageByProduct.values()].sort((a, b) => b.qty - a.qty),
        unitsSold,
        purchasedUnits,
        stockMovement: purchasedUnits - unitsSold - usageUnits,
        invValue,
        outstanding,
        invoices: invRows,
        purchases: purchaseRows,
      };
    },
  });

  const tabs: { key: PeriodKey; label: string }[] = [
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "custom", label: "Custom Range" },
  ];

  return (
    <AppShell title="Reports" subtitle="Business Intelligence">
      <div className="mx-auto max-w-[1600px] space-y-6 p-6 xl:p-8">
        <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-card px-6 py-4 shadow-card">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setPeriod(t.key)}
                className={cn(
                  "rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                  period === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {period === "custom" ? (
            <div className="flex items-end gap-3">
              <div className="space-y-1.5"><Label className="text-[11px]">From</Label><Input type="date" className="h-9 w-[160px]" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-[11px]">To</Label><Input type="date" className="h-9 w-[160px]" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              {fmtDate(range.from)} — {fmtDate(range.to)}
              {isFetching && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
            </p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard icon={Wallet} label="Sales" value={fmtRs(data?.sales)} tone="primary" />
          <StatCard icon={TrendingUp} label="Gross Profit" value={fmtRs(data?.profit)} tone="success" />
          <StatCard icon={ShoppingCart} label="Purchases" value={fmtRs(data?.purchaseTotal)} tone="warning" />
          <StatCard icon={Receipt} label="Expenses (purchases + usage)" value={fmtRs(data?.expenses)} tone="warning" />
          <StatCard icon={PackageSearch} label="Daily Usage Units" value={String(data?.usageUnits ?? 0)} tone="neutral" />
          <StatCard icon={Boxes} label="Stock Movement (units)" value={String(data?.stockMovement ?? 0)} tone="neutral" />
          <StatCard icon={Boxes} label="Inventory Value" value={fmtRs(data?.invValue)} tone="primary" />
          <StatCard icon={Users} label="Outstanding Balance" value={fmtRs(data?.outstanding)} tone="destructive" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ReportTable
            title="Sales in period"
            subtitle={`${data?.invoices.length ?? 0} invoice(s) · collected ${fmtRs(data?.collected)} · receivable ${fmtRs(data?.receivable)}`}
            head={["Invoice", "Customer", "Date", "Total"]}
            rows={(data?.invoices ?? []).map((r) => [
              r.invoice_no,
              (r.shopkeeper as { name?: string } | null)?.name ?? "—",
              fmtDate(r.invoice_date),
              fmtRs(r.total),
            ])}
            empty="No sales in this period."
          />

          <ReportTable
            title="Purchases in period"
            subtitle={`${data?.purchases.length ?? 0} order(s) · ${data?.purchasedUnits ?? 0} unit(s) received`}
            head={["PO #", "Supplier", "Date", "Total"]}
            rows={(data?.purchases ?? []).map((r) => [
              r.purchase_no,
              (r.supplier as { name?: string } | null)?.name ?? "—",
              fmtDate(r.purchase_date),
              fmtRs(r.total),
            ])}
            empty="No purchases in this period."
          />
        </div>

        <ReportTable
          title="Daily usage in period"
          subtitle={`${data?.usageUnits ?? 0} unit(s) consumed · cost ${fmtRs(data?.usageCost)}`}
          head={["Code", "Product", "Qty Used", "Cost Value"]}
          rows={(data?.usageByProduct ?? []).map((u) => [u.code, u.name, String(u.qty), fmtRs(u.value)])}
          empty="No usage recorded in this period."
        />
      </div>
    </AppShell>
  );
}

function ReportTable({
  title,
  subtitle,
  head,
  rows,
  empty,
}: {
  title: string;
  subtitle: string;
  head: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-card">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        <p className="text-[12px] text-muted-foreground">{subtitle}</p>
      </header>
      <div className="max-h-[380px] overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              {head.map((h, i) => (
                <th key={h} className={cn("px-4 py-2 font-semibold", i === head.length - 1 && "text-right")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r[0]}-${i}`} className={i % 2 === 1 ? "bg-muted/25" : ""}>
                {r.map((c, j) => (
                  <td key={j} className={cn("px-4 py-2.5", j === r.length - 1 && "text-right font-semibold tabular-nums")}>{c}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={head.length} className="px-4 py-12 text-center text-[12px] text-muted-foreground">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
