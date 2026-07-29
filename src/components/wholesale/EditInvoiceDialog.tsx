import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceLineItemsEditor } from "./InvoiceLineItemsEditor";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import {
  calcInvoiceStatus,
  calcRemaining,
  calcSubtotal,
  draftLinesFromItems,
  fetchInvoiceWithItems,
  fetchProducts,
  fetchShopkeepers,
  invalidateWholesaleQueries,
  newDraftLine,
  updateInvoice,
  fmtRs,
  wholesaleKeys,
  type DraftLineItem,
  type InvoiceFormData,
} from "@/lib/wholesale";

interface EditInvoiceDialogProps {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditInvoiceDialog({ invoiceId, open, onOpenChange }: EditInvoiceDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<InvoiceFormData>({
    shopkeeper_id: "",
    invoice_date: "",
    paid: 0,
    notes: "",
    lines: [newDraftLine()],
  });

  const { data: invoice, isLoading } = useQuery({
    queryKey: wholesaleKeys.invoice(invoiceId ?? ""),
    queryFn: () => fetchInvoiceWithItems(invoiceId!),
    enabled: open && !!invoiceId,
  });

  const { data: shopkeepers = [] } = useQuery({
    queryKey: wholesaleKeys.shopkeepers(),
    queryFn: fetchShopkeepers,
    enabled: open,
  });

  const { data: products = [] } = useQuery({
    queryKey: wholesaleKeys.products(),
    queryFn: fetchProducts,
    enabled: open,
  });

  useEffect(() => {
    if (invoice) {
      setForm({
        shopkeeper_id: invoice.shopkeeper_id,
        invoice_date: invoice.invoice_date,
        paid: invoice.paid,
        notes: invoice.notes ?? "",
        lines:
          invoice.invoice_items.length > 0
            ? draftLinesFromItems(invoice.invoice_items)
            : [newDraftLine()],
      });
    }
  }, [invoice]);

  const subtotal = calcSubtotal(form.lines);
  const remaining = calcRemaining(subtotal, form.paid);
  const status = calcInvoiceStatus(subtotal, form.paid);

  const mutation = useMutation({
    mutationFn: () => updateInvoice(invoiceId!, form),
    onSuccess: () => {
      invalidateWholesaleQueries(queryClient);
      if (invoiceId) {
        queryClient.invalidateQueries({ queryKey: wholesaleKeys.invoice(invoiceId) });
      }
      toast.success("Invoice updated successfully");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update invoice");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId) return;
    if (!form.shopkeeper_id) {
      toast.error("Please select a customer");
      return;
    }
    if (form.lines.every((l) => !l.product_id)) {
      toast.error("Add at least one product");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Invoice {invoice?.invoice_number ?? ""}</DialogTitle>
          <DialogDescription>Update products, quantities, prices, and payment.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading invoice…</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-customer">Customer</Label>
                <Select
                  value={form.shopkeeper_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, shopkeeper_id: v }))}
                >
                  <SelectTrigger id="edit-customer">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {shopkeepers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={form.invoice_date}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Products</Label>
              <InvoiceLineItemsEditor
                lines={form.lines}
                products={products}
                onChange={(lines: DraftLineItem[]) => setForm((f) => ({ ...f, lines }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-paid">Paid Amount</Label>
                <Input
                  id="edit-paid"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.paid}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      paid: Math.max(0, parseFloat(e.target.value) || 0),
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="flex flex-wrap gap-4 text-[13px]">
                <span>
                  Subtotal: <strong className="tabular-nums">{fmtRs(subtotal)}</strong>
                </span>
                <span>
                  Remaining:{" "}
                  <strong className="tabular-nums text-warning">{fmtRs(remaining)}</strong>
                </span>
              </div>
              <InvoiceStatusBadge status={status} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Update Invoice"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
