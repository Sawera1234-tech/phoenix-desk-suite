import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calcLineTotal,
  fmtRs,
  newDraftLine,
  type DraftLineItem,
  type Product,
} from "@/lib/wholesale";

interface InvoiceLineItemsEditorProps {
  lines: DraftLineItem[];
  products: Product[];
  onChange: (lines: DraftLineItem[]) => void;
}

export function InvoiceLineItemsEditor({ lines, products, onChange }: InvoiceLineItemsEditorProps) {
  function updateLine(key: string, patch: Partial<DraftLineItem>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProduct(key: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    updateLine(key, {
      product_id: product.id,
      product_name: product.name,
      unit_price: product.wholesale_price ?? 0,
    });
  }

  function removeLine(key: string) {
    if (lines.length <= 1) return;
    onChange(lines.filter((line) => line.key !== key));
  }

  function addLine() {
    onChange([...lines, newDraftLine()]);
  }

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[1fr_80px_100px_100px_36px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Product</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Price</span>
        <span className="text-right">Total</span>
        <span />
      </div>

      {lines.map((line) => (
        <div
          key={line.key}
          className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_80px_100px_100px_36px] sm:items-center sm:border-0 sm:bg-transparent sm:p-0"
        >
          <Select value={line.product_id} onValueChange={(v) => selectProduct(line.key, v)}>
            <SelectTrigger className="h-9 bg-background text-[13px]">
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                  {product.sku ? ` (${product.sku})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            min={1}
            value={line.quantity}
            onChange={(e) =>
              updateLine(line.key, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
            }
            className="h-9 text-right tabular-nums"
          />

          <Input
            type="number"
            min={0}
            step={0.01}
            value={line.unit_price}
            onChange={(e) =>
              updateLine(line.key, { unit_price: Math.max(0, parseFloat(e.target.value) || 0) })
            }
            className="h-9 text-right tabular-nums"
          />

          <div className="flex h-9 items-center justify-end px-2 text-[13px] font-semibold tabular-nums text-foreground">
            {fmtRs(calcLineTotal(line.quantity, line.unit_price))}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            onClick={() => removeLine(line.key)}
            disabled={lines.length <= 1}
            aria-label="Remove line"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addLine} className="mt-1">
        <Plus className="h-4 w-4" />
        Add line
      </Button>
    </div>
  );
}
