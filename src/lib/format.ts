export function fmtRs(n: number | null | undefined) {
  return "Rs " + Number(n ?? 0).toLocaleString("en-PK");
}

export function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return v;
  }
}

export function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return v;
  }
}
