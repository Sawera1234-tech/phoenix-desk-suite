import {
  Wallet,
  TrendingUp,
  Receipt,
  AlertTriangle,
  Boxes,
  PackageSearch,
  MoreHorizontal,
  ArrowRight,
  CheckCircle2,
  ShoppingCart,
  UserPlus,
  RefreshCw,
  FileText,
} from "lucide-react";
import { StatCard } from "./StatCard";
import { cn } from "@/lib/utils";

const purchases = [
  { id: "PO-2418", supplier: "Shenzhen Bright Ltd.", items: 42, amount: "Rs 486,200", status: "Received", date: "Today, 11:24" },
  { id: "PO-2417", supplier: "Al-Karam Traders", items: 18, amount: "Rs 132,800", status: "Pending", date: "Today, 09:02" },
  { id: "PO-2416", supplier: "MobileMart HK", items: 96, amount: "Rs 1,240,000", status: "In Transit", date: "Yesterday" },
  { id: "PO-2415", supplier: "Guangzhou Parts Co.", items: 24, amount: "Rs 318,500", status: "Received", date: "Yesterday" },
  { id: "PO-2414", supplier: "TechSource PK", items: 12, amount: "Rs 68,400", status: "Pending", date: "Jul 24" },
];

const lowStock = [
  { name: "iPhone 13 OLED Display", sku: "DISP-IP13-OG", stock: 3, min: 15, tone: "destructive" as const },
  { name: "Samsung A54 Battery", sku: "BAT-SM-A54", stock: 6, min: 20, tone: "destructive" as const },
  { name: "Type-C Charging Port (Redmi)", sku: "PORT-USBC-RD", stock: 9, min: 25, tone: "warning" as const },
  { name: "Tempered Glass 6.7\" Universal", sku: "TG-670-UNI", stock: 12, min: 30, tone: "warning" as const },
  { name: "Back Camera Lens Oppo A57", sku: "LNS-OP-A57", stock: 8, min: 20, tone: "warning" as const },
];

const activity = [
  { icon: ShoppingCart, tone: "primary", text: "Sale invoice #INV-8912 to Farhan Mobile", time: "12 min ago", meta: "Rs 24,600" },
  { icon: CheckCircle2, tone: "success", text: "PO-2418 marked as received", time: "1 hr ago", meta: "42 items" },
  { icon: UserPlus, tone: "primary", text: "New wholesale client added — Digital Zone", time: "3 hrs ago" },
  { icon: RefreshCw, tone: "warning", text: "Stock adjustment on DISP-IP12-OG", time: "5 hrs ago", meta: "-2 units" },
  { icon: FileText, tone: "neutral", text: "Daily usage sheet submitted", time: "8 hrs ago" },
];

const toneMap: Record<string, string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  destructive: "bg-destructive-soft text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

const statusMap: Record<string, string> = {
  Received: "bg-success-soft text-success",
  Pending: "bg-warning-soft text-warning",
  "In Transit": "bg-primary-soft text-primary",
};

export function Dashboard() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Home</span>
            <span>/</span>
            <span className="font-medium text-foreground">Dashboard</span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Good morning, Ahsan
          </h1>
          <p className="text-sm text-muted-foreground">
            Here's what's happening across your wholesale operation today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground shadow-card transition-colors hover:border-primary/40 hover:text-primary">
            <RefreshCw className="h-3.5 w-3.5" /> Sync
          </button>
          <button className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-elevated transition-colors hover:bg-primary/90">
            + New Purchase Order
          </button>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Today's Sales" value="Rs 348,200" sub="24 invoices" delta="12.4%" icon={Receipt} tone="primary" />
        <StatCard label="Today's Profit" value="Rs 62,480" sub="Margin 17.9%" delta="8.1%" icon={TrendingUp} tone="success" />
        <StatCard label="Outstanding Balance" value="Rs 1.24M" sub="18 customers" delta="3.2%" positive={false} icon={Wallet} tone="warning" />
        <StatCard label="Low Stock Items" value="14" sub="Below reorder point" delta="4 new" positive={false} icon={AlertTriangle} tone="destructive" />
        <StatCard label="Stock Value" value="Rs 18.7M" sub="Warehouse total" delta="1.8%" icon={Boxes} tone="primary" />
        <StatCard label="Total Products" value="2,486" sub="128 categories" delta="6 added" icon={PackageSearch} tone="neutral" />
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Recent Purchases */}
        <div className="rounded-xl border border-border bg-card shadow-card xl:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Recent Purchases</h2>
              <p className="text-xs text-muted-foreground">Last 5 supplier orders</p>
            </div>
            <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 text-left font-semibold">PO #</th>
                  <th className="py-2.5 text-left font-semibold">Supplier</th>
                  <th className="py-2.5 text-right font-semibold">Items</th>
                  <th className="py-2.5 text-right font-semibold">Amount</th>
                  <th className="py-2.5 text-left font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                    <td className="px-5 py-3 font-mono text-[12px] font-medium text-foreground">{p.id}</td>
                    <td className="py-3 text-foreground">{p.supplier}</td>
                    <td className="py-3 text-right text-muted-foreground">{p.items}</td>
                    <td className="py-3 text-right font-semibold tabular-nums text-foreground">{p.amount}</td>
                    <td className="py-3">
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold", statusMap[p.status])}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-muted-foreground">{p.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity */}
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
              <p className="text-xs text-muted-foreground">Real-time system events</p>
            </div>
            <button className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">
            <ol className="relative space-y-4 border-l border-dashed border-border pl-5">
              {activity.map((a, i) => {
                const Icon = a.icon;
                return (
                  <li key={i} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-card",
                        toneMap[a.tone],
                      )}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-foreground">{a.text}</span>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{a.time}</span>
                        {a.meta && (
                          <>
                            <span>·</span>
                            <span className="font-semibold text-foreground/70">{a.meta}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      {/* Low stock full width */}
      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Low Stock Alerts</h2>
              <p className="text-xs text-muted-foreground">Items at or below reorder threshold</p>
            </div>
          </div>
          <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Generate reorder <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 text-left font-semibold">Product</th>
              <th className="py-2.5 text-left font-semibold">SKU</th>
              <th className="py-2.5 text-right font-semibold">In Stock</th>
              <th className="py-2.5 text-right font-semibold">Min Level</th>
              <th className="py-2.5 text-left font-semibold">Fill Rate</th>
              <th className="px-5 py-2.5 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {lowStock.map((s) => {
              const pct = Math.min(100, Math.round((s.stock / s.min) * 100));
              const barColor = s.tone === "destructive" ? "bg-destructive" : "bg-warning";
              return (
                <tr key={s.sku} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                  <td className="px-5 py-3 font-medium text-foreground">{s.name}</td>
                  <td className="py-3 font-mono text-[12px] text-muted-foreground">{s.sku}</td>
                  <td className="py-3 text-right">
                    <span className={cn("font-semibold tabular-nums", s.tone === "destructive" ? "text-destructive" : "text-warning")}>
                      {s.stock}
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums text-muted-foreground">{s.min}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] font-medium text-muted-foreground">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-primary hover:text-primary">
                      Reorder
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
