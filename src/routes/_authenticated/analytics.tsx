import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AppShell } from "@/components/phoenix/AppShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtRs, fmtDate } from "@/lib/format";
import { AlertTriangle, TrendingUp, Lightbulb, BadgePercent } from "lucide-react";
import {
  analyticsKeys, byCategory, byProduct, dailyTrend, daysAgo, fetchSaleLines, inRange,
  leakage, periodKeys, recommendations, totalsFor,
} from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Profit Analytics · Project Phoenix" },
      { name: "description", content: "Real profit analytics: revenue, cost, margin, product performance, leakage and pricing recommendations." },
      { property: "og:title", content: "Profit Analytics · Project Phoenix" },
      { property: "og:description", content: "Revenue, cost, margin, product performance and pricing recommendations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const WINDOWS = [
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "180", label: "Last 6 months" },
  { key: "365", label: "Last 12 months" },
] as const;

function AnalyticsPage() {
  const [win, setWin] = useState<(typeof WINDOWS)[number]["key"]>("90");
  const days = Number(win);
  const from = daysAgo(days - 1);

  const { data: lines = [], isLoading } = useQuery({
    queryKey: analyticsKeys.lines(from),
    queryFn: () => fetchSaleLines(from),
  });

  const p = useMemo(() => periodKeys(), []);
  const today = useMemo(() => totalsFor(inRange(lines, p.today, p.today)), [lines, p]);
  const yesterday = useMemo(() => totalsFor(inRange(lines, p.yesterday, p.yesterday)), [lines, p]);
  const week = useMemo(() => totalsFor(inRange(lines, p.weekFrom, p.today)), [lines, p]);
  const month = useMemo(() => totalsFor(inRange(lines, p.monthFrom, p.today)), [lines, p]);
  const overall = useMemo(() => totalsFor(lines), [lines]);

  const trend = useMemo(() => dailyTrend(lines, from, days), [lines, from, days]);
  const products = useMemo(() => byProduct(lines), [lines]);
  const categories = useMemo(() => byCategory(lines), [lines]);
  const leaks = useMemo(() => leakage(lines), [lines]);
  const recs = useMemo(() => recommendations(lines), [lines]);

  const topSelling = [...products].sort((a, b) => b.units - a.units).slice(0, 8);
  const topProfitable = [...products].sort((a, b) => b.profit - a.profit).slice(0, 8);

  return (
    <AppShell title="Profit Analytics" subtitle="Margins & Performance">
      <div className="mx-auto max-w-[1400px] space-y-5 p-6 xl:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            Every figure is calculated live from saved invoices and current product cost prices.
          </p>
          <Select value={win} onValueChange={(v) => setWin(v as typeof win)}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => <SelectItem key={w.key} value={w.key}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ProfitCard label="Today's Profit" value={today.profit} sub={`Revenue ${fmtRs(today.revenue)}`} />
          <ProfitCard label="Yesterday's Profit" value={yesterday.profit} sub={`Revenue ${fmtRs(yesterday.revenue)}`} />
          <ProfitCard label="Last 7 Days Profit" value={week.profit} sub={`Revenue ${fmtRs(week.revenue)}`} />
          <ProfitCard label="This Month Profit" value={month.profit} sub={`Revenue ${fmtRs(month.revenue)}`} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Gross Revenue" value={fmtRs(overall.revenue)} />
          <Metric label="Total Cost" value={fmtRs(overall.cost)} />
          <Metric label="Net Profit" value={fmtRs(overall.profit)} strong />
          <Metric label="Profit Margin" value={`${overall.margin.toFixed(1)}%`} />
          <Metric label="Units Sold" value={String(overall.units)} />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-2">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Revenue & Profit Trend</h3>
            <div className="mt-4 h-[280px]">
              {isLoading ? (
                <Skeleton />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} fontSize={11} stroke="hsl(var(--muted-foreground))" minTickGap={24} />
                    <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" width={70} />
                    <Tooltip formatter={(v: number) => fmtRs(v)} labelFormatter={(d) => fmtDate(String(d))} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Revenue" />
                    <Line type="monotone" dataKey="profit" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Profit" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold"><BadgePercent className="h-4 w-4 text-primary" /> Profit by Category</h3>
            <div className="mt-4 h-[280px]">
              {isLoading ? (
                <Skeleton />
              ) : categories.length === 0 ? (
                <Empty />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...categories].sort((a, b) => b.profit - a.profit).slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" fontSize={10} stroke="hsl(var(--muted-foreground))" interval={0} angle={-20} height={50} textAnchor="end" />
                    <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" width={64} />
                    <Tooltip formatter={(v: number) => fmtRs(v)} />
                    <Bar dataKey="profit" radius={[6, 6, 0, 0]}>
                      {categories.map((c) => (
                        <Cell key={c.key} fill={c.profit >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="selling">
          <TabsList>
            <TabsTrigger value="selling">Top Selling</TabsTrigger>
            <TabsTrigger value="profitable">Most Profitable</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>
          <TabsContent value="selling" className="mt-4"><PerfTable rows={topSelling} /></TabsContent>
          <TabsContent value="profitable" className="mt-4"><PerfTable rows={topProfitable} /></TabsContent>
          <TabsContent value="categories" className="mt-4"><PerfTable rows={[...categories].sort((a, b) => b.profit - a.profit)} /></TabsContent>
        </Tabs>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold"><AlertTriangle className="h-4 w-4 text-warning" /> Profit Leakage</h3>
            <div className="mt-3 space-y-2">
              {leaks.length === 0 && <p className="py-6 text-center text-[13px] text-muted-foreground">No loss-making or thin-margin lines found.</p>}
              {leaks.map((l) => (
                <div key={l.name} className="flex items-start justify-between gap-3 rounded-xl border border-border px-4 py-3">
                  <div>
                    <div className="text-[13px] font-semibold">{l.name}</div>
                    <div className="text-[12px] text-muted-foreground">{l.detail}</div>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${l.severity === "critical" ? "bg-destructive/10 text-destructive" : "bg-warning-soft text-warning"}`}>
                    {l.severity === "critical" ? "Below cost" : "Thin margin"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold"><Lightbulb className="h-4 w-4 text-primary" /> Recommendations</h3>
            <div className="mt-3 space-y-2">
              {recs.map((r) => (
                <div key={r.title} className="rounded-xl border border-border px-4 py-3">
                  <div className="text-[13px] font-semibold">{r.title}</div>
                  <div className="text-[12px] text-muted-foreground">{r.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Skeleton() {
  return <div className="h-full w-full animate-pulse rounded-xl bg-muted/50" />;
}

function Empty() {
  return <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">No sales in this period.</div>;
}

function ProfitCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[24px] font-bold tabular-nums ${value < 0 ? "text-destructive" : "text-foreground"}`}>{fmtRs(value)}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 tabular-nums ${strong ? "text-[18px] font-bold" : "text-[15px] font-semibold"}`}>{value}</div>
    </div>
  );
}

function PerfTable({ rows }: { rows: { key: string; name: string; units: number; revenue: number; cost: number; profit: number; margin: number }[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-[13px]">
        <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5 text-right">Units</th>
            <th className="px-4 py-2.5 text-right">Revenue</th>
            <th className="px-4 py-2.5 text-right">Cost</th>
            <th className="px-4 py-2.5 text-right">Profit</th>
            <th className="px-4 py-2.5 text-right">Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className={i % 2 === 1 ? "bg-muted/15" : ""}>
              <td className="px-4 py-2.5 font-medium">{r.name}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.units}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmtRs(r.revenue)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtRs(r.cost)}</td>
              <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${r.profit < 0 ? "text-destructive" : "text-success"}`}>{fmtRs(r.profit)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.margin.toFixed(1)}%</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No sales in this period.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
