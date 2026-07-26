import { Search, Bell, Calendar as CalendarIcon, ChevronDown } from "lucide-react";

export function TopHeader() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-6">
      {/* Business name */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-foreground">Raza Mobile Parts</span>
          <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">
            LIVE
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">Karachi Warehouse · Fiscal '26</span>
      </div>

      {/* Search */}
      <div className="mx-4 flex flex-1 items-center">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products, invoices, suppliers…"
            className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground lg:flex">
          <CalendarIcon className="h-3.5 w-3.5 text-primary" />
          <span className="text-foreground">{today}</span>
        </div>

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

        <div className="mx-1 h-8 w-px bg-border" />

        <button className="flex items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-muted">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[oklch(0.4_0.2_275)] text-xs font-semibold text-primary-foreground">
            AR
          </div>
          <div className="hidden text-left md:block">
            <div className="text-xs font-semibold leading-tight text-foreground">Ahsan Raza</div>
            <div className="text-[10px] leading-tight text-muted-foreground">Owner</div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
