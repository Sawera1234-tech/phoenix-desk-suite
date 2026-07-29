import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/phoenix/AppShell";
import { StatCard } from "@/components/phoenix/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { fmtRs } from "@/lib/format";
import { TrendingUp, Wallet, ShoppingCart, PackageSearch, Boxes, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports · Project Phoenix" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const [invoices, purchases, products, shopkeepers] = await Promise.all([
        supabase.from("invoices").select("total, amount_paid"),
        supabase.from("purchases").select("total"),
        supabase.from("products").select("id, current_stock, cost_price"),
        supabase.from("shopkeepers").select("id, current_balance"),
      ]);
      const sales = (invoices.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      const paid = (invoices.data ?? []).reduce((s, r) => s + Number(r.amount_paid ?? 0), 0);
      const cogs = (purchases.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      const invValue = (products.data ?? []).reduce((s, p) => s + Number(p.cost_price ?? 0) * Number(p.current_stock ?? 0), 0);
      const outstanding = (shopkeepers.data ?? []).reduce((s, r) => s + Number(r.current_balance ?? 0), 0);
      return {
        sales, paid, receivable: sales - paid, cogs, grossProfit: sales - cogs,
        invValue, outstanding,
        productCount: (products.data ?? []).length, shopCount: (shopkeepers.data ?? []).length,
      };
    },
  });

  return (
    <AppShell title="Reports" subtitle="Business Intelligence">
      <div className="mx-auto max-w-[1600px] space-y-6 p-6 xl:p-8">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard icon={Wallet} label="Total Sales" value={fmtRs(data?.sales)} tone="primary" />
          <StatCard icon={TrendingUp} label="Gross Profit" value={fmtRs(data?.grossProfit)} tone="success" />
          <StatCard icon={ShoppingCart} label="Purchases (COGS)" value={fmtRs(data?.cogs)} tone="warning" />
          <StatCard icon={Users} label="Receivable" value={fmtRs(data?.receivable)} tone="destructive" />
          <StatCard icon={Boxes} label="Inventory Value" value={fmtRs(data?.invValue)} tone="primary" />
          <StatCard icon={PackageSearch} label="Products" value={String(data?.productCount ?? 0)} tone="neutral" />
          <StatCard icon={Users} label="Market Shopkeepers" value={String(data?.shopCount ?? 0)} tone="neutral" />
          <StatCard icon={Wallet} label="Outstanding" value={fmtRs(data?.outstanding)} tone="warning" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
          <h2 className="text-[14px] font-semibold text-foreground">Advanced reports</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Sales by day, profit by product, aging receivables, supplier spend and stock movement reports are coming next.
            Live totals above reflect every invoice, purchase, and ledger entry captured in your workspace.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
