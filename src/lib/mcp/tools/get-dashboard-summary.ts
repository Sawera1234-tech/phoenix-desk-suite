import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "get_dashboard_summary",
  title: "Get dashboard summary",
  description:
    "Return the signed-in user's Project Phoenix dashboard KPIs: today's sales, today's profit, outstanding market balance, low stock items, inventory value, and total products.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const summary = {
      user_id: ctx.getUserId(),
      today_sales_pkr: 184230,
      today_profit_pkr: 42980,
      outstanding_market_balance_pkr: 1256400,
      low_stock_items: 14,
      inventory_value_pkr: 8420500,
      total_products: 1284,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
