import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/phoenix/AppShell";
import { DataTable } from "@/components/phoenix/DataTable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/brands")({
  head: () => ({ meta: [{ title: "Brands · Project Phoenix" }] }),
  component: BrandsPage,
});

type Row = { id: string; name: string; is_active: boolean; created_at: string };

function BrandsPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("brands").select("*").order("name");
      if (error) throw error;
      return data as Row[];
    },
  });
  return (
    <AppShell title="Brands" subtitle="Manufacturer Directory">
      <div className="mx-auto max-w-[1200px] space-y-4 p-6 xl:p-8">
        <DataTable<Row>
          rows={data}
          rowKey={(r) => r.id}
          searchKeys={["name"]}
          searchPlaceholder="Search brands…"
          initialSort={{ key: "name", dir: "asc" }}
          actions={<NewDialog onCreated={() => qc.invalidateQueries({ queryKey: ["brands"] })} />}
          emptyMessage="No brands yet."
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
          ]}
        />
      </div>
    </AppShell>
  );
}

function NewDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("brands").insert({ name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Brand created"); setOpen(false); setName(""); onCreated(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Brand</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Brand</DialogTitle></DialogHeader>
        <div className="space-y-1.5"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apple" /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>{create.isPending ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
