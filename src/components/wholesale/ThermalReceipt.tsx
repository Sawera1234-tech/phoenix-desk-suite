import { useQuery } from "@tanstack/react-query";
import { forwardRef } from "react";
import {
  calcRemaining,
  fetchInvoiceWithItems,
  fmtRs,
  statusLabel,
  STORE_NAME,
  wholesaleKeys,
  type InvoiceWithItems,
} from "@/lib/wholesale";

interface ThermalReceiptProps {
  invoiceId: string;
}

function ReceiptContent({ invoice }: { invoice: InvoiceWithItems }) {
  const remaining = calcRemaining(invoice.total, invoice.paid);

  return (
    <div className="thermal-receipt mx-auto bg-white p-4 font-mono text-black">
      <div className="text-center">
        <h1 className="text-base font-bold uppercase">{STORE_NAME}</h1>
        <p className="mt-1 text-xs">Wholesale Invoice</p>
      </div>

      <div className="my-3 border-t border-dashed border-black" />

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Invoice No:</span>
          <span className="font-semibold">{invoice.invoice_number}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{invoice.invoice_date}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span className="max-w-[120px] truncate text-right">
            {invoice.shopkeepers?.name ?? "—"}
          </span>
        </div>
      </div>

      <div className="my-3 border-t border-dashed border-black" />

      <div className="space-y-2 text-xs">
        <div className="flex justify-between font-semibold">
          <span className="flex-1">Product</span>
          <span className="w-8 text-right">Qty</span>
          <span className="w-14 text-right">Price</span>
          <span className="w-14 text-right">Total</span>
        </div>

        {invoice.invoice_items.map((item) => (
          <div key={item.id} className="flex justify-between gap-1">
            <span className="flex-1 truncate">{item.products?.name ?? "Item"}</span>
            <span className="w-8 text-right tabular-nums">{item.quantity}</span>
            <span className="w-14 text-right tabular-nums">{item.unit_price.toLocaleString()}</span>
            <span className="w-14 text-right tabular-nums">{item.line_total.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="my-3 border-t border-dashed border-black" />

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">{fmtRs(invoice.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid</span>
          <span className="tabular-nums">{fmtRs(invoice.paid)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Remaining</span>
          <span className="tabular-nums">{fmtRs(remaining)}</span>
        </div>
        <div className="flex justify-between">
          <span>Status</span>
          <span>{statusLabel(invoice.status)}</span>
        </div>
      </div>

      <div className="my-3 border-t border-dashed border-black" />

      <p className="text-center text-xs font-semibold">Thank You</p>
    </div>
  );
}

export const ThermalReceipt = forwardRef<HTMLDivElement, ThermalReceiptProps>(
  function ThermalReceipt({ invoiceId }, ref) {
    const { data: invoice } = useQuery({
      queryKey: wholesaleKeys.invoice(invoiceId),
      queryFn: () => fetchInvoiceWithItems(invoiceId),
    });

    if (!invoice) return <div ref={ref} />;

    return (
      <div ref={ref} className="thermal-print-container hidden print:block">
        <ReceiptContent invoice={invoice} />
      </div>
    );
  },
);

/** Visible preview for print dialog / debugging */
export function ThermalReceiptPreview({ invoiceId }: ThermalReceiptProps) {
  const { data: invoice, isLoading } = useQuery({
    queryKey: wholesaleKeys.invoice(invoiceId),
    queryFn: () => fetchInvoiceWithItems(invoiceId),
  });

  if (isLoading) return <div className="py-8 text-center text-sm">Loading receipt…</div>;
  if (!invoice) return null;

  return (
    <div className="mx-auto max-w-[80mm] rounded-lg border border-border bg-white shadow-sm">
      <ReceiptContent invoice={invoice} />
    </div>
  );
}

export function printThermalReceipt(invoice: InvoiceWithItems) {
  const remaining = calcRemaining(invoice.total, invoice.paid);
  const printWindow = window.open("", "_blank", "width=320,height=600");
  if (!printWindow) return;

  const itemsHtml = invoice.invoice_items
    .map(
      (item) => `
      <div class="row">
        <span class="product">${item.products?.name ?? "Item"}</span>
        <span class="qty">${item.quantity}</span>
        <span class="price">${item.unit_price.toLocaleString()}</span>
        <span class="total">${item.line_total.toLocaleString()}</span>
      </div>`,
    )
    .join("");

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Receipt ${invoice.invoice_number}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      width: 72mm;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .title { font-size: 14px; font-weight: bold; text-transform: uppercase; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .info { display: flex; justify-content: space-between; margin: 2px 0; }
    .header-row, .row {
      display: flex;
      justify-content: space-between;
      gap: 2px;
      margin: 3px 0;
    }
    .header-row { font-weight: bold; }
    .product { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qty { width: 24px; text-align: right; }
    .price, .total { width: 48px; text-align: right; }
    .summary .info { margin: 3px 0; }
    .bold { font-weight: bold; }
    .thank-you { text-align: center; font-weight: bold; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="center">
    <div class="title">${STORE_NAME}</div>
    <div>Wholesale Invoice</div>
  </div>
  <div class="divider"></div>
  <div class="info"><span>Invoice No:</span><span class="bold">${invoice.invoice_number}</span></div>
  <div class="info"><span>Date:</span><span>${invoice.invoice_date}</span></div>
  <div class="info"><span>Customer:</span><span>${invoice.shopkeepers?.name ?? "—"}</span></div>
  <div class="divider"></div>
  <div class="header-row">
    <span class="product">Product</span>
    <span class="qty">Qty</span>
    <span class="price">Price</span>
    <span class="total">Total</span>
  </div>
  ${itemsHtml}
  <div class="divider"></div>
  <div class="summary">
    <div class="info"><span>Subtotal</span><span>${fmtRs(invoice.total)}</span></div>
    <div class="info"><span>Paid</span><span>${fmtRs(invoice.paid)}</span></div>
    <div class="info bold"><span>Remaining</span><span>${fmtRs(remaining)}</span></div>
    <div class="info"><span>Status</span><span>${statusLabel(invoice.status)}</span></div>
  </div>
  <div class="divider"></div>
  <div class="thank-you">Thank You</div>
  <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };</script>
</body>
</html>`);
  printWindow.document.close();
}
