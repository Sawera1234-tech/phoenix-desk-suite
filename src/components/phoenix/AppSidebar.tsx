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
  Tag,
  Layers,
  ListChecks,
} from "lucide-react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessProfile } from "@/components/wholesale/ThermalReceipt";
import { useEffect, useState } from "react";

type Item = { title: string; icon: typeof LayoutDashboard; to: string; shortcut?: string };

const workspace: Item[] = [
  { title: "Dashboard", icon: LayoutDashboard, to: "/", shortcut: "G D" },
  { title: "Products", icon: Package, to: "/products" },
  { title: "Categories", icon: Layers, to: "/categories" },
  { title: "Brands", icon: Tag, to: "/brands" },
  { title: "Suppliers", icon: Truck, to: "/suppliers" },
  { title: "Purchases", icon: ShoppingCart, to: "/purchases" },
  { title: "Daily Usage", icon: ClipboardList, to: "/daily-usage" },
  { title: "Demand List", icon: ListChecks, to: "/demand-list" },
];

const operations: Item[] = [
  { title: "Market Ledger", icon: BookOpen, to: "/shopkeepers" },
  { title: "Wholesale", icon: Store, to: "/wholesale" },
  { title: "Reports", icon: BarChart3, to: "/reports" },
  { title: "Settings", icon: Settings, to: "/settings" },
];

function NavItem({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-white"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-white",
      )}
    >
      <Icon
        className={cn(
          "h-[17px] w-[17px] shrink-0",
          active ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-white",
        )}
      />
      <span className="flex-1 truncate text-left">{item.title}</span>
      {item.shortcut && (
        <span className="rounded border border-sidebar-border/60 px-1 py-px font-mono text-[9px] font-semibold text-sidebar-foreground/50">
          {item.shortcut}
        </span>
      )}
    </Link>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setName((data.user?.user_metadata as { full_name?: string })?.full_name || (data.user?.email?.split("@")[0] ?? ""));
    });
  }, []);

  const initials = (name || email || "U")
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "U";

  const { data: business } = useBusinessProfile();
  const shopName = business?.shop_name?.trim() || "Project Phoenix";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login", search: { next: "/" } });
  }

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-[72px] items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Flame className="h-[18px] w-[18px]" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold text-white">{shopName}</span>
          <span className="truncate text-[11px] font-medium text-sidebar-foreground/55">
            Wholesale ERP · v3.0
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
          Workspace
        </div>
        <div className="space-y-0.5">
          {workspace.map((item) => (
            <NavItem key={item.to} item={item} active={isActive(item.to)} />
          ))}
        </div>

        <div className="mt-6 px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
          Operations
        </div>
        <div className="space-y-0.5">
          {operations.map((item) => (
            <NavItem key={item.to} item={item} active={isActive(item.to)} />
          ))}
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/40 p-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[11px] font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-white">{name || "User"}</div>
            <div className="truncate text-[10.5px] text-sidebar-foreground/55">{email}</div>
          </div>
          <button
            className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white"
            aria-label="Help"
          >
            <LifeBuoy className="h-4 w-4" />
          </button>
          <button
            onClick={signOut}
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
