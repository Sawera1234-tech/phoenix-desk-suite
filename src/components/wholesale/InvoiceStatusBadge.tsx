import { statusBadgeClass, statusLabel, type InvoiceStatus } from "@/lib/wholesale";
import { cn } from "@/lib/utils";

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold",
        statusBadgeClass(status),
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
