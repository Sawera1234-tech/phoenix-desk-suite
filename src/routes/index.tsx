import { createFileRoute } from "@tanstack/react-router";
import { AppSidebar } from "@/components/phoenix/AppSidebar";
import { TopHeader } from "@/components/phoenix/TopHeader";
import { Dashboard } from "@/components/phoenix/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Project Phoenix ERP" },
      {
        name: "description",
        content:
          "Project Phoenix — desktop ERP for mobile repair parts wholesale. Track sales, profit, inventory, purchases and suppliers in one enterprise workspace.",
      },
      { property: "og:title", content: "Dashboard · Project Phoenix ERP" },
      {
        property: "og:description",
        content: "Enterprise desktop ERP for mobile repair parts wholesale operations.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className="flex-1 overflow-y-auto">
          <Dashboard />
        </main>
      </div>
    </div>
  );
}
