import { useEffect, type ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { TopHeader } from "./TopHeader";
import { useBusinessProfile } from "@/components/wholesale/ThermalReceipt";

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { data: business } = useBusinessProfile();
  const shopName = business?.shop_name?.trim();

  // Browser/window title always follows the business name from Settings.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = `${title} · ${shopName || "Project Phoenix"}`;
  }, [title, shopName]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader title={title} subtitle={subtitle} actions={actions} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
