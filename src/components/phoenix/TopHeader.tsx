import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Bell, Calendar as CalendarIcon, Command as CommandIcon, PackageX, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessProfile } from "@/components/wholesale/ThermalReceipt";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const NAV_TARGETS = [
  { label: "Dashboard", to: "/" },
  { label: "Products", to: "/products" },
  { label: "Suppliers", to: "/suppliers" },
  { label: "Purchases", to: "/purchases" },
  { label: "Daily Usage", to: "/daily-usage" },
  { label: "Market Ledger", to: "/shopkeepers" },
  { label: "Wholesale", to: "/wholesale" },
  { label: "Reports", to: "/reports" },
  { label: "Settings", to: "/settings" },
] as const;

export function TopHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: products = [] } = useQuery({
    queryKey: ["global-search-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, current_stock, min_stock")
        .order("name")
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["global-search-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_no, customer_name")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lowStock = products.filter((p) => p.current_stock <= p.min_stock);

  function go(to: string) {
    setSearchOpen(false);
    navigate({ to });
  }

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-5 border-b border-border bg-card px-8">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span>Raza Mobile Parts</span>
          <span className="text-border">/</span>
          <span>{subtitle ?? shopName}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold text-foreground">{title}</h1>
          <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
            Live
          </span>
        </div>
      </div>

      <div className="mx-auto flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="relative flex h-10 w-full max-w-[520px] items-center rounded-lg border border-border bg-background pl-10 pr-20 text-left text-[13px] text-muted-foreground transition-colors hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          Search products, invoices, pages…
          <kbd className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
            <CommandIcon className="h-2.5 w-2.5" /> K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[11.5px] font-medium lg:flex">
          <CalendarIcon className="h-3.5 w-3.5 text-primary" />
          <span className="text-foreground">{today}</span>
        </div>
        {actions}

        <Popover>
          <PopoverTrigger asChild>
            <button
              className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              aria-label={`Notifications (${lowStock.length})`}
            >
              <Bell className="h-[18px] w-[18px]" />
              {lowStock.length > 0 && (
                <span className="absolute right-2 top-2 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[13px] font-semibold">Notifications</span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {lowStock.length}
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {lowStock.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                  All stock levels are healthy.
                </p>
              ) : (
                lowStock.slice(0, 20).map((p) => (
                  <div key={p.id} className="flex items-start gap-2.5 border-b border-border/60 px-4 py-3 last:border-0">
                    {p.current_stock === 0 ? (
                      <PackageX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-foreground">{p.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {p.current_stock === 0 ? "Out of stock" : `${p.current_stock} left`} · min {p.min_stock}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-border px-4 py-2.5">
              <Link to="/products" className="text-[12px] font-medium text-primary hover:underline">
                View all products →
              </Link>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search products, invoices or pages…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {NAV_TARGETS.map((n) => (
              <CommandItem key={n.to} value={`page ${n.label}`} onSelect={() => go(n.to)}>
                {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Products">
            {products.slice(0, 60).map((p) => (
              <CommandItem key={p.id} value={`${p.code} ${p.name}`} onSelect={() => go("/products")}>
                <span className="font-mono text-[11px] text-muted-foreground">{p.code}</span>
                <span className="ml-2">{p.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Invoices">
            {invoices.map((inv) => (
              <CommandItem
                key={inv.id}
                value={`${inv.invoice_no} ${inv.customer_name ?? ""}`}
                onSelect={() => go("/wholesale")}
              >
                <span className="font-mono text-[11px] text-muted-foreground">{inv.invoice_no}</span>
                <span className="ml-2">{inv.customer_name ?? "Wholesale invoice"}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
