import { useMemo, useState, type ReactNode } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: keyof T & string;
  label: string;
  align?: "left" | "right";
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
};

type SortDir = "asc" | "desc";

export function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  searchKeys,
  searchPlaceholder = "Search…",
  emptyMessage = "No records yet.",
  actions,
  initialSort,
  rowKey,
}: {
  rows: T[];
  columns: Column<T>[];
  searchKeys: (keyof T & string)[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  actions?: ReactNode;
  initialSort?: { key: keyof T & string; dir?: SortDir };
  rowKey: (row: T) => string;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string>(initialSort?.key ?? columns[0]?.key ?? "");
  const [sortDir, setSortDir] = useState<SortDir>(initialSort?.dir ?? "desc");

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const ql = q.toLowerCase();
    return rows.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(ql)));
  }, [rows, q, searchKeys]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const toggle = (k: string) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-72 rounded-md border border-border bg-background pl-8 pr-2 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </header>

      <div className="max-h-[calc(100vh-320px)] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted/70 text-[11px] uppercase tracking-wide backdrop-blur">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn("h-9 px-4 font-semibold", c.align === "right" ? "text-right" : "text-left")}
                >
                  {c.sortable === false ? (
                    <span className="text-muted-foreground">{c.label}</span>
                  ) : (
                    <button
                      onClick={() => toggle(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground",
                        sortKey === c.key ? "text-foreground" : "text-muted-foreground",
                        c.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {c.label}
                      <ArrowUpDown
                        className={cn(
                          "h-3 w-3 transition-opacity",
                          sortKey === c.key ? "opacity-100" : "opacity-40",
                          sortKey === c.key && sortDir === "desc" && "rotate-180",
                        )}
                      />
                    </button>
                  )}
                </th>
              ))}
            </tr>
            <tr>
              <th colSpan={columns.length} className="h-px bg-border p-0" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={rowKey(row)}
                className={cn("transition-colors hover:bg-primary-soft/40", i % 2 === 1 && "bg-muted/25")}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3",
                      c.align === "right" ? "text-right tabular-nums" : "text-foreground",
                      c.className,
                    )}
                  >
                    {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between border-t border-border px-6 py-3 text-[11.5px] text-muted-foreground">
        <span>
          Showing <span className="font-semibold text-foreground">{sorted.length}</span> of {rows.length}
        </span>
      </footer>
    </section>
  );
}

export function fmtRs(n: number | null | undefined) {
  return "Rs " + Number(n ?? 0).toLocaleString("en-PK");
}
