import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { fmtRs } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Eye, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Products · Project Phoenix" },
      { name: "description", content: "Manage mobile repair parts inventory: SKUs, pricing, and stock levels." },
    ],
  }),
  component: ProductsPage,
});

type Product = {
  id: string;
  code: string;
  name: string;
  category_id: string;
  description: string | null;
  cost_price: number;
  retail_price: number;
  wholesale_price: number;
  current_stock: number;
  min_stock: number;
  max_stock: number;
  unit: string;
  is_active: boolean;
};

type FormState = {
  code: string;
  name: string;
  category_id: string;
  description: string;
  cost_price: string;
  retail_price: string;
  wholesale_price: string;
  current_stock: string;
  min_stock: string;
  max_stock: string;
  unit: string;
};

const emptyForm: FormState = {
  code: "",
  name: "",
  category_id: "",
  description: "",
  cost_price: "",
  retail_price: "",
  wholesale_price: "",
  current_stock: "",
  min_stock: "",
  max_stock: "",
  unit: "pcs",
};

function toForm(p: Product): FormState {
  return {
    code: p.code,
    name: p.name,
    category_id: p.category_id ?? "",
    description: p.description ?? "",
    cost_price: String(p.cost_price ?? 0),
    retail_price: String(p.retail_price ?? 0),
    wholesale_price: String(p.wholesale_price ?? 0),
    current_stock: String(p.current_stock ?? 0),
    min_stock: String(p.min_stock ?? 0),
    max_stock: String(p.max_stock ?? 0),
    unit: p.unit ?? "pcs",
  };
}

function ProductsPage() {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Product[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["low-stock"] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product deleted");
      setDeleting(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete product"),
  });

  return (
    <AppShell title="Products" subtitle="Inventory Master">
      <div className="mx-auto max-w-[1600px] space-y-4 p-6 xl:p-8">
        <DataTable<Product>
          rows={data}
          isLoading={isLoading}
          rowKey={(r) => r.id}
          searchKeys={["code", "name", "description"]}
          searchPlaceholder="Search by code, name…"
          initialSort={{ key: "name", dir: "asc" }}
          actions={<ProductDialog onSaved={refresh} />}
          emptyMessage="No products yet. Add your first SKU to get started."
          columns={[
            { key: "code", label: "Code", render: (r) => <span className="font-mono text-[12px] font-semibold">{r.code}</span> },
            { key: "name", label: "Name" },
            { key: "cost_price", label: "Cost", align: "right", render: (r) => fmtRs(r.cost_price) },
            { key: "retail_price", label: "Retail", align: "right", render: (r) => fmtRs(r.retail_price) },
            { key: "wholesale_price", label: "Wholesale", align: "right", render: (r) => fmtRs(r.wholesale_price) },
            {
              key: "current_stock",
              label: "Stock",
              align: "right",
              render: (r) => {
                const critical = r.current_stock <= r.min_stock;
                return <span className={critical ? "font-semibold text-destructive" : "font-semibold text-foreground"}>{r.current_stock}</span>;
              },
            },
            { key: "min_stock", label: "Min", align: "right" },
            {
              key: "is_active",
              label: "Status",
              render: (r) => (
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${r.is_active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              ),
            },
            {
              key: "actions",
              label: "Actions",
              align: "right",
              sortable: false,
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`View ${r.name}`} onClick={() => setViewing(r)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    aria-label={`Delete ${r.name}`}
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
          <DialogHeader><DialogTitle>{viewing?.name}</DialogTitle></DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <Detail label="Code" value={viewing.code} />
              <Detail label="Status" value={viewing.is_active ? "Active" : "Inactive"} />
              <Detail label="Cost Price" value={fmtRs(viewing.cost_price)} />
              <Detail label="Retail Price" value={fmtRs(viewing.retail_price)} />
              <Detail label="Wholesale Price" value={fmtRs(viewing.wholesale_price)} />
              <Detail label="Stock Value" value={fmtRs(viewing.current_stock * viewing.cost_price)} />
              <Detail label="Current Stock" value={String(viewing.current_stock)} />
              <Detail label="Min Stock" value={String(viewing.min_stock)} />
              <Detail label="Max Stock" value={String(viewing.max_stock ?? 0)} />
              <Detail label="Unit" value={viewing.unit ?? "pcs"} />
              <div className="col-span-2">
                <Detail label="Description" value={viewing.description || "—"} />
              </div>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
            <Button onClick={() => { setEditing(viewing); setViewing(null); }}>Edit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductDialog
        product={editing ?? undefined}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={refresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the product. Products already used in purchases, invoices or usage logs cannot be deleted.
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ProductDialog({
  product,
  open: controlledOpen,
  onOpenChange,
  onSaved,
}: {
  product?: Product;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (o: boolean) => (isControlled ? onOpenChange?.(o) : setInternalOpen(o));
  const [form, setForm] = useState<FormState>(emptyForm);
  const { data: categories = [] } = useQuery({
  queryKey: ["categories"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name")
      .order("name");

    if (error) throw error;
    return data;
  },
});

  useEffect(() => {
    if (open) setForm(product ? toForm(product) : emptyForm);
  }, [open, product]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        category_id: form.category_id || null,
        description: form.description || null,
        cost_price: Number(form.cost_price) || 0,
        retail_price: Number(form.retail_price) || 0,
        wholesale_price: Number(form.wholesale_price) || 0,
        current_stock: Number(form.current_stock) || 0,
        min_stock: Number(form.min_stock) || 0,
        max_stock: Number(form.max_stock) || 0,
        unit: form.unit.trim() || "pcs",
      };
      if (!payload.code || !payload.name) throw new Error("Code and name are required");
      const { error } = product
        ? await supabase.from("products").update(payload).eq("id", product.id)
        : await supabase.from("products").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(product ? "Product updated" : "Product created");
      setOpen(false);
      setForm(emptyForm);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Product</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{product ? "Edit Product" : "New Product"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Code / SKU *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DISP-IP15-OG" /></div>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="iPhone 15 OLED Display" /></div>
          <div className="col-span-2 space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
          <div className="space-y-1.5"><Label>Cost Price</Label><Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Retail Price</Label><Input type="number" step="0.01" value={form.retail_price} onChange={(e) => setForm({ ...form, retail_price: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Wholesale Price</Label><Input type="number" step="0.01" value={form.wholesale_price} onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{product ? "Stock" : "Opening Stock"}</Label><Input type="number" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Min Stock</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Max Stock</Label><Input type="number" value={form.max_stock} onChange={(e) => setForm({ ...form, max_stock: e.target.value })} placeholder="Target level for demand list" /></div>
          <div className="space-y-1.5"><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs" /></div>
          <div className="space-y-1.5"><Label>Category</Label><Select value={form.category_id} onValueChange={(value) => setForm({ ...form, category_id: value })}><SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger><SelectContent>{categories.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent></Select></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.code || !form.name || save.isPending}>
            {save.isPending ? "Saving…" : product ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
