import {
  LayoutDashboard,
  Package,
  Truck,
  ShoppingCart,
  ClipboardList,
  BookOpen,
  Store,
  BarChart3,
  Settings,
  Flame,
  LifeBuoy,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const workspace = [
  { title: "Dashboard", icon: LayoutDashboard, active: true, shortcut: "G D" },
  { title: "Products", icon: Package, badge: "2,486" },
  { title: "Suppliers", icon: Truck },
  { title: "Purchases", icon: ShoppingCart, badge: "4" },
  { title: "Daily Usage", icon: ClipboardList },
];

const operations = [
  { title: "Market Ledger", icon: BookOpen },
  { title: "Wholesale", icon: Store },
  { title: "Reports", icon: BarChart3 },
  { title: "Settings", icon: Settings },
];

function NavItem({ item }: { item: (typeof workspace)[number] }) {
  const Icon = item.icon;
  return (
    <button
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
        item.active
          ? "bg-sidebar-accent text-white"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-white",
      )}
    >
      <Icon
        className={cn(
          "h-[17px] w-[17px] shrink-0",
          item.active ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-white",
        )}
      />
      <span className="flex-1 truncate text-left">{item.title}</span>
      {item.badge && (
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
            item.active
              ? "bg-white/15 text-white"
              : "bg-sidebar-accent/70 text-sidebar-foreground/80",
          )}
        >
          {item.badge}
        </span>
      )}
      {!item.badge && item.shortcut && (
        <span className="rounded border border-sidebar-border/60 px-1 py-px font-mono text-[9px] font-semibold text-sidebar-foreground/50">
          {item.shortcut}
        </span>
      )}
    </button>
  );
}

export function AppSidebar() {
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex h-[72px] items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Flame className="h-[18px] w-[18px]" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold text-white">Project Phoenix</span>
          <span className="truncate text-[11px] font-medium text-sidebar-foreground/55">
            Wholesale ERP · v2.4.1
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
          Workspace
        </div>
        <div className="space-y-0.5">
          {workspace.map((item) => (
            <NavItem key={item.title} item={item} />
          ))}
        </div>

        <div className="mt-6 px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
          Operations
        </div>
        <div className="space-y-0.5">
          {operations.map((item) => (
            <NavItem key={item.title} item={item} />
          ))}
        </div>

        {/* Storage widget */}
        <div className="mx-1 mt-6 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/30 p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-white">Storage</span>
            <span className="tabular-nums text-sidebar-foreground/60">64%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sidebar-border/50">
            <div className="h-full rounded-full bg-sidebar-primary" style={{ width: "64%" }} />
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-sidebar-foreground/55">
            12.8 GB of 20 GB used across invoices, media and reports.
          </p>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/40 p-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[11px] font-semibold text-white">
            AR
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-white">Ahsan Raza</div>
            <div className="truncate text-[10.5px] text-sidebar-foreground/55">
              admin@razamobile.pk
            </div>
          </div>
          <button
            className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white"
            aria-label="Help"
          >
            <LifeBuoy className="h-4 w-4" />
          </button>
          <button
            className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
