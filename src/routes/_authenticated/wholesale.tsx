import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Copy,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/phoenix/StatCard";
import { DeleteInvoiceDialog } from "@/components/wholesale/DeleteInvoiceDialog";
import { EditInvoiceDialog } from "@/components/wholesale/EditInvoiceDialog";
import { InvoiceStatusBadge } from "@/components/wholesale/InvoiceStatusBadge";
import { NewInvoiceDialog } from "@/components/wholesale/NewInvoiceDialog";
import { printThermalReceipt } from "@/components/wholesale/ThermalReceipt";
import { ViewInvoiceDialog } from "@/components/wholesale/ViewInvoiceDialog";
import {
  calcRemaining,
  draftLinesFromItems,
  fetchInvoiceWithItems,
  fetchInvoices,
  fetchWholesaleStats,
  fmtRs,
  wholesaleKeys,
  type Invoice,
  type InvoiceFormData,
} from "@/lib/wholesale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/wholesale")({
  head: () => ({
    meta: [
      { title: "Wholesale · Project Phoenix ERP" },
      {
        name: "description",
        content: "Manage wholesale invoices — create, edit, view, print and track outstanding balances.",
      },
    ],
  }),
  component: WholesalePage,
});

type DialogState =
  | { type: "none" }
  | { type: "new" }
  | { type: "edit"; id: string }
  | { type: "view"; id: string }
  | { type: "delete"; id: string; number: string }
  | { type: "duplicate"; data: Partial<InvoiceFormData> };

function WholesalePage() {
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ type: "none" });

  const {
    data: invoices = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: wholesaleKeys.invoices(),
    queryFn: fetchInvoices,
  });

  const { data: stats } = useQuery({
    queryKey: wholesaleKeys.stats(),
    queryFn: fetchWholesaleStats,
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => fetchInvoiceWithItems(id),
    onSuccess: (invoice) => {
      const duplicateData: Partial<InvoiceFormData> = {
        shopkeeper_id: invoice.shopkeeper_id,
        invoice_date: new Date().toISOString().slice(0, 10),
        paid: 0,
        notes: invoice.notes ?? "",
        lines: draftLinesFromItems(invoice.invoice_items),
      };
      setDialog({ type: "duplicate", data: duplicateData });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to load invoice for duplication");
    },
  });

  const printMutation = useMutation({
    mutationFn: (id: string) => fetchInvoiceWithItems(id),
    onSuccess: (invoice) => {
      printThermalReceipt(invoice);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to load invoice for printing");
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.shopkeepers?.name?.toLowerCase().includes(q) ||
        inv.status.toLowerCase().includes(q),
    );
  }, [invoices, search]);

  function closeDialog() {
    setDialog({ type: "none" });
  }

  return (
    <div className="mx-auto flex max-w-[1720px] flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Wholesale</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Invoice management — create, edit, print thermal receipts, and track balances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={() => setDialog({ type: "new" })}>
            <Plus className="h-4 w-4" />
            New Invoice
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Invoices"
          value={String(stats?.totalInvoices ?? invoices.length)}
          sub="All time"
          icon={FileText}
          tone="primary"
        />
        <StatCard
          label="Today's Sales"
          value={fmtRs(stats?.todaySales ?? 0)}
          sub="Invoices today"
          icon={Wallet}
          tone="success"
        />
        <StatCard
          label="Outstanding Balance"
          value={fmtRs(stats?.outstandingBalance ?? 0)}
          sub="Total - Paid"
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          label="Partial Payments"
          value={String(stats?.partialCount ?? 0)}
          sub="Awaiting balance"
          icon={FileText}
          tone="destructive"
        />
      </div>

      {/* Invoice table */}
      <section className="flex flex-col rounded-2xl border border-border bg-card shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Invoices</h2>
            <p className="text-[12px] text-muted-foreground">
              {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice, customer, status…"
              className="h-8 w-64 pl-8 text-[12px]"
            />
          </div>
        </header>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              Loading invoices…
            </div>
          ) : isError ? (
            <div className="px-6 py-16 text-center text-sm text-destructive">
              Failed to load invoices. Check your Supabase connection.
            </div>
          ) : (
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-[13px]">
              <thead className="bg-muted/70 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="h-9 px-4 text-left font-semibold">Invoice #</th>
                  <th className="h-9 px-4 text-left font-semibold">Date</th>
                  <th className="h-9 px-4 text-left font-semibold">Customer</th>
                  <th className="h-9 px-4 text-right font-semibold">Total</th>
                  <th className="h-9 px-4 text-right font-semibold">Paid</th>
                  <th className="h-9 px-4 text-right font-semibold">Remaining</th>
                  <th className="h-9 px-4 text-left font-semibold">Status</th>
                  <th className="h-9 px-4 text-right font-semibold">Actions</th>
                </tr>
                <tr>
                  <th colSpan={8} className="h-px bg-border p-0" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv, i) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    striped={i % 2 === 1}
                    onView={() => setDialog({ type: "view", id: inv.id })}
                    onEdit={() => setDialog({ type: "edit", id: inv.id })}
                    onPrint={() => printMutation.mutate(inv.id)}
                    onDelete={() =>
                      setDialog({ type: "delete", id: inv.id, number: inv.invoice_number })
                    }
                    onDuplicate={() => duplicateMutation.mutate(inv.id)}
                    isPrinting={printMutation.isPending && printMutation.variables === inv.id}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      {search ? "No invoices match your search." : "No invoices yet. Create your first invoice."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Dialogs */}
      <NewInvoiceDialog
        open={dialog.type === "new" || dialog.type === "duplicate"}
        onOpenChange={(open) => !open && closeDialog()}
        initialData={dialog.type === "duplicate" ? dialog.data : undefined}
      />

      <EditInvoiceDialog
        invoiceId={dialog.type === "edit" ? dialog.id : null}
        open={dialog.type === "edit"}
        onOpenChange={(open) => !open && closeDialog()}
      />

      <ViewInvoiceDialog
        invoiceId={dialog.type === "view" ? dialog.id : null}
        open={dialog.type === "view"}
        onOpenChange={(open) => !open && closeDialog()}
      />

      <DeleteInvoiceDialog
        invoiceId={dialog.type === "delete" ? dialog.id : null}
        invoiceNumber={dialog.type === "delete" ? dialog.number : ""}
        open={dialog.type === "delete"}
        onOpenChange={(open) => !open && closeDialog()}
      />
    </div>
  );
}

function InvoiceRow({
  invoice,
  striped,
  onView,
  onEdit,
  onPrint,
  onDelete,
  onDuplicate,
  isPrinting,
}: {
  invoice: Invoice;
  striped: boolean;
  onView: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  isPrinting: boolean;
}) {
  const remaining = calcRemaining(invoice.total, invoice.paid);

  return (
    <tr
      className={cn(
        "transition-colors hover:bg-primary-soft/40",
        striped && "bg-muted/25",
      )}
    >
      <td className="px-4 py-3 font-mono text-[12px] font-semibold">{invoice.invoice_number}</td>
      <td className="px-4 py-3 text-muted-foreground">{invoice.invoice_date}</td>
      <td className="px-4 py-3 font-medium">{invoice.shopkeepers?.name ?? "—"}</td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtRs(invoice.total)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-success">{fmtRs(invoice.paid)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-warning">{fmtRs(remaining)}</td>
      <td className="px-4 py-3">
        <InvoiceStatusBadge status={invoice.status} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onView} title="View">
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onPrint}
            disabled={isPrinting}
            title="Print thermal receipt"
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate} title="Duplicate">
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
