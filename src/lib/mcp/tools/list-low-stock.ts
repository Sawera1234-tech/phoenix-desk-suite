import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_low_stock_items",
  title: "List low stock items",
  description: "List parts whose on-hand quantity is at or below the reorder threshold.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional().describe("Max items to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const items = [
      { sku: "IP15-SCR-OG", name: "iPhone 15 OEM Screen", on_hand: 3, reorder_at: 10 },
      { sku: "SGS24-BAT", name: "Galaxy S24 Battery", on_hand: 5, reorder_at: 15 },
      { sku: "USB-C-PD-65", name: "USB-C PD 65W Cable", on_hand: 8, reorder_at: 25 },
      { sku: "IP14-BACK", name: "iPhone 14 Back Glass", on_hand: 2, reorder_at: 12 },
    ].slice(0, limit ?? 10);
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      structuredContent: { items },
    };
  },
});
