import { useQuery } from "@tanstack/react-query";
import { forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  calcRemaining,
  fetchInvoiceWithItems,
  fmtRs,
  statusLabel,
  wholesaleKeys,
  type InvoiceWithItems,
} from "@/lib/wholesale";

// ==========================================
// BUSINESS PROFILE (replaces hardcoded STORE_NAME)
// ==========================================

export type BusinessProfile = {
  shop_name: string | null;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  currency: string | null;
  invoice_footer: string | null;
};

const BUSINESS_PROFILE_SELECT = "shop_name, owner_name, phone, address, currency, invoice_footer";

async function fetchBusinessProfile(): Promise<BusinessProfile | null> {
  const { data, error } = await supabase
    .from("business_profile")
    .select(BUSINESS_PROFILE_SELECT)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as BusinessProfile | null;
}

export function useBusinessProfile() {
  return useQuery({
    queryKey: ["business_profile"],
    queryFn: fetchBusinessProfile,
    staleTime: 5 * 60 * 1000,
  });
}

// ==========================================
// SHARED HELPERS
// ==========================================

function formatPrintDate(d: Date) {
  return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
}

function formatPrintTime(d: Date) {
  return d.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shopDisplayName(business: BusinessProfile | null | undefined) {
  return business?.shop_name?.trim() || "Wholesale Invoice";
}

// ==========================================
// RECEIPT CONTENT (shared by preview + hidden print container)
// ==========================================

function ReceiptContent({
  invoice,
  business,
}: {
  invoice: InvoiceWithItems;
  business: BusinessProfile | null | undefined;
}) {
  const remaining = calcRemaining(invoice.total, invoice.paid);
  const now = new Date();

  return (
    <div className="thermal-receipt mx-auto w-full bg-white px-4 py-5 font-mono text-black">
      {/* ===== HEADER ===== */}
      <div className="text-center">
        <h1 className="text-[15px] font-extrabold uppercase tracking-wide leading-tight">
          {shopDisplayName(business)}
        </h1>
        {business?.address && (
          <p className="mt-1 text-[10.5px] leading-snug text-neutral-700">{business.address}</p>
        )}
        {business?.phone && <p className="text-[10.5px] leading-snug text-neutral-700">Tel: {business.phone}</p>}
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.15em]">Wholesale Invoice</p>
      </div>

      <div className="my-3 border-t border-dashed border-black" />

      {/* ===== INVOICE INFO ===== */}
      <div className="space-y-[3px] text-[11px] leading-snug">
        <Row label="Invoice No:" value={invoice.invoice_number} bold />
        <Row label="Invoice Date:" value={invoice.invoice_date} />
        <Row label="Print Date:" value={formatPrintDate(now)} />
        <Row label="Print Time:" value={formatPrintTime(now)} />
        <Row label="Customer:" value={invoice.shopkeepers?.name ?? "—"} />
        <Row label="Status:" value={statusLabel(invoice.status)} />
      </div>

      <div className="my-3 border-t border-dashed border-black" />

      {/* ===== PRODUCT TABLE ===== */}
      <div className="text-[11px]">
        <div className="flex gap-1 border-b border-black pb-1 font-bold uppercase tracking-wide">
          <span className="flex-1">Product</span>
          <span className="w-7 text-right">Qty</span>
          <span className="w-14 text-right">Price</span>
          <span className="w-16 text-right">Total</span>
        </div>

        <div className="divide-y divide-dashed divide-neutral-300">
          {invoice.invoice_items.map((item) => (
            <div key={item.id} className="flex gap-1 py-1.5 align-top">
              <span className="flex-1 whitespace-normal break-words leading-snug">
                {item.products?.name ?? "Item"}
              </span>
              <span className="w-7 shrink-0 text-right tabular-nums">{item.quantity}</span>
              <span className="w-14 shrink-0 text-right tabular-nums">
                {item.unit_price.toLocaleString()}
              </span>
              <span className="w-16 shrink-0 text-right font-semibold tabular-nums">
                {item.line_total.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="my-3 border-t border-dashed border-black" />

      {/* ===== TOTALS ===== */}
      <div className="space-y-1 text-[11.5px]">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">{fmtRs(invoice.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid</span>
          <span className="tabular-nums">{fmtRs(invoice.paid)}</span>
        </div>
        <div className="my-1 border-t border-black" />
        <div className="flex justify-between rounded-sm bg-black px-1.5 py-1 text-[12.5px] font-bold text-white">
          <span>Remaining</span>
          <span className="tabular-nums">{fmtRs(remaining)}</span>
        </div>
      </div>

      <div className="my-3 border-t border-dashed border-black" />

      {/* ===== FOOTER ===== */}
      <div className="text-center text-[10.5px] leading-snug">
        {business?.invoice_footer && (
          <p className="mb-2 whitespace-pre-line text-neutral-700">{business.invoice_footer}</p>
        )}
        <div className="my-2 border-t border-dashed border-black" />
        <p className="text-[11.5px] font-bold">Thank You!</p>
        <p className="text-[10.5px]">Please Visit Again</p>
        <p className="mt-2 text-[9.5px] text-neutral-500">
          Printed: {formatPrintDate(now)} {formatPrintTime(now)}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-neutral-600">{label}</span>
      <span className={`max-w-[150px] truncate text-right ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}

// ==========================================
// HIDDEN, PRINT-ONLY VERSION (rendered inline, shown only via @media print)
// ==========================================

interface ThermalReceiptProps {
  invoiceId: string;
}

export const ThermalReceipt = forwardRef<HTMLDivElement, ThermalReceiptProps>(
  function ThermalReceipt({ invoiceId }, ref) {
    const { data: invoice } = useQuery({
      queryKey: wholesaleKeys.invoice(invoiceId),
      queryFn: () => fetchInvoiceWithItems(invoiceId),
    });

    const { data: business } = useBusinessProfile();

    if (!invoice) return <div ref={ref} />;

    return (
      <div ref={ref} className="thermal-print-container hidden print:block">
        <style>{`
          @media print {
            @page { size:80mm auto; margin:2mm; }
            .thermal-print-container { width: 76mm; }
            .thermal-receipt { padding: 0 !important; }
          }
        `}</style>
        <ReceiptContent invoice={invoice} business={business} />
      </div>
    );
  },
);

// ==========================================
// VISIBLE PREVIEW (for the print dialog / on-screen debugging)
// ==========================================

export function ThermalReceiptPreview({ invoiceId }: ThermalReceiptProps) {
  const { data: invoice, isLoading } = useQuery({
    queryKey: wholesaleKeys.invoice(invoiceId),
    queryFn: () => fetchInvoiceWithItems(invoiceId),
  });

  const { data: business, isLoading: businessLoading } = useBusinessProfile();

  if (isLoading || businessLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading receipt…</div>;
  }
  if (!invoice) return null;

  return (
    <div className="mx-auto max-w-[80mm] overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      <ReceiptContent invoice={invoice} business={business} />
    </div>
  );
}

// ==========================================
// POPUP WINDOW PRINT (standalone thermal print flow)
// ==========================================

export async function printThermalReceipt(invoice: InvoiceWithItems) {
  const remaining = calcRemaining(invoice.total, invoice.paid);
  const business = await fetchBusinessProfile().catch(() => null);
  const now = new Date();
  const printDate = formatPrintDate(now);
  const printTime = formatPrintTime(now);

  const shopName = shopDisplayName(business);
  const phoneLine = business?.phone ? `<div class="info-line">Tel: ${business.phone}</div>` : "";
  const addressLine = business?.address ? `<div class="info-line">${business.address}</div>` : "";
  const footerNote = business?.invoice_footer
    ? `<p class="footer-note">${business.invoice_footer.replace(/\n/g, "<br/>")}</p>`
    : "";

  const printWindow = window.open("", "_blank", "width=340,height=640");
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
    @page { size: 80mm auto; margin: 3mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
   body{
      width:72mm;
      margin:0;
      padding:2mm;
      font-family:'Courier New', monospace;
      font-size:14px;
      font-weight:700;
      line-height:1.5;
      color:#000;
      background:#fff;
      -webkit-print-color-adjust:exact;
     print-color-adjust:exact;
    }
     *{
    font-weight:700 !important;
    color:#000 !important;
    }
    .center { text-align: center; }
    .shop-name { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; }
    .info-line { font-size: 13px; font-weight: 700; color: #000; margin-top: 2px; }
    .doc-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 6px; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .divider-solid { border-top: 1px solid #000; margin: 4px 0; }
    .info { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; font-size: 13px; font-weight: 700; color: #000; }
    .info span:first-child { color: #000; font-weight: 700; }
    .header-row,
    .row{
     display:grid;
     grid-template-columns:1fr 24px 42px 46px;
     align-items:start;
     margin:3px 0;
     font-size:12px;
     column-gap:3px;
    }
    .header-row { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 3px; text-transform: uppercase; }
    .product{
    white-space:normal;
    word-break:break-word;
    overflow-wrap:anywhere;
    font-weight:700;
    color:#000;
    }
    .qty { text-align:right; font-weight:700; color:#000; }
    .price, .total { text-align:right; font-weight:700; color:#000; }
    .total { font-weight: 600; }
    .summary .info { margin: 3px 0; font-size: 11.5px; }
    .bold { font-weight: bold; }
  .remaining-box{
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-top:6px;
    padding:6px 4px;
    border-top:2px solid #000;
    border-bottom:2px solid #000;
    font-size:14px;
    font-weight:700;
    color:#000;
    background:#fff;
   } 
    .footer-note { text-align: center; font-size: 10.5px; color: #333; margin-bottom: 6px; white-space: pre-line; }
    .thank-you { text-align: center; font-weight: bold; font-size: 12px; margin-top: 4px; }
    .visit-again { text-align: center; font-size: 10.5px; }
    .printed-at { text-align: center; font-size: 9.5px; color: #666; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="center">
    <div class="shop-name">${shopName}</div>
    ${addressLine}
    ${phoneLine}
    <div class="doc-title">Wholesale Invoice</div>
  </div>
  <div class="divider"></div>
  <div class="info"><span>Invoice No:</span><span class="bold">${invoice.invoice_number}</span></div>
  <div class="info"><span>Invoice Date:</span><span>${invoice.invoice_date}</span></div>
  <div class="info"><span>Print Date:</span><span>${printDate}</span></div>
  <div class="info"><span>Print Time:</span><span>${printTime}</span></div>
  <div class="info"><span>Customer:</span><span>${invoice.shopkeepers?.name ?? "—"}</span></div>
  <div class="info"><span>Status:</span><span>${statusLabel(invoice.status)}</span></div>
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
    <div class="divider-solid"></div>
    <div class="remaining-box"><span>Remaining</span><span>${fmtRs(remaining)}</span></div>
  </div>
  <div class="divider"></div>
  ${footerNote}

<div class="thank-you">Thank You!</div>
<div class="visit-again">Please Visit Again</div>
<div class="printed-at">Printed: ${printDate} ${printTime}</div>

<script>
window.onload = () => {
  setTimeout(() => {
    window.print();
  }, 500);

  window.onafterprint = () => {
    window.close();
  };
};
</script>
</body>
</html>`);
  printWindow.document.close();
}