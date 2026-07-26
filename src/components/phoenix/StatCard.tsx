import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "destructive" | "neutral";

const toneClasses: Record<Tone, { bg: string; text: string }> = {
  primary: { bg: "bg-primary-soft", text: "text-primary" },
  success: { bg: "bg-success-soft", text: "text-success" },
  warning: { bg: "bg-warning-soft", text: "text-warning" },
  destructive: { bg: "bg-destructive-soft", text: "text-destructive" },
  neutral: { bg: "bg-muted", text: "text-muted-foreground" },
};

export function StatCard({
  label,
  value,
  sub,
  delta,
  positive = true,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  positive?: boolean;
  icon: LucideIcon;
  tone?: Tone;
}) {
  const t = toneClasses[tone];
  return (
    <div className="group relative flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          {sub && <div className="mt-0.5 text-[11px] text-muted-foreground/70">{sub}</div>}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", t.bg)}>
          <Icon className={cn("h-5 w-5", t.text)} />
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div className="text-[26px] font-semibold leading-none tracking-tight text-foreground">
          {value}
        </div>
        {delta && (
          <div
            className={cn(
              "flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-semibold",
              positive ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive",
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {delta}
          </div>
        )}
      </div>
    </div>
  );
}
