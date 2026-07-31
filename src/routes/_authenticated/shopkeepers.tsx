import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { fmtRs, fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [ledgerFor, setLedgerFor] = useState<Shopkeeper | null>(null);
  const [editShopkeeper, setEditShopkeeper] = useState<Shopkeeper | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Shopkeeper | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["shopkeepers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shopkeepers").select("*").order("name");
      if (error) throw error;
      return data as Shopkeeper[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shopkeepers"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("shopkeepers").delete().eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0)
        throw new Error(
          "Delete failed — no row was removed. You may not have permission, or linked invoices/ledger entries are blocking it.",
        );
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
            { key: "name", label: "Name" },
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
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setLedgerFor(r)}>
                    <BookOpen className="h-3 w-3" /> Ledger
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

      <LedgerDialog shopkeeper={ledgerFor} onClose={() => setLedgerFor(null)} onEntryAdded={refresh} />
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
      const { error } = await supabase.from("shopkeepers").insert({
        name: form.name.trim(),
        shop_name: form.shop_name || null,
        phone: form.phone || null,
        address: form.address || null,
        opening_balance: Number(form.opening_balance) || 0,
        current_balance: Number(form.opening_balance) || 0,
      });
      if (error) throw error;
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

function LedgerDialog({ shopkeeper, onClose, onEntryAdded }: { shopkeeper: Shopkeeper | null; onClose: () => void; onEntryAdded: () => void }) {
  const qc = useQueryClient();
  const [entryType, setEntryType] = useState("credit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const { data: entries = [] } = useQuery({
    queryKey: ["ledger", shopkeeper?.id],
    queryFn: async () => {
      if (!shopkeeper) return [];
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("shopkeeper_id", shopkeeper.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!shopkeeper,
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!shopkeeper) return;
      const { error } = await supabase.from("ledger_entries").insert({
        shopkeeper_id: shopkeeper.id,
        entry_type: entryType,
        amount: Number(amount) || 0,
        description: description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry added");
      setAmount(""); setDescription("");
      qc.invalidateQueries({ queryKey: ["ledger", shopkeeper?.id] });
      onEntryAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!shopkeeper} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{shopkeeper?.name} — Ledger</DialogTitle>
          <div className="text-[12px] text-muted-foreground">
            Current balance: <span className="font-semibold text-foreground">{fmtRs(shopkeeper?.current_balance)}</span>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Select value={entryType} onValueChange={setEntryType}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="credit">Credit (sale on account)</SelectItem>
              <SelectItem value="payment">Payment received</SelectItem>
              <SelectItem value="debit">Debit / Adjustment</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9" />
          <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 col-span-1" />
          <Button onClick={() => add.mutate()} disabled={!amount || add.isPending} className="h-9">Add entry</Button>
        </div>

        <div className="max-h-[380px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-muted/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(e.entry_date)}</td>
                  <td className="px-3 py-2 capitalize">{e.entry_type}</td>
                  <td className="px-3 py-2">{e.description ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtRs(e.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtRs(e.balance_after)}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">No entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
