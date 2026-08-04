import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { RowActions } from "@/components/phoenix/RowActions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers · Project Phoenix" }] }),
  component: SuppliersPage,
});

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
};

function SuppliersPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    qc.invalidateQueries({ queryKey: ["purchases"] });
  };

  return (
    <AppShell title="Suppliers" subtitle="Vendor Directory">
      <div className="mx-auto max-w-[1400px] space-y-4 p-6 xl:p-8">
        <DataTable<Supplier>
          rows={data}
          isLoading={isLoading}
          rowKey={(r) => r.id}
          searchKeys={["name", "phone"]}
          searchPlaceholder="Search suppliers…"
          initialSort={{ key: "name", dir: "asc" }}
          actions={
            <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4" /> New Supplier
            </Button>
          }
          emptyMessage="No suppliers yet."
          columns={[
            { key: "name", label: "Name" },
            { key: "phone", label: "Phone" },
            { key: "address", label: "Address" },
            { key: "notes", label: "Notes" },
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
                <RowActions
                  table="suppliers"
                  id={r.id}
                  label={r.name}
                  onEdit={() => { setEditing(r); setOpen(true); }}
                  onDeleted={refresh}
                  fields={[
                    { label: "Name", value: r.name },
                    { label: "Phone", value: r.phone ?? "—" },
                    { label: "Address", value: r.address ?? "—" },
                    { label: "Notes", value: r.notes ?? "—" },
                    { label: "Status", value: r.is_active ? "Active" : "Inactive" },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>
      <SupplierDialog open={open} onOpenChange={setOpen} record={editing} onSaved={refresh} />
    </AppShell>
  );
}

const EMPTY = { name: "", phone: "", address: "", notes: "", is_active: true };

function SupplierDialog({
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record: Supplier | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm(
      record
        ? {
            name: record.name,
            phone: record.phone ?? "",
            address: record.address ?? "",
            notes: record.notes ?? "",
            is_active: record.is_active,
          }
        : EMPTY,
    );
  }, [open, record]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      };
      if (record) {
        const { data, error } = await supabase.from("suppliers").update(payload).eq("id", record.id).select("id");
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error("Nothing was updated — check your permissions.");
        await logAudit({ table: "suppliers", recordId: record.id, label: payload.name, action: "update", before: record, after: payload });
      } else {
        const { data, error } = await supabase.from("suppliers").insert(payload).select("id").single();
        if (error) throw new Error(error.message);
        await logAudit({ table: "suppliers", recordId: data.id, label: payload.name, action: "create", after: payload });
      }
    },
    onSuccess: () => {
      toast.success(record ? "Supplier updated" : "Supplier created");
      onOpenChange(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{record ? "Edit Supplier" : "New Supplier"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="sup-active">Active</Label>
            <Switch id="sup-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
            {save.isPending ? "Saving…" : record ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
