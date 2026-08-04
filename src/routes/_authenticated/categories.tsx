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
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({ meta: [{ title: "Categories · Project Phoenix" }] }),
  component: CategoriesPage,
});

type Row = { id: string; name: string; is_active: boolean; created_at: string };

function CategoriesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data as Row[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  return (
    <AppShell title="Categories" subtitle="Product Classification">
      <div className="mx-auto max-w-[1200px] space-y-4 p-6 xl:p-8">
        <DataTable<Row>
          rows={data}
          isLoading={isLoading}
          rowKey={(r) => r.id}
          searchKeys={["name"]}
          searchPlaceholder="Search categories…"
          initialSort={{ key: "name", dir: "asc" }}
          actions={
            <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4" /> New Category
            </Button>
          }
          emptyMessage="No categories yet."
          columns={[
            { key: "name", label: "Name" },
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
                  table="categories"
                  id={r.id}
                  label={r.name}
                  onEdit={() => { setEditing(r); setOpen(true); }}
                  onDeleted={refresh}
                  fields={[
                    { label: "Name", value: r.name },
                    { label: "Status", value: r.is_active ? "Active" : "Inactive" },
                    { label: "Created", value: fmtDateTime(r.created_at) },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>
      <CategoryDialog open={open} onOpenChange={setOpen} record={editing} onSaved={refresh} />
    </AppShell>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record: Row | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(record?.name ?? "");
    setActive(record?.is_active ?? true);
  }, [open, record]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), is_active: active };
      if (record) {
        const { data, error } = await supabase.from("categories").update(payload).eq("id", record.id).select("id");
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error("Nothing was updated — check your permissions.");
        await logAudit({ table: "categories", recordId: record.id, label: payload.name, action: "update", before: record, after: payload });
      } else {
        const { data, error } = await supabase.from("categories").insert(payload).select("id").single();
        if (error) throw new Error(error.message);
        await logAudit({ table: "categories", recordId: data.id, label: payload.name, action: "create", after: payload });
      }
    },
    onSuccess: () => {
      toast.success(record ? "Category updated" : "Category created");
      onOpenChange(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{record ? "Edit Category" : "New Category"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Displays" /></div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="cat-active">Active</Label>
            <Switch id="cat-active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? "Saving…" : record ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
