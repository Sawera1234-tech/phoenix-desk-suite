import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { fmtRs } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { deleteRecord, logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, BookOpen, Pencil, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/shopkeepers")({
  head: () => ({ meta: [{ title: "Market Ledger · Project Phoenix" }] }),
  component: ShopkeepersPage,
});

type Shopkeeper = {
  id: string;
  name: string;
  shop_name: string | null;
  phone: string | null;
  address: string | null;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
};

function ShopkeepersPage() {
  const qc = useQueryClient();
  const [editShopkeeper, setEditShopkeeper] = useState<Shopkeeper | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Shopkeeper | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["shopkeepers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shopkeepers").select("*").order("name");
      if (error) throw error;
      return data as Shopkeeper[];
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shopkeepers"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteRecord({ table: "shopkeepers", id, label: "Shopkeeper" });
    },
    onSuccess: () => {
      toast.success("Shopkeeper deleted");
      setDeleteTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Market Ledger" subtitle="Shopkeepers & Balances">
      <div className="mx-auto max-w-[1400px] space-y-4 p-6 xl:p-8">
        <DataTable<Shopkeeper>
          rows={data}
          isLoading={isLoading}
          rowKey={(r) => r.id}
          searchKeys={["name", "shop_name", "phone"]}
          searchPlaceholder="Search shopkeeper or shop…"
          initialSort={{ key: "current_balance", dir: "desc" }}
          actions={<NewShopkeeperDialog onCreated={refresh} />}
          emptyMessage="No shopkeepers yet."
          columns={[
            {
              key: "name",
              label: "Name",
              render: (r) => (
                <Link
                  to="/ledger/$customerId"
                  params={{ customerId: r.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {r.name}
                </Link>
              ),
            },
            { key: "shop_name", label: "Shop" },
            { key: "phone", label: "Phone" },
            { key: "opening_balance", label: "Opening", align: "right", render: (r) => fmtRs(r.opening_balance) },
            {
              key: "current_balance",
              label: "Balance",
              align: "right",
              render: (r) => {
                const v = Number(r.current_balance);
                return <span className={v > 0 ? "font-semibold text-destructive" : v < 0 ? "font-semibold text-success" : "font-semibold text-foreground"}>{fmtRs(v)}</span>;
              },
            },
            {
              key: "actions",
              label: "Actions",
              sortable: false,
              align: "right",
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <Button asChild size="sm" variant="outline" className="h-7 gap-1">
                    <Link to="/ledger/$customerId" params={{ customerId: r.id }}>
                      <BookOpen className="h-3 w-3" /> Ledger
                    </Link>
                  </Button>
                  <Button size="sm" variant="secondary" className="h-7 gap-1" onClick={() => setEditShopkeeper(r)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 gap-1" onClick={() => setDeleteTarget(r)}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <EditShopkeeperDialog shopkeeper={editShopkeeper} onClose={() => setEditShopkeeper(null)} onUpdated={refresh} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the shopkeeper and their ledger history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) remove.mutate(deleteTarget.id);
              }}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function EditShopkeeperDialog({
  shopkeeper,
  onClose,
  onUpdated,
}: {
  shopkeeper: Shopkeeper | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    shop_name: "",
    phone: "",
    address: "",
    opening_balance: "0",
  });

  useEffect(() => {
    if (!shopkeeper) return;
    setForm({
      name: shopkeeper.name ?? "",
      shop_name: shopkeeper.shop_name ?? "",
      phone: shopkeeper.phone ?? "",
      address: shopkeeper.address ?? "",
      opening_balance: String(shopkeeper.opening_balance ?? 0),
    });
  }, [shopkeeper]);

  const update = useMutation({
    mutationFn: async () => {
      if (!shopkeeper) return;
      if (!form.name.trim()) throw new Error("Name is required");

      const opening = Number(form.opening_balance) || 0;
      const delta = opening - Number(shopkeeper.opening_balance ?? 0);

      const { data, error } = await supabase
        .from("shopkeepers")
        .update({
          name: form.name.trim(),
          shop_name: form.shop_name || null,
          phone: form.phone || null,
          address: form.address || null,
          opening_balance: opening,
          // shift the running balance by the opening-balance change only,
          // so ledger/invoice movements stay intact
          current_balance: Number(shopkeeper.current_balance ?? 0) + delta,
        })
        .eq("id", shopkeeper.id)
        .select("id");

      if (error) throw new Error(error.message);
      if (!data || data.length === 0)
        throw new Error("Update failed — no row was changed. You may not have permission to edit shopkeepers.");
      await logAudit({
        table: "shopkeepers",
        recordId: shopkeeper.id,
        label: form.name.trim(),
        action: "update",
        before: shopkeeper,
        after: { ...form, opening_balance: opening },
      });
    },
    onSuccess: () => {
      toast.success("Shopkeeper updated");
      onUpdated();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!shopkeeper} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Shopkeeper</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Shop Name</Label>
            <Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Opening Balance</Label>
            <Input
              type="number"
              step="0.01"
              value={form.opening_balance}
              onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Address</Label>
            <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => update.mutate()} disabled={!form.name.trim() || update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function NewShopkeeperDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", shop_name: "", phone: "", address: "", opening_balance: "0" });
  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        shop_name: form.shop_name || null,
        phone: form.phone || null,
        address: form.address || null,
        opening_balance: Number(form.opening_balance) || 0,
        current_balance: Number(form.opening_balance) || 0,
      };
      const { data, error } = await supabase.from("shopkeepers").insert(payload).select("id").single();
      if (error) throw error;
      await logAudit({ table: "shopkeepers", recordId: data.id, label: payload.name, action: "create", after: payload });
    },
    onSuccess: () => {
      toast.success("Shopkeeper added");
      setOpen(false);
      setForm({ name: "", shop_name: "", phone: "", address: "", opening_balance: "0" });
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Shopkeeper</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Shopkeeper</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Shop Name</Label><Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Opening Balance</Label><Input type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>{create.isPending ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
