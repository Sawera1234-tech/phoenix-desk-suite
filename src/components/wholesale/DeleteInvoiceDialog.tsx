import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { deleteInvoice, invalidateWholesaleQueries } from "@/lib/wholesale";

interface DeleteInvoiceDialogProps {
  invoiceId: string | null;
  invoiceNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteInvoiceDialog({
  invoiceId,
  invoiceNumber,
  open,
  onOpenChange,
}: DeleteInvoiceDialogProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => deleteInvoice(invoiceId!),
    onSuccess: () => {
      invalidateWholesaleQueries(queryClient);
      toast.success("Invoice deleted successfully");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete invoice");
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete invoice{" "}
            <strong className="font-mono">{invoiceNumber}</strong>? This will permanently remove
            the invoice, all line items, and related ledger entries. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={mutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (invoiceId) mutation.mutate();
            }}
          >
            {mutation.isPending ? "Deleting…" : "Delete Invoice"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
