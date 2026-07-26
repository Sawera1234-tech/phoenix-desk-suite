import { useMemo, useState } from "react";
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
  Search,
  ArrowUpDown,
  Filter,
  Download,
} from "lucide-react";
import { StatCard } from "./StatCard";
import { cn } from "@/lib/utils";

type Purchase = {
  id: string;
  supplier: string;
  items: number;
  amount: number;
  status: "Received" | "Pending" | "In Transit";
  date: string;
};

const purchases: Purchase[] = [
  { id: "PO-2418", supplier: "Shenzhen Bright Ltd.", items: 42, amount: 486200, status: "Received", date: "Today, 11:24" },
  { id: "PO-2417", supplier: "Al-Karam Traders", items: 18, amount: 132800, status: "Pending", date: "Today, 09:02" },
  { id: "PO-2416", supplier: "MobileMart HK", items: 96, amount: 1240000, status: "In Transit", date: "Yesterday" },
  { id: "PO-2415", supplier: "Guangzhou Parts Co.", items: 24, amount: 318500, status: "Received", date: "Yesterday" },
  { id: "PO-2414", supplier: "TechSource PK", items: 12, amount: 68400, status: "Pending", date: "Jul 24" },
  { id: "PO-2413", supplier: "Karachi Wholesale Hub", items: 56, amount: 742100, status: "Received", date: "Jul 23" },
];

type StockRow = {
  name: string;
  sku: string;
  stock: number;
  min: number;
  tone: "destructive" | "warning";
};

const lowStock: StockRow[] = [
  { name: "iPhone 13 OLED Display", sku: "DISP-IP13-OG", stock: 3, min: 15, tone: "destructive" },
  { name: "Samsung A54 Battery", sku: "BAT-SM-A54", stock: 6, min: 20, tone: "destructive" },
  { name: "Type-C Charging Port", sku: "PORT-USBC-RD", stock: 9, min: 25, tone: "warning" },
  { name: "Tempered Glass 6.7\"", sku: "TG-670-UNI", stock: 12, min: 30, tone: "warning" },
  { name: "Back Camera Lens A57", sku: "LNS-OP-A57", stock: 8, min: 20, tone: "warning" },
  { name: "Redmi Note 12 LCD", sku: "DISP-RM-N12", stock: 4, min: 18, tone: "destructive" },
];

const activity = [
  { icon: ShoppingCart, tone: "primary", text: "Sale invoice #INV-8912 issued to Farhan Mobile", time: "12 min ago", meta: "Rs 24,600" },
  { icon: CheckCircle2, tone: "success", text: "PO-2418 marked as received from Shenzhen Bright Ltd.", time: "1 hr ago", meta: "42 items" },
  { icon: UserPlus, tone: "primary", text: "New wholesale client onboarded — Digital Zone Peshawar", time: "3 hrs ago" },
  { icon: RefreshCw, tone: "warning", text: "Stock adjustment applied to DISP-IP12-OG", time: "5 hrs ago", meta: "-2 units" },
  { icon: FileText, tone: "neutral", text: "Daily usage sheet submitted by counter #2", time: "8 hrs ago" },
  { icon: AlertTriangle, tone: "destructive", text: "Reorder threshold breached on 4 SKUs", time: "Yesterday", meta: "Auto flag" },
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

function fmtRs(n: number) {
  return "Rs " + n.toLocaleString("en-PK");
}

type SortDir = "asc" | "desc";

function useSortable<T, K extends keyof T>(rows: T[], initialKey: K, initialDir: SortDir = "desc") {
  const [key, setKey] = useState<K>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
      return dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [rows, key, dir]);
  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKey(k);
      setDir("asc");
    }
  };
  return { sorted, key, dir, toggle };
}

function SortHeader<T extends string>({
  label,
  field,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  field: T;
  active: boolean;
  dir: SortDir;
  onClick: (f: T) => void;
  align?: "left" | "right";
}) {
  return (
    <th className={cn("h-9 px-4 font-semibold", align === "right" ? "text-right" : "text-left")}>
      <button
        onClick={() => onClick(field)}
        className={cn(
          "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <ArrowUpDown
          className={cn(
            "h-3 w-3 transition-opacity",
            active ? "opacity-100" : "opacity-40",
            active && dir === "desc" && "rotate-180",
          )}
        />
      </button>
    </th>
  );
}

function RecentPurchases() {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      purchases.filter(
        (p) =>
          p.id.toLowerCase().includes(q.toLowerCase()) ||
          p.supplier.toLowerCase().includes(q.toLowerCase()),
      ),
    [q],
  );
  const { sorted, key, dir, toggle } = useSortable<Purchase, keyof Purchase>(filtered, "id", "desc");

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card shadow-card">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Recent Purchases</h2>
          <p className="text-[12px] text-muted-foreground">Latest supplier orders across warehouses</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search PO or supplier"
              className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <button className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-foreground hover:border-primary/40 hover:text-primary">
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>
          <button className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11.5px] font-medium text-foreground hover:border-primary/40 hover:text-primary">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </header>

      <div className="max-h-[360px] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted/70 text-[11px] uppercase tracking-wide backdrop-blur">
            <tr>
              <SortHeader label="PO #" field="id" active={key === "id"} dir={dir} onClick={toggle} />
              <SortHeader label="Supplier" field="supplier" active={key === "supplier"} dir={dir} onClick={toggle} />
              <SortHeader label="Items" field="items" active={key === "items"} dir={dir} onClick={toggle} align="right" />
              <SortHeader label="Amount" field="amount" active={key === "amount"} dir={dir} onClick={toggle} align="right" />
              <SortHeader label="Status" field="status" active={key === "status"} dir={dir} onClick={toggle} />
              <SortHeader label="Date" field="date" active={key === "date"} dir={dir} onClick={toggle} align="right" />
            </tr>
            <tr>
              <th colSpan={6} className="h-px bg-border p-0" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr
                key={p.id}
                className={cn(
                  "transition-colors hover:bg-primary-soft/40",
                  i % 2 === 1 && "bg-muted/25",
                )}
              >
                <td className="px-4 py-3 font-mono text-[12px] font-semibold text-foreground">{p.id}</td>
                <td className="px-4 py-3 text-foreground">{p.supplier}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{p.items}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{fmtRs(p.amount)}</td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold", statusMap[p.status])}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-[12px] text-muted-foreground">{p.date}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                  No purchases match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between border-t border-border px-6 py-3 text-[11.5px] text-muted-foreground">
        <span>
          Showing <span className="font-semibold text-foreground">{sorted.length}</span> of{" "}
          {purchases.length}
        </span>
        <button className="flex items-center gap-1 font-medium text-primary hover:underline">
          View all purchases <ArrowRight className="h-3 w-3" />
        </button>
      </footer>
    </section>
  );
}

function LowStockTable() {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      lowStock.filter(
        (s) =>
          s.name.toLowerCase().includes(q.toLowerCase()) ||
          s.sku.toLowerCase().includes(q.toLowerCase()),
      ),
    [q],
  );
  const { sorted, key, dir, toggle } = useSortable<StockRow, keyof StockRow>(filtered, "stock", "asc");

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card shadow-card">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Low Stock</h2>
            <p className="text-[12px] text-muted-foreground">Below reorder threshold</p>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU"
            className="h-8 w-44 rounded-md border border-border bg-background pl-8 pr-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </header>

      <div className="max-h-[360px] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted/70 text-[11px] uppercase tracking-wide backdrop-blur">
            <tr>
              <SortHeader label="Product" field="name" active={key === "name"} dir={dir} onClick={toggle} />
              <SortHeader label="Stock" field="stock" active={key === "stock"} dir={dir} onClick={toggle} align="right" />
              <SortHeader label="Min" field="min" active={key === "min"} dir={dir} onClick={toggle} align="right" />
              <th className="h-9 px-4 text-right font-semibold text-muted-foreground">Action</th>
            </tr>
            <tr>
              <th colSpan={4} className="h-px bg-border p-0" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const pct = Math.min(100, Math.round((s.stock / s.min) * 100));
              const barColor = s.tone === "destructive" ? "bg-destructive" : "bg-warning";
              return (
                <tr
                  key={s.sku}
                  className={cn(
                    "transition-colors hover:bg-primary-soft/40",
                    i % 2 === 1 && "bg-muted/25",
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{s.name}</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{s.sku}</span>
                      <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10.5px] font-medium text-muted-foreground">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        s.tone === "destructive" ? "text-destructive" : "text-warning",
                      )}
                    >
                      {s.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.min}</td>
                  <td className="px-4 py-3 text-right">
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

      <footer className="flex items-center justify-between border-t border-border px-6 py-3 text-[11.5px]">
        <span className="text-muted-foreground">
          <span className="font-semibold text-destructive">
            {lowStock.filter((s) => s.tone === "destructive").length}
          </span>{" "}
          critical ·{" "}
          <span className="font-semibold text-warning">
            {lowStock.filter((s) => s.tone === "warning").length}
          </span>{" "}
          warning
        </span>
        <button className="flex items-center gap-1 font-medium text-primary hover:underline">
          Generate reorder <ArrowRight className="h-3 w-3" />
        </button>
      </footer>
    </section>
  );
}

function ActivityTimeline() {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-card">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Recent Activity</h2>
          <p className="text-[12px] text-muted-foreground">Real-time system events across your workspace</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="rounded-md border border-border bg-background px-2.5 py-1 text-[11.5px] font-medium text-foreground hover:border-primary/40 hover:text-primary">
            Today
          </button>
          <button className="rounded-md px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            Week
          </button>
          <button className="rounded-md px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            All
          </button>
          <button className="ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="px-6 py-5">
        <ol className="relative grid grid-cols-1 gap-x-10 gap-y-5 border-l border-dashed border-border pl-6 lg:grid-cols-2">
          {activity.map((a, i) => {
            const Icon = a.icon;
            return (
              <li key={i} className="relative">
                <span
                  className={cn(
                    "absolute -left-[34px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-card",
                    toneMap[a.tone],
                  )}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <div className="flex flex-col">
                  <span className="text-[12.5px] font-medium text-foreground">{a.text}</span>
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
    </section>
  );
}

export function Dashboard() {
  return (
    <div className="mx-auto flex max-w-[1720px] flex-col gap-6 p-8">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Good morning, Ahsan
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Here's a live snapshot of your wholesale operation — Friday, fiscal week 30.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11.5px]">
          <div className="flex rounded-lg border border-border bg-card p-0.5 shadow-card">
            {["Day", "Week", "Month", "Quarter"].map((r, i) => (
              <button
                key={r}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  i === 1
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <button className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 font-medium text-foreground hover:border-primary/40 hover:text-primary">
            <RefreshCw className="h-3.5 w-3.5" /> Sync
          </button>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Today's Sales" value="Rs 348,200" sub="24 invoices" delta="12.4%" icon={Receipt} tone="primary" />
        <StatCard label="Today's Profit" value="Rs 62,480" sub="Margin 17.9%" delta="8.1%" icon={TrendingUp} tone="success" />
        <StatCard label="Outstanding Market Balance" value="Rs 1.24M" sub="18 customers" delta="3.2%" positive={false} icon={Wallet} tone="warning" />
        <StatCard label="Low Stock Items" value="14" sub="Below reorder point" delta="4 new" positive={false} icon={AlertTriangle} tone="destructive" />
        <StatCard label="Inventory Value" value="Rs 18.7M" sub="Warehouse total" delta="1.8%" icon={Boxes} tone="primary" />
        <StatCard label="Total Products" value="2,486" sub="128 categories" delta="6 added" icon={PackageSearch} tone="neutral" />
      </div>

      {/* Purchases + Low stock */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <RecentPurchases />
        </div>
        <div className="xl:col-span-2">
          <LowStockTable />
        </div>
      </div>

      {/* Activity timeline */}
      <ActivityTimeline />
    </div>
  );
}
