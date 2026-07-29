import { Search, Bell, Calendar as CalendarIcon, Command } from "lucide-react";
import type { ReactNode } from "react";

export function TopHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-5 border-b border-border bg-card px-8">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span>Raza Mobile Parts</span>
          <span className="text-border">/</span>
          <span>{subtitle ?? "Karachi Warehouse"}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-foreground">{title}</span>
          <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
            Live
          </span>
        </div>
      </div>

      <div className="mx-auto flex flex-1 items-center justify-center">
        <div className="relative w-full max-w-[520px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products, invoices, suppliers, SKUs…"
            className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-20 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
            <Command className="h-2.5 w-2.5" /> K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[11.5px] font-medium lg:flex">
          <CalendarIcon className="h-3.5 w-3.5 text-primary" />
          <span className="text-foreground">{today}</span>
        </div>
        {actions}
        <button
          className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-2 top-2 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
        </button>
      </div>
    </header>
  );
}
