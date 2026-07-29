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
  createInvoice,
  fetchProducts,
  fetchShopkeepers,
  invalidateWholesaleQueries,
  newDraftLine,
  fmtRs,
  wholesaleKeys,
  type DraftLineItem,
  type InvoiceFormData,
} from "@/lib/wholesale";

interface NewInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill from duplicate */
  initialData?: Partial<InvoiceFormData>;
}

const defaultForm = (): InvoiceFormData => ({
  shopkeeper_id: "",
  invoice_date: new Date().toISOString().slice(0, 10),
  paid: 0,
  notes: "",
  lines: [newDraftLine()],
});

export function NewInvoiceDialog({ open, onOpenChange, initialData }: NewInvoiceDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<InvoiceFormData>(defaultForm);

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
    if (open) {
      setForm({
        ...defaultForm(),
        ...initialData,
        lines:
          initialData?.lines && initialData.lines.length > 0
            ? initialData.lines.map((l) => ({ ...l, key: crypto.randomUUID() }))
            : [newDraftLine()],
      });
    }
  }, [open, initialData]);

  const subtotal = calcSubtotal(form.lines);
  const remaining = calcRemaining(subtotal, form.paid);
  const status = calcInvoiceStatus(subtotal, form.paid);

  const mutation = useMutation({
    mutationFn: () => createInvoice(form),
    onSuccess: () => {
      invalidateWholesaleQueries(queryClient);
      toast.success("Invoice created successfully");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create invoice");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          <DialogTitle>{initialData ? "Duplicate Invoice" : "New Invoice"}</DialogTitle>
          <DialogDescription>
            {initialData
              ? "Review and edit the copied invoice before saving."
              : "Create a wholesale invoice with products and payment details."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer</Label>
              <Select
                value={form.shopkeeper_id}
                onValueChange={(v) => setForm((f) => ({ ...f, shopkeeper_id: v }))}
              >
                <SelectTrigger id="customer">
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
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
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
              <Label htmlFor="paid">Paid Amount</Label>
              <Input
                id="paid"
                type="number"
                min={0}
                step={0.01}
                value={form.paid}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paid: Math.max(0, parseFloat(e.target.value) || 0) }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Optional notes"
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
              {mutation.isPending ? "Saving…" : "Save Invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
