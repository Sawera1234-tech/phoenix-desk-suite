import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  backupNow,
  createBackup,
  downloadBackup,
  parseBackup,
  readAllSlots,
  readSettings,
  restoreBackup,
  runAutoBackup,
  writeSettings,
  type BackupCadence,
  type BackupFile,
  type BackupSettings,
  type BackupSlot,
} from "@/lib/backup";
import { DatabaseBackup, Download, RotateCcw, Upload, Loader2 } from "lucide-react";

const CADENCES: { key: BackupCadence; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

export function BackupPanel() {
  const qc = useQueryClient();
  const [slots, setSlots] = useState<BackupSlot[]>([]);
  const [settings, setSettings] = useState<BackupSettings>({ auto: true, last_run: null, last_status: "idle", last_message: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refreshSlots = () => {
    setSlots(readAllSlots());
    setSettings(readSettings());
  };

  // Automatic offline backup: runs quietly when the browser is idle so it never
  // competes with the UI.
  useEffect(() => {
    refreshSlots();
    const run = () => {
      runAutoBackup()
        .then(() => refreshSlots())
        .catch(() => refreshSlots());
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(run) : window.setTimeout(run, 3000);
    return () => {
      if (!w.requestIdleCallback) window.clearTimeout(id as number);
    };
  }, []);

  function toggleAuto(next: boolean) {
    setSettings(writeSettings({ auto: next }));
    toast.success(next ? "Automatic backup enabled" : "Automatic backup paused");
  }

  async function handleBackupAll() {
    setBusy("all");
    try {
      for (const c of CADENCES) await backupNow(c.key);
      refreshSlots();
      toast.success("Backup completed");
    } catch (e) {
      refreshSlots();
      toast.error((e as Error).message || "Backup failed");
    } finally {
      setBusy(null);
    }
  }


  async function handleBackupNow(cadence: BackupCadence) {
    setBusy(cadence);
    try {
      await backupNow(cadence);
      refreshSlots();
      toast.success(`${cadence} backup saved to this device`);
    } catch (e) {
      toast.error((e as Error).message || "Backup failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload(slot?: BackupSlot) {
    setBusy("download");
    try {
      const file = slot?.payload ? (JSON.parse(slot.payload) as BackupFile) : await createBackup("manual");
      downloadBackup(file, slot?.cadence ?? "manual");
      toast.success("Backup file downloaded");
    } catch (e) {
      toast.error((e as Error).message || "Download failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (err) {
      toast.error((err as Error).message || "Invalid backup file");
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    setBusy("restore");
    try {
      const count = await restoreBackup(pending);
      toast.success(`Restored ${count} records`);
      qc.invalidateQueries();
      setPending(null);
    } catch (e) {
      toast.error((e as Error).message || "Restore failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <DatabaseBackup className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Backup &amp; Restore</h2>
            <p className="text-[12px] text-muted-foreground">
              Automatic daily, weekly and monthly snapshots are kept on this device. Download a copy or restore any file.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={busy === "download"} onClick={() => handleDownload()}>
            {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download backup
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Restore from file
          </Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleFile} aria-label="Backup file" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {CADENCES.map((c) => {
          const slot = slots.find((s) => s.cadence === c.key);
          return (
            <div key={c.key} className="rounded-xl border border-border bg-muted/25 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-foreground">{c.label} backup</span>
                <span className="text-[11px] text-muted-foreground">{slot ? `${slot.rows} rows` : "none yet"}</span>
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {slot ? fmtDateTime(slot.created_at) : "Will run automatically."}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" className="h-7 text-[11.5px]" disabled={busy === c.key} onClick={() => handleBackupNow(c.key)}>
                  {busy === c.key ? "Backing up…" : "Back up now"}
                </Button>
                {slot?.payload && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11.5px]" onClick={() => handleDownload(slot)}>
                    <RotateCcw className="h-3 w-3" /> Export
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Records from {pending ? fmtDateTime(pending.created_at) : ""} will be written back over matching records.
              Newer records that are not in the backup stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy === "restore"} onClick={(e) => { e.preventDefault(); confirmRestore(); }}>
              {busy === "restore" ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
