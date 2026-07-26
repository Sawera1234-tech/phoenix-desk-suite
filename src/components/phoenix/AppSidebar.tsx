import { useState } from "react";
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
  ChevronLeft,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { title: "Dashboard", icon: LayoutDashboard, active: true },
  { title: "Products", icon: Package },
  { title: "Suppliers", icon: Truck },
  { title: "Purchases", icon: ShoppingCart },
  { title: "Daily Usage", icon: ClipboardList },
  { title: "Market Ledger", icon: BookOpen },
  { title: "Wholesale", icon: Store },
  { title: "Reports", icon: BarChart3 },
  { title: "Settings", icon: Settings },
];

export function AppSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "relative flex flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-elevated">
          <Flame className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-white">Project Phoenix</span>
            <span className="truncate text-[11px] font-medium text-sidebar-foreground/60">
              Wholesale ERP v2.4
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {!collapsed && (
          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            Workspace
          </div>
        )}
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                item.active
                  ? "bg-sidebar-accent text-white shadow-[inset_2px_0_0_0_var(--sidebar-primary)]"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
                collapsed && "justify-center px-0",
              )}
              title={collapsed ? item.title : undefined}
            >
              <Icon className={cn("h-[18px] w-[18px] shrink-0", item.active && "text-sidebar-primary")} />
              {!collapsed && <span className="truncate">{item.title}</span>}
              {!collapsed && item.title === "Purchases" && (
                <span className="ml-auto rounded-md bg-sidebar-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-primary-foreground">
                  4
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / user */}
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "px-2")}>
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg p-2",
            collapsed ? "justify-center" : "bg-sidebar-accent/40",
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sidebar-primary to-primary text-xs font-semibold text-white">
            AR
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-white">Ahsan Raza</div>
              <div className="truncate text-[11px] text-sidebar-foreground/60">Administrator</div>
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-elevated transition-colors hover:text-primary"
        aria-label="Toggle sidebar"
      >
        <ChevronLeft
          className={cn("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")}
        />
      </button>
    </aside>
  );
}
