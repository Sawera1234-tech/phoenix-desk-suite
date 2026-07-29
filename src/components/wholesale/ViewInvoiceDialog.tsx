import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import {
  calcRemaining,
  fetchInvoiceWithItems,
  fmtRs,
  wholesaleKeys,
} from "@/lib/wholesale";

interface ViewInvoiceDialogProps {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewInvoiceDialog({ invoiceId, open, onOpenChange }: ViewInvoiceDialogProps) {
  const { data: invoice, isLoading, error } = useQuery({
    queryKey: wholesaleKeys.invoice(invoiceId ?? ""),
    queryFn: () => fetchInvoiceWithItems(invoiceId!),
    enabled: open && !!invoiceId,
  });

  const remaining = invoice ? calcRemaining(invoice.total, invoice.paid) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice {invoice?.invoice_number ?? "Details"}</DialogTitle>
          <DialogDescription>Full invoice breakdown with line items and payment status.</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading invoice…</div>
        )}

        {error && (
          <div className="py-12 text-center text-sm text-destructive">
            Failed to load invoice details.
          </div>
        )}

        {invoice && (
          <div className="space-y-5">
            <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Invoice Number
                </p>
                <p className="mt-0.5 font-mono text-[14px] font-semibold">{invoice.invoice_number}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Date
                </p>
                <p className="mt-0.5 text-[14px]">{invoice.invoice_date}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer
                </p>
                <p className="mt-0.5 text-[14px] font-medium">
                  {invoice.shopkeepers?.name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                <div className="mt-1">
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-[13px] font-semibold text-foreground">Line Items</h3>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-[13px]">
                  <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.invoice_items.map((item) => (
                      <tr key={item.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.products?.name ?? "Product"}</div>
                          {item.products?.sku && (
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {item.products.sku}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmtRs(item.unit_price)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {fmtRs(item.line_total)}
                        </td>
                      </tr>
                    ))}
                    {invoice.invoice_items.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                          No line items
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 rounded-xl bg-muted/20 p-4">
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">Grand Total</span>
                <span className="font-semibold tabular-nums">{fmtRs(invoice.total)}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-semibold tabular-nums text-success">{fmtRs(invoice.paid)}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-semibold tabular-nums text-warning">{fmtRs(remaining)}</span>
              </div>
            </div>

            {invoice.notes && (
              <div className="rounded-xl border border-border bg-muted/10 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Notes
                </p>
                <p className="mt-1 text-[13px] text-foreground">{invoice.notes}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
