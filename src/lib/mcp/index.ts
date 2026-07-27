import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getDashboardSummary from "./tools/get-dashboard-summary";
import listLowStock from "./tools/list-low-stock";
import listRecentPurchases from "./tools/list-recent-purchases";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "project-phoenix-mcp",
  title: "Project Phoenix ERP",
  version: "0.1.0",
  instructions:
    "Tools for the Project Phoenix wholesale ERP. Use `get_dashboard_summary` for KPI snapshots, `list_low_stock_items` to see parts needing reorder, and `list_recent_purchases` to review supplier purchase orders. All tools run as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getDashboardSummary, listLowStock, listRecentPurchases],
});
