import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/phoenix/AppShell";
import { StatCard } from "@/components/phoenix/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { fmtRs, fmtDate } from "@/lib/format";
import { Wallet, TrendingUp, Receipt, AlertTriangle, Boxes, PackageSearch } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Project Phoenix ERP" },
      { name: "description", content: "Wholesale ERP dashboard — real-time sales, profit, inventory and market ledger for mobile repair parts." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [invToday, products, shopkeepers, lowStockRes, purchases, activity] = await Promise.all([
        supabase.from("invoices").select("id, total, subtotal, status, invoice_date").eq("invoice_date", today),
        supabase.from("products").select("id, current_stock, cost_price, min_stock"),
        supabase.from("shopkeepers").select("current_balance"),
        supabase
          .from("products")
          .select("id, code, name, current_stock, min_stock")
          .order("current_stock", { ascending: true })
          .limit(6),
        supabase
          .from("purchases")
          .select("id, purchase_no, purchase_date, total, status, supplier:suppliers(name)")
          .order("purchase_date", { ascending: false })
          .limit(6),
        supabase
          .from("ledger_entries")
          .select("id, entry_date, entry_type, amount, description, shopkeeper:shopkeepers(name)")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      // Only completed (non-cancelled) invoices count towards today's sales.
      const todayInvoices = (invToday.data ?? []).filter((r) => r.status !== "cancelled");
      const todaySales = todayInvoices.reduce((s, r) => s + Number(r.total ?? 0), 0);

      // Real profit: (unit price − product cost) × quantity on today's invoice lines.
      let todayProfit = 0;
      const ids = todayInvoices.map((r) => r.id);
      if (ids.length > 0) {
        const { data: lines } = await supabase
          .from("invoice_items")
          .select("quantity, unit_price, product:products(cost_price)")
          .in("invoice_id", ids);
        todayProfit = (lines ?? []).reduce((s, l) => {
          const cost = Number((l.product as { cost_price?: number } | null)?.cost_price ?? 0);
          return s + (Number(l.unit_price ?? 0) - cost) * Number(l.quantity ?? 0);
        }, 0);
      }

      const outstanding = (shopkeepers.data ?? []).reduce((s, r) => s + Number(r.current_balance ?? 0), 0);
      const prods = products.data ?? [];
      const inventoryValue = prods.reduce((s, p) => s + Number(p.cost_price ?? 0) * Number(p.current_stock ?? 0), 0);
      const lowStockCount = prods.filter((p) => Number(p.current_stock ?? 0) <= Number(p.min_stock ?? 0)).length;


      return {
        todaySales,
        todayProfit,
        outstanding,
        lowStockCount,
        inventoryValue,
        totalProducts: prods.length,
        lowStock: lowStockRes.data ?? [],
        purchases: purchases.data ?? [],
        activity: activity.data ?? [],
      };
    },
  });

  const s = stats.data;

  return (
    <AppShell title="Dashboard" subtitle="Overview">
      <div className="mx-auto max-w-[1600px] space-y-6 p-6 xl:p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={Wallet} label="Today's Sales" value={fmtRs(s?.todaySales)} tone="primary" />
          <StatCard icon={TrendingUp} label="Today's Profit" value={fmtRs(s?.todayProfit)} tone="success" />
          <StatCard icon={Receipt} label="Outstanding Balance" value={fmtRs(s?.outstanding)} tone="warning" />
          <StatCard icon={AlertTriangle} label="Low Stock Items" value={String(s?.lowStockCount ?? 0)} tone="destructive" />
          <StatCard icon={Boxes} label="Inventory Value" value={fmtRs(s?.inventoryValue)} tone="primary" />
          <StatCard icon={PackageSearch} label="Total Products" value={String(s?.totalProducts ?? 0)} tone="neutral" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <section className="rounded-2xl border border-border bg-card shadow-card xl:col-span-3">
            <header className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-[14px] font-semibold text-foreground">Recent Purchases</h2>
                <p className="text-[12px] text-muted-foreground">Latest supplier orders</p>
              </div>
              <Link to="/purchases" className="text-[12px] font-semibold text-primary hover:underline">
                View all →
              </Link>
            </header>
            <div className="overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-semibold">PO #</th>
                    <th className="px-4 py-2 font-semibold">Supplier</th>
                    <th className="px-4 py-2 text-right font-semibold">Amount</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2 text-right font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(s?.purchases ?? []).map((p, i) => (
                    <tr key={p.id} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                      <td className="px-4 py-2.5 font-mono text-[12px] font-semibold">{p.purchase_no}</td>
                      <td className="px-4 py-2.5">{(p.supplier as { name?: string } | null)?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtRs(p.total)}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-semibold capitalize text-primary">
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[12px] text-muted-foreground">{fmtDate(p.purchase_date)}</td>
                    </tr>
                  ))}
                  {(!s || s.purchases.length === 0) && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-[12px] text-muted-foreground">No purchases recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card shadow-card xl:col-span-2">
            <header className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
                  <AlertTriangle className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-foreground">Low Stock</h2>
                  <p className="text-[12px] text-muted-foreground">Below reorder threshold</p>
                </div>
              </div>
              <Link to="/products" className="text-[12px] font-semibold text-primary hover:underline">View →</Link>
            </header>
            <div className="overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Product</th>
                    <th className="px-4 py-2 text-right font-semibold">Stock</th>
                    <th className="px-4 py-2 text-right font-semibold">Min</th>
                  </tr>
                </thead>
                <tbody>
                  {(s?.lowStock ?? []).map((p, i) => {
                    const critical = Number(p.current_stock ?? 0) <= Number(p.min_stock ?? 0);
                    return (
                      <tr key={p.id} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{p.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{p.code}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={critical ? "font-semibold text-destructive" : "font-semibold text-warning"}>{p.current_stock}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{p.min_stock}</td>
                      </tr>
                    );
                  })}
                  {(!s || s.lowStock.length === 0) && (
                    <tr><td colSpan={3} className="px-4 py-12 text-center text-[12px] text-muted-foreground">No products yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-border bg-card shadow-card">
          <header className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">Recent Activity</h2>
              <p className="text-[12px] text-muted-foreground">Latest ledger entries across market</p>
            </div>
            <Link to="/shopkeepers" className="text-[12px] font-semibold text-primary hover:underline">Open ledger →</Link>
          </header>
          <ol className="divide-y divide-border">
            {(s?.activity ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold uppercase text-primary">
                    {String(a.entry_type).slice(0, 2)}
                  </span>
                  <div>
                    <div className="text-[13px] font-medium text-foreground">
                      {(a.shopkeeper as { name?: string } | null)?.name ?? "—"}
                      <span className="ml-2 text-[11.5px] font-medium capitalize text-muted-foreground">{a.entry_type}</span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">{a.description ?? "No note"}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums text-foreground">{fmtRs(a.amount)}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtDate(a.entry_date)}</div>
                </div>
              </li>
            ))}
            {(!s || s.activity.length === 0) && (
              <li className="px-6 py-12 text-center text-[12px] text-muted-foreground">No ledger activity yet.</li>
            )}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
