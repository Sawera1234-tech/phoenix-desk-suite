import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Pencil, Trash2, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { fmtDateTime } from "@/lib/format";
import {
  auditKeys,
  checkDeletable,
  deactivateRecord,
  deleteRecord,
  fetchRecordHistory,
  SOFT_DELETE_TABLES,
} from "@/lib/audit";

export type ViewField = { label: string; value: ReactNode };

/**
 * Shared Actions column: View (record detail + change history), Edit and
 * Delete with a confirmation that explains why a deletion is blocked.
 */
export function RowActions({
  table,
  id,
  label,
  fields,
  onEdit,
  onDeleted,
  extra,
  canDelete = true,
}: {
  table: string;
  id: string;
  label: string;
  fields: ViewField[];
  onEdit?: () => void;
  onDeleted?: () => void;
  extra?: ReactNode;
  canDelete?: boolean;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [block, setBlock] = useState<string | null>(null);

  async function openConfirm() {
    setBlock(null);
    setConfirm(true);
    const check = await checkDeletable(table, id);
    if (check.blocked) setBlock(check.reason ?? "This record is linked to other data.");
  }

  async function runDelete() {
    setBusy(true);
    try {
      await deleteRecord({ table, id, label });
      toast.success(`${label} deleted`);
      setConfirm(false);
      onDeleted?.();
    } catch (e) {
      toast.error((e as Error).message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function runDeactivate() {
    setBusy(true);
    try {
      await deactivateRecord(table, id, label);
      toast.success(`${label} marked inactive`);
      setConfirm(false);
      onDeleted?.();
    } catch (e) {
      toast.error((e as Error).message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {extra}
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`View ${label}`} onClick={() => setViewOpen(true)}>
        <Eye className="h-3.5 w-3.5" />
      </Button>
      {onEdit && (
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${label}`} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          aria-label={`Delete ${label}`}
          onClick={openConfirm}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>Record details and change history.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
            {fields.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="font-medium text-foreground">{f.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <RecordHistory table={table} id={id} open={viewOpen} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
            {onEdit && (
              <Button onClick={() => { setViewOpen(false); onEdit(); }}>Edit</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm} onOpenChange={(o) => !o && setConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {block ?? "This permanently removes the record. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {block && SOFT_DELETE_TABLES.has(table) ? (
              <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); runDeactivate(); }}>
                {busy ? "Working…" : "Mark inactive instead"}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                disabled={busy || !!block}
                onClick={(e) => { e.preventDefault(); runDelete(); }}
              >
                {busy ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RecordHistory({ table, id, open }: { table: string; id: string; open: boolean }) {
  const { data = [], isLoading } = useQuery({
    queryKey: auditKeys.record(table, id),
    queryFn: () => fetchRecordHistory(table, id),
    enabled: open,
  });

  return (
    <div className="rounded-xl border border-border bg-muted/25 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <History className="h-3.5 w-3.5" /> Change history
      </div>
      {isLoading ? (
        <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : data.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No recorded changes yet.</p>
      ) : (
        <ul className="max-h-40 space-y-1.5 overflow-auto">
          {data.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="font-medium capitalize text-foreground">{e.action}</span>
              <span className="truncate text-muted-foreground">{e.actor_email ?? "—"}</span>
              <span className="shrink-0 text-muted-foreground">{fmtDateTime(e.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
