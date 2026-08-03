import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, FileDown, Printer, RefreshCw, Search, ClipboardCheck } from "lucide-react";
import {
  demandKeys,
  fetchDemandRows,
  groupByCategory,
  printDemandList,
  readOrdered,
  sortDemand,
  writeOrdered,
  type DemandRow,
  type DemandSort,
} from "@/lib/demand";

export const Route = createFileRoute("/_authenticated/demand-list")({
  head: () => ({
    meta: [
      { title: "Demand List · Project Phoenix" },
      {
        name: "description",
        content: "Auto-generated restocking demand list grouped by category, ready for 80mm thermal printing.",
      },
      { property: "og:title", content: "Demand List · Project Phoenix" },
      { property: "og:description", content: "Auto-generated restocking demand list for suppliers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DemandListPage,
});

function DemandListPage() {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("all");
  const [sortMode, setSortMode] = useState<DemandSort>("category");
  const [ordered, setOrdered] = useState<string[]>([]);
  const [manualItems, setManualItems] = useState<DemandRow[]>([]);

  useEffect(() => setOrdered(readOrdered()), []);

  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: demandKeys.list,
    queryFn: fetchDemandRows,
    refetchOnWindowFocus: true,
  });

  // Categories stay in sync with the Categories module automatically.
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const visible = useMemo(() => {
    const q = term.trim().toLowerCase();
    const filtered = allrows.filter((r) => {
      if (category !== "all" && r.category_id !== category) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
    });
    return sortDemand(filtered, sortMode);
  }, [rows, term, category, sortMode]);

  const pending = visible.filter((r) => !ordered.includes(r.id));
  const groups = groupByCategory(sortMode === "category" ? visible : visible);

  function markOrdered(ids: string[]) {
    const next = [...new Set([...ordered, ...ids])];
    setOrdered(next);
    writeOrdered(next);
    toast.success(ids.length === 1 ? "Marked as ordered" : `${ids.length} products marked as ordered`);
  }

  function unmark(id: string) {
    const next = ordered.filter((x) => x !== id);
    setOrdered(next);
    writeOrdered(next);
  }

  async function print(size: "80mm" | "A4") {
    try {
      if (pending.length === 0) throw new Error("Nothing to print — every product is marked as ordered");
      await printDemandList(pending, size);
    } catch (e) {
      toast.error((e as Error).message || "Print failed");
    }
  }

  const totalRequired = pending.reduce((s, r) => s + r.required, 0);

  return (
    <AppShell title="Demand List" subtitle="Automatic Restocking Sheet">
      <div className="mx-auto max-w-[1400px] space-y-4 p-6 xl:p-8">
        <section className="rounded-2xl border border-border bg-card shadow-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">Products needing restock</h2>
              <p className="text-[12px] text-muted-foreground">
                Generated automatically from live stock — {pending.length} product(s), {totalRequired} unit(s) required.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={isFetching} onClick={() => refetch()}>
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => print("A4")}>
                <FileDown className="h-3.5 w-3.5" /> Export PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={pending.length === 0}
                onClick={() => markOrdered(pending.map((r) => r.id))}
              >
                <ClipboardCheck className="h-3.5 w-3.5" /> Mark all ordered
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => print("80mm")}>
                <Printer className="h-3.5 w-3.5" /> Print (80mm)
              </Button>
              <Button
  size="sm"
  onClick={async () => {
    const name = prompt("Product Name");
    if (!name) return;

    const qty = Number(prompt("Required Quantity") || "1");

    setManualItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        code: "MANUAL",
        unit: "pcs",
        category_id: null,
        category: "Manual",
        current_stock: 0,
        min_stock: 0,
        max_stock: qty,
        required: qty,
      },
    ]);

    toast.success("Manual product added");
  }}
>
  + Manual Product
</Button>
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search product, code or category…"
                className="h-9 pl-9"
                aria-label="Search demand list"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-[220px] text-[12.5px]" aria-label="Filter by category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as DemandSort)}>
              <SelectTrigger className="h-9 w-[230px] text-[12.5px]" aria-label="Sort demand list">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="category">Category</SelectItem>
                <SelectItem value="name">Product Name</SelectItem>
                <SelectItem value="lowest_stock">Lowest Stock First</SelectItem>
                <SelectItem value="highest_required">Highest Required Qty First</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <p className="px-6 py-10 text-center text-[12.5px] text-muted-foreground">Loading demand list…</p>
          ) : visible.length === 0 ? (
            <p className="px-6 py-10 text-center text-[12.5px] text-muted-foreground">
              Nothing to reorder — all stock is above the minimum level.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-muted/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-6 py-2.5 font-semibold">Product</th>
                    <th className="px-4 py-2.5 font-semibold">Category</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Current Stock</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Min Stock</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Required Qty</th>
                    <th className="px-4 py-2.5 font-semibold">Unit</th>
                    <th className="px-6 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.category}>
                    <tr>
                      <td colSpan={7} className="bg-primary-soft/60 px-6 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-primary">
                        {g.category} · {g.rows.length} product(s)
                      </td>
                    </tr>
                    {g.rows.map((r, i) => (
                      <DemandRowView
                        key={r.id}
                        row={r}
                        striped={i % 2 === 1}
                        ordered={ordered.includes(r.id)}
                        onMark={() => markOrdered([r.id])}
                        onUnmark={() => unmark(r.id)}
                      />
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function DemandRowView({
  row,
  striped,
  ordered,
  onMark,
  onUnmark,
}: {
  row: DemandRow;
  striped: boolean;
  ordered: boolean;
  onMark: () => void;
  onUnmark: () => void;
}) {
  return (
    <tr className={`${striped ? "bg-muted/25" : ""} ${ordered ? "opacity-55" : ""}`}>
      <td className="px-6 py-2.5">
        <div className="font-medium text-foreground">{row.name}</div>
        <div className="font-mono text-[11px] text-muted-foreground">{row.code}</div>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">{row.category}</td>
      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-destructive">{row.current_stock}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{row.min_stock}</td>
      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">{row.required}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{row.unit}</td>
      <td className="px-6 py-2.5 text-right">
        {ordered ? (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11.5px] text-success" onClick={onUnmark}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Ordered
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-7 text-[11.5px]" onClick={onMark}>
            Mark as ordered
          </Button>
        )}
      </td>
    </tr>
  );
}
