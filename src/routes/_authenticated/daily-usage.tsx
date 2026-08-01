import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { fmtDate } from "@/lib/format";
import { fmtRs } from "@/lib/wholesale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Eye, Pencil, Trash2, Search, Loader2, X, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/daily-usage")({
  head: () => ({
    meta: [
      { title: "Daily Usage · Project Phoenix" },
      { name: "description", content: "Log and review parts consumed by daily repair work, with automatic stock deduction." },
    ],
  }),
  component: UsagePage,
});

type Row = {
  id: string;
  usage_date: string;
  quantity: number;
  notes: string | null;
  product_id: string;
  product: { code: string; name: string } | null;
};

type DraftItem = {
  product_id: string;
  code: string;
  name: string;
  price: number;
  stock: number;
  quantity: number;
  notes: string;
};

type SortMode =
  | "price_desc"
  | "price_asc"
  | "qty_desc"
  | "qty_asc"
  | "name_asc"
  | "name_desc";

const todayStr = () => new Date().toISOString().slice(0, 10);
const draftKey = (d: string) => `phoenix.daily-usage.draft.${d}`;

function loadDraft(date: string): DraftItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(draftKey(date));
    return raw ? (JSON.parse(raw) as DraftItem[]) : [];
  } catch {
    return [];
  }
}

function UsagePage() {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["daily-usage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_usage")
        .select("id, usage_date, quantity, notes, product_id, product:products(code, name)")
        .order("usage_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["daily-usage"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
    qc.invalidateQueries({ queryKey: ["low-stock"] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_usage").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usage entry deleted — stock restored");
      setDeleting(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete entry"),
  });

  const flat = useMemo(
    () => data.map((r) => ({ ...r, product_code: r.product?.code ?? "", product_name: r.product?.name ?? "" })),
    [data],
  );

  type FlatRow = (typeof flat)[number];

  return (
    <AppShell title="Daily Usage" subtitle="Repair Consumption Log">
      <div className="mx-auto max-w-[1400px] space-y-4 p-6 xl:p-8">
        <UsageComposer onSaved={refresh} />

        <DataTable<FlatRow>
          rows={flat}
          isLoading={isLoading}
          rowKey={(r) => r.id}
          searchKeys={["product_code", "product_name", "notes", "usage_date"]}
          searchPlaceholder="Search product, date or note…"
          initialSort={{ key: "usage_date", dir: "desc" }}
          emptyMessage="No usage recorded yet."
          columns={[
            { key: "usage_date", label: "Date", render: (r) => fmtDate(r.usage_date) },
            { key: "product_code", label: "Code", render: (r) => <span className="font-mono text-[12px] font-semibold">{r.product_code}</span> },
            { key: "product_name", label: "Product" },
            { key: "quantity", label: "Qty", align: "right", render: (r) => <span className="font-semibold text-destructive">-{r.quantity}</span> },
            { key: "notes", label: "Notes" },
            {
              key: "actions",
              label: "Actions",
              align: "right",
              sortable: false,
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="View entry" onClick={() => setViewing(r)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit entry" onClick={() => setEditing(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    aria-label="Delete entry"
                    onClick={() => setDeleting(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Usage Entry</DialogTitle></DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div><dt className="text-[11px] uppercase text-muted-foreground">Date</dt><dd className="font-medium">{fmtDate(viewing.usage_date)}</dd></div>
              <div><dt className="text-[11px] uppercase text-muted-foreground">Quantity</dt><dd className="font-medium">{viewing.quantity}</dd></div>
              <div><dt className="text-[11px] uppercase text-muted-foreground">Code</dt><dd className="font-mono font-medium">{viewing.product?.code ?? "—"}</dd></div>
              <div><dt className="text-[11px] uppercase text-muted-foreground">Product</dt><dd className="font-medium">{viewing.product?.name ?? "—"}</dd></div>
              <div className="col-span-2"><dt className="text-[11px] uppercase text-muted-foreground">Notes</dt><dd className="font-medium">{viewing.notes || "—"}</dd></div>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
            <Button onClick={() => { setEditing(viewing); setViewing(null); }}>Edit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UsageDialog
        entry={editing ?? undefined}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={refresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this usage entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.quantity} unit(s) of {deleting?.product?.name ?? "the product"} will be added back to stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting.id); }}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

// ── Today's usage composer: autocomplete search + accumulating list ──────────

function UsageComposer({ onSaved }: { onSaved: () => void }) {
  const [date] = useState(todayStr);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [openList, setOpenList] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [items, setItems] = useState<DraftItem[]>(() => loadDraft(todayStr()));
  const [sortMode, setSortMode] = useState<SortMode>("name_asc");
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Draft is scoped to the current day, so the page starts empty each new day.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(draftKey(date), JSON.stringify(items));
  }, [items, date]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 180);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenList(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const search = useQuery({
    queryKey: ["product-search", debounced],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, current_stock, retail_price, cost_price")
        .eq("is_active", true)
        .or(`name.ilike.%${debounced}%,code.ilike.%${debounced}%`)
        .order("name")
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: debounced.length > 0,
    staleTime: 30_000,
  });

  const results = debounced.length > 0 ? search.data ?? [] : [];

  function addProduct(p: { id: string; code: string; name: string; current_stock: number | null; retail_price: number | null; cost_price: number | null }) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        // Same product selected again → bump the quantity of the existing row.
        return prev.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          product_id: p.id,
          code: p.code,
          name: p.name,
          price: Number(p.retail_price ?? p.cost_price ?? 0),
          stock: Number(p.current_stock ?? 0),
          quantity: 1,
          notes: "",
        },
      ];
    });
    setTerm("");
    setDebounced("");
    setOpenList(false);
    setHighlight(0);
  }

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      switch (sortMode) {
        case "price_desc": return b.price - a.price;
        case "price_asc": return a.price - b.price;
        case "qty_desc": return b.quantity - a.quantity;
        case "qty_asc": return a.quantity - b.quantity;
        case "name_desc": return b.name.localeCompare(a.name);
        default: return a.name.localeCompare(b.name);
      }
    });
    return copy;
  }, [items, sortMode]);

  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
  const totalValue = items.reduce((s, i) => s + i.quantity * i.price, 0);

  const save = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error("Add at least one product");
      const { data: userData } = await supabase.auth.getUser();
      const payload = items
        .filter((i) => i.quantity > 0)
        .map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          usage_date: date,
          notes: i.notes || null,
          created_by: userData.user?.id ?? null,
        }));
      const { error } = await supabase.from("daily_usage").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Today's usage saved — stock updated");
      setItems([]);
      if (typeof window !== "undefined") window.localStorage.removeItem(draftKey(date));
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  return (
    <section className="rounded-2xl border border-border bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Today&apos;s Usage — {fmtDate(date)}</h2>
          <p className="text-[12px] text-muted-foreground">Search a product and click it to add. Selecting it again increases the quantity.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="h-9 w-[220px] text-[12.5px]"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="price_desc">Price: High → Low</SelectItem>
              <SelectItem value="price_asc">Price: Low → High</SelectItem>
              <SelectItem value="qty_desc">Quantity: High → Low</SelectItem>
              <SelectItem value="qty_asc">Quantity: Low → High</SelectItem>
              <SelectItem value="name_asc">Product Name: A → Z</SelectItem>
              <SelectItem value="name_desc">Product Name: Z → A</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5" disabled={save.isPending || items.length === 0} onClick={() => save.mutate()}>
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save Today's Usage"}
          </Button>
        </div>
      </header>

      <div className="space-y-4 px-6 py-5">
        <div ref={boxRef} className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => { setTerm(e.target.value); setOpenList(true); setHighlight(0); }}
            onFocus={() => setOpenList(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
              else if (e.key === "Enter" && results[highlight]) { e.preventDefault(); addProduct(results[highlight]); }
              else if (e.key === "Escape") setOpenList(false);
            }}
            placeholder="Search product by name or code…"
            className="h-10 pl-9"
            aria-label="Search products"
          />
          {openList && debounced.length > 0 && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
              {search.isFetching && results.length === 0 && (
                <div className="flex items-center gap-2 px-4 py-3 text-[12.5px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </div>
              )}
              {!search.isFetching && results.length === 0 && (
                <div className="px-4 py-3 text-[12.5px] text-muted-foreground">No products match “{debounced}”.</div>
              )}
              {results.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => addProduct(p)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] transition-colors ${i === highlight ? "bg-primary-soft" : "hover:bg-muted"}`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{p.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{p.code}</span>
                  </span>
                  <span className="shrink-0 text-right text-[11.5px] text-muted-foreground">
                    <span className="block font-semibold text-foreground">{fmtRs(Number(p.retail_price ?? 0))}</span>
                    stock: {p.current_stock}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[12.5px] text-muted-foreground">
            Nothing added yet today. Start typing above to find a product.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-semibold">Product</th>
                  <th className="px-4 py-2 text-right font-semibold">Price</th>
                  <th className="px-4 py-2 text-right font-semibold">Qty</th>
                  <th className="px-4 py-2 text-right font-semibold">Value</th>
                  <th className="px-4 py-2 font-semibold">Note</th>
                  <th className="px-4 py-2 text-right font-semibold">Remove</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((it, i) => (
                  <tr key={it.product_id} className={i % 2 === 1 ? "bg-muted/25" : ""}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{it.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{it.code} · stock {it.stock}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtRs(it.price)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Input
                        type="number"
                        min="1"
                        value={it.quantity}
                        aria-label={`Quantity for ${it.name}`}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((p) =>
                              p.product_id === it.product_id
                                ? { ...p, quantity: Math.max(1, Number(e.target.value) || 1) }
                                : p,
                            ),
                          )
                        }
                        className="ml-auto h-8 w-20 text-right"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtRs(it.price * it.quantity)}</td>
                    <td className="px-4 py-2.5">
                      <Input
                        value={it.notes}
                        aria-label={`Note for ${it.name}`}
                        placeholder="Optional note"
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((p) => (p.product_id === it.product_id ? { ...p, notes: e.target.value } : p)),
                          )
                        }
                        className="h-8"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        aria-label={`Remove ${it.name}`}
                        onClick={() => setItems((prev) => prev.filter((p) => p.product_id !== it.product_id))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/40 text-[12.5px] font-semibold">
                  <td className="px-4 py-2.5">{items.length} product(s)</td>
                  <td />
                  <td className="px-4 py-2.5 text-right tabular-nums">{totalUnits}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtRs(totalValue)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function UsageDialog({
  entry,
  open,
  onOpenChange,
  onSaved,
}: {
  entry?: { id: string; product_id: string; quantity: number; notes: string | null; usage_date: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [quantity, setQuantity] = useState("1");
  const [usageDate, setUsageDate] = useState(todayStr);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuantity(String(entry?.quantity ?? 1));
    setUsageDate(entry?.usage_date ?? todayStr());
    setNotes(entry?.notes ?? "");
  }, [open, entry]);

  const save = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error("No entry selected");
      const qty = Number(quantity) || 0;
      if (qty <= 0) throw new Error("Quantity must be greater than zero");

      // Stock is adjusted by insert/delete triggers, so an edit is applied as
      // a delete + re-insert to keep product stock accurate.
      const { error: delError } = await supabase.from("daily_usage").delete().eq("id", entry.id);
      if (delError) throw delError;

      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("daily_usage").insert({
        product_id: entry.product_id,
        quantity: qty,
        usage_date: usageDate,
        notes: notes || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usage updated — stock adjusted");
      onOpenChange(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Usage Entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={usageDate} onChange={(e) => setUsageDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Used for iPhone 13 screen repair — counter #2" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
