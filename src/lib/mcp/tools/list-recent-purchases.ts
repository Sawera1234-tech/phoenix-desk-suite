import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_recent_purchases",
  title: "List recent purchases",
  description: "List the most recent supplier purchase orders recorded in Project Phoenix.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Max purchases to return (default 5)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const purchases = [
      { id: "PO-1043", supplier: "Karachi Wholesale", total_pkr: 235400, status: "received", date: "2026-07-25" },
      { id: "PO-1042", supplier: "Lahore Parts Co.", total_pkr: 98720, status: "pending", date: "2026-07-24" },
      { id: "PO-1041", supplier: "Guangzhou Direct", total_pkr: 412300, status: "in_transit", date: "2026-07-22" },
      { id: "PO-1040", supplier: "Dubai Mobile Hub", total_pkr: 154900, status: "received", date: "2026-07-20" },
      { id: "PO-1039", supplier: "Islamabad Traders", total_pkr: 72500, status: "received", date: "2026-07-19" },
    ].slice(0, limit ?? 5);
    return {
      content: [{ type: "text", text: JSON.stringify(purchases, null, 2) }],
      structuredContent: { purchases },
    };
  },
});
