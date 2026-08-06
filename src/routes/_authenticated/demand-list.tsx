import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, FileDown, Minus, Plus, Printer, RefreshCw, Search, ClipboardCheck, X } from "lucide-react";
import {
  demandKeys,
  fetchDemandRows,
  groupByCategory,
  printDemandList,
  readOrdered,
  readQtyOverrides,
  sortDemand,
  writeOrdered,
  writeQtyOverrides,
  type DemandRow,
  type DemandSort,
  type QtyOverrides,
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

type ManualRow = DemandRow & { manual: true; rowId: string };

const manualKey = ["demand-manual-items"] as const;

function DemandListPage() {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("all");
  const [sortMode, setSortMode] = useState<DemandSort>("category");
  const [ordered, setOrdered] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<QtyOverrides>({});

  useEffect(() => {
    setOrdered(readOrdered());
    setOverrides(readQtyOverrides());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(productSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  // ── Automatic demand (unchanged engine) ───────────────────────────────────
  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: demandKeys.list,
    queryFn: fetchDemandRows,
    refetchOnWindowFocus: true,
  });

  // ── Manual items (persisted) ──────────────────────────────────────────────
  const { data: manualItems = [] } = useQuery({
    queryKey: manualKey,
    queryFn: async (): Promise<ManualRow[]> => {
      const { data, error } = await supabase
        .from("demand_manual_items")
        .select(
          "id, product_id, product_name, code, unit, quantity, products(current_stock, min_stock, max_stock, category_id, categories(name))",
        )
        .order("created_at");
      if (error) throw error;
      return ((data ?? []) as unknown as Array<{
        id: string;
        product_id: string | null;
        product_name: string;
        code: string;
        unit: string;
        quantity: number;
        products: {
          current_stock: number | null;
          min_stock: number | null;
          max_stock: number | null;
          category_id: string | null;
          categories: { name: string } | null;
        } | null;
      }>).map((r) => ({
        id: r.product_id ?? r.id,
        rowId: r.id,
        manual: true as const,
        name: r.product_name,
        code: r.code,
        unit: r.unit?.trim() || "pcs",
        category_id: r.products?.category_id ?? null,
        category: r.products?.categories?.name ?? "Manual",
        current_stock: Number(r.products?.current_stock ?? 0),
        min_stock: Number(r.products?.min_stock ?? 0),
        max_stock: Number(r.products?.max_stock ?? 0),
        required: Number(r.quantity ?? 1),
      }));
    },
  });

  const refreshManual = () => qc.invalidateQueries({ queryKey: manualKey });

  const addMutation = useMutation({
    mutationFn: async (row: DemandRow) => {
      const existing = manualItems.find((m) => m.id === row.id);
      if (existing) {
        const { error } = await supabase
          .from("demand_manual_items")
          .update({ quantity: Math.max(1, row.required || 1) })
          .eq("id", existing.rowId);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("demand_manual_items").insert({
        product_id: row.id,
        product_name: row.name,
        code: row.code,
        unit: row.unit,
        quantity: Math.max(1, row.required || 1),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, row) => {
      setProductSearch("");
      setDebounced("");
      refreshManual();
      toast.success(`${row.name} added to manual list`);
    },
    onError: (e: Error) => toast.error(e.message || "Could not add product"),
  });

  const qtyMutation = useMutation({
    mutationFn: async ({ rowId, qty }: { rowId: string; qty: number }) => {
      const { error } = await supabase
        .from("demand_manual_items")
        .update({ quantity: Math.max(1, Math.round(qty) || 1) })
        .eq("id", rowId);
      if (error) throw new Error(error.message);
    },
    onSuccess: refreshManual,
    onError: (e: Error) => toast.error(e.message || "Could not update quantity"),
  });

  const removeMutation = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("demand_manual_items").delete().eq("id", rowId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refreshManual();
      toast.success("Removed from manual list");
    },
    onError: (e: Error) => toast.error(e.message || "Could not remove product"),
  });

  // ── Manual purchase search: live suggestions over ALL active products ─────
  const search = debounced;
  const { data: suggestionsRaw = [] } = useQuery({
    queryKey: ["demand-product-search", search],
    enabled: search.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, code, unit, category_id, current_stock, min_stock, max_stock, categories(name)")
        .eq("is_active", true)
        .or(`name.ilike.%${search}%,code.ilike.%${search}%`)
        .order("name")
        .limit(8);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        name: string;
        code: string;
        unit: string | null;
        category_id: string | null;
        current_stock: number | null;
        min_stock: number | null;
        max_stock: number | null;
        categories: { name: string } | null;
      }>;
    },
  });

  const suggestions = useMemo(
    () =>
      suggestionsRaw.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        unit: p.unit?.trim() || "pcs",
        category_id: p.category_id,
        category: p.categories?.name ?? "Uncategorised",
        current_stock: Number(p.current_stock ?? 0),
        min_stock: Number(p.min_stock ?? 0),
        max_stock: Number(p.max_stock ?? 0),
        required: 1,
      })),
    [suggestionsRaw],
  );

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

  function matches(r: DemandRow) {
    if (category !== "all" && r.category_id !== category) return false;
    const q = term.trim().toLowerCase();
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q)
    );
  }

  // Automatic rows shown (manual duplicates are hidden from the auto list).
  const autoVisible = useMemo(
    () =>
      sortDemand(
        rows
          .filter((r) => matches(r) && !manualItems.some((m) => m.id === r.id))
          .map((r) => (overrides[r.id] != null ? { ...r, required: overrides[r.id] } : r)),
        sortMode,
      ),
    [rows, manualItems, overrides, term, category, sortMode],
  );
  const manualVisible = useMemo(
    () => sortDemand(manualItems.filter(matches), sortMode) as ManualRow[],
    [manualItems, term, category, sortMode],
  );

  const autoPending = autoVisible.filter((r) => !ordered.includes(r.id));
  const groups = groupByCategory(autoVisible);
  const printable = [...autoPending, ...manualVisible];

  function addManual(row: DemandRow) {
    const existingManual = manualItems.find((m) => m.id === row.id);
    if (existingManual) {
      toast.info("This product is already in the demand list.");
      setProductSearch("");
      setDebounced("");
      setEditingQty(existingManual.rowId);
      return;
    }
    const existingAuto = rows.find((r) => r.id === row.id);
    if (existingAuto) {
      toast.info("This product is already in the demand list.");
      setProductSearch("");
      setDebounced("");
      setEditingQty(existingAuto.id);
      return;
    }
    addMutation.mutate(row);
  }

  function setQty(rowId: string, qty: number) {
    qtyMutation.mutate({ rowId, qty });
  }

  function setAutoQty(productId: string, qty: number) {
    const next = { ...overrides, [productId]: Math.max(1, Math.round(qty) || 1) };
    setOverrides(next);
    writeQtyOverrides(next);
  }

  function removeManual(rowId: string) {
    removeMutation.mutate(rowId);
  }


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
      if (printable.length === 0) throw new Error("Nothing to print — the demand list is empty");
      await printDemandList(printable, size);
    } catch (e) {
      toast.error((e as Error).message || "Print failed");
    }
  }

  const totalRequired = printable.reduce((s, r) => s + r.required, 0);

  return (
    <AppShell title="Demand List" subtitle="Automatic Restocking Sheet">
      <div className="mx-auto max-w-[1400px] space-y-4 p-6 xl:p-8">
        <section className="rounded-2xl border border-border bg-card shadow-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">Products needing restock</h2>
              <p className="text-[12px] text-muted-foreground">
                {autoPending.length} automatic + {manualVisible.length} manual product(s), {totalRequired} unit(s)
                required.
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
                disabled={autoPending.length === 0}
                onClick={() => markOrdered(autoPending.map((r) => r.id))}
              >
                <ClipboardCheck className="h-3.5 w-3.5" /> Mark all ordered
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => print("80mm")}>
                <Printer className="h-3.5 w-3.5" /> Print (80mm)
              </Button>
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
            <div className="relative min-w-[320px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search any product to add manually..."
                className="h-9 pl-9"
              />
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                      onClick={() => addManual(item)}
                    >
                      <div>
                        <div className="text-[12.5px] font-medium text-foreground">{item.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{item.code}</div>
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground">
                        <div>Stock</div>
                        <div className="font-semibold text-foreground">
                          {item.current_stock} {item.unit}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Filter list..."
                className="h-9 pl-9"
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

          {/* Manual purchase list */}
          {manualVisible.length > 0 && (
            <div className="border-b border-border">
              <div className="px-6 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Manually added ({manualVisible.length})
              </div>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-y border-border bg-muted/40 text-[11.5px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-left">Category</th>
                    <th className="px-4 py-2 text-right">Stock</th>
                    <th className="px-4 py-2 text-center">Required</th>
                    <th className="px-4 py-2 text-left">Unit</th>
                    <th className="px-6 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {manualVisible.map((item, i) => (
                    <tr key={item.rowId} className={i % 2 ? "bg-muted/25" : ""}>
                      <td className="px-6 py-2.5">
                        <div className="font-medium text-foreground">{item.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{item.code}</div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{item.current_stock}</td>
                      <td className="px-4 py-2.5">
                        {editingQty === item.rowId ? (
                          <QtyEditor
                            name={item.name}
                            value={item.required}
                            onCommit={(v) => setQty(item.rowId, v)}
                            onDone={() => setEditingQty(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            className="mx-auto block rounded-md px-3 py-1 text-center font-semibold tabular-nums text-foreground hover:bg-muted"
                            aria-label={`Edit quantity for ${item.name}`}
                            onClick={() => setEditingQty(item.rowId)}
                          >
                            {item.required}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.unit}</td>
                      <td className="px-6 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-[11.5px] text-destructive"
                          onClick={() => removeManual(item.rowId)}
                        >
                          <X className="h-3.5 w-3.5" /> Remove
                        </Button>
                      </td>
                    </tr>
                  ))}

                </tbody>
              </table>
            </div>
          )}

          {/* Automatic demand list (read-only) */}
          {isLoading ? (
            <p className="px-6 py-10 text-center text-[12.5px] text-muted-foreground">Loading...</p>
          ) : autoVisible.length === 0 ? (
            <p className="px-6 py-10 text-center text-[12.5px] text-muted-foreground">
              No products currently need restocking.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-muted/40 text-[11.5px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-left">Category</th>
                    <th className="px-4 py-2 text-right">Stock</th>
                    <th className="px-4 py-2 text-right">Min</th>
                    <th className="px-4 py-2 text-right">Required</th>
                    <th className="px-4 py-2 text-left">Unit</th>
                    <th className="px-6 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g.category}>
                      <tr>
                        <td
                          colSpan={7}
                          className="bg-muted/60 px-6 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-foreground"
                        >
                          {g.category}
                        </td>
                      </tr>
                      {g.rows.map((row, i) => (
                        <DemandRowView
                          key={row.id}
                          row={row}
                          striped={i % 2 === 1}
                          ordered={ordered.includes(row.id)}
                          editing={editingQty === row.id}
                          onEdit={() => setEditingQty(row.id)}
                          onEditDone={() => setEditingQty(null)}
                          onQty={(v) => setAutoQty(row.id, v)}
                          onMark={() => markOrdered([row.id])}
                          onUnmark={() => unmark(row.id)}
                        />
                      ))}
                    </Fragment>
                  ))}
                </tbody>
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

function QtyEditor({
  name,
  value,
  onCommit,
  onDone,
}: {
  name: string;
  value: number;
  onCommit: (qty: number) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(String(value));

  const commit = (raw: string) => {
    const n = Math.max(1, Math.round(Number(raw)) || 1);
    if (n !== value) onCommit(n);
    return n;
  };

  const finish = () => {
    commit(draft);
    onDone();
  };

  const step = (delta: number) => {
    const next = Math.max(1, (Math.round(Number(draft)) || 0) + delta);
    setDraft(String(next));
    onCommit(next);
  };

  return (
    <div
      className="flex items-center justify-center gap-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) finish();
      }}
    >
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        aria-label={`Decrease quantity for ${name}`}
        onClick={() => step(-1)}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Input
        autoFocus
        inputMode="numeric"
        value={draft}
        aria-label={`Quantity for ${name}`}
        className="h-7 w-20 text-center"
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish();
          if (e.key === "Escape") onDone();
        }}
      />
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        aria-label={`Increase quantity for ${name}`}
        onClick={() => step(1)}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
