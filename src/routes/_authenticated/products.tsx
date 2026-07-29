import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { fmtRs } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products · Project Phoenix" }] }),
  component: ProductsPage,
});

type Product = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  cost_price: number;
  retail_price: number;
  wholesale_price: number;
  current_stock: number;
  min_stock: number;
  is_active: boolean;
};

function ProductsPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Product[];
    },
  });

  return (
    <AppShell title="Products" subtitle="Inventory Master">
      <div className="mx-auto max-w-[1600px] space-y-4 p-6 xl:p-8">
        <DataTable<Product>
          rows={data}
          rowKey={(r) => r.id}
          searchKeys={["code", "name", "description"]}
          searchPlaceholder="Search by code, name…"
          initialSort={{ key: "name", dir: "asc" }}
          actions={<NewProductDialog onCreated={() => qc.invalidateQueries({ queryKey: ["products"] })} />}
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
          ]}
        />
      </div>
    </AppShell>
  );
}

function NewProductDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", description: "", cost_price: "", retail_price: "", wholesale_price: "", current_stock: "", min_stock: "" });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").insert({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description || null,
        cost_price: Number(form.cost_price) || 0,
        retail_price: Number(form.retail_price) || 0,
        wholesale_price: Number(form.wholesale_price) || 0,
        current_stock: Number(form.current_stock) || 0,
        min_stock: Number(form.min_stock) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product created");
      setOpen(false);
      setForm({ code: "", name: "", description: "", cost_price: "", retail_price: "", wholesale_price: "", current_stock: "", min_stock: "" });
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Product</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Product</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Code / SKU *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DISP-IP15-OG" /></div>
          <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="iPhone 15 OLED Display" /></div>
          <div className="col-span-2 space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
          <div className="space-y-1.5"><Label>Cost Price</Label><Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Retail Price</Label><Input type="number" step="0.01" value={form.retail_price} onChange={(e) => setForm({ ...form, retail_price: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Wholesale Price</Label><Input type="number" step="0.01" value={form.wholesale_price} onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Opening Stock</Label><Input type="number" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Min Stock</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!form.code || !form.name || create.isPending}>{create.isPending ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
