const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const int = new Intl.NumberFormat("pt-BR");
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export const money = (v: string | number) => brl.format(Number(v));
export const moneyCompact = (v: string | number) => brlCompact.format(Number(v));
export const integer = (v: number) => int.format(v);
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/** "2026-10-14" (data sem hora vinda da API) → "14/10". */
export const formatDayMonth = (isoDate: string) => dayMonth.format(new Date(`${isoDate}T00:00:00Z`));

export function timeAgo(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "agora";
}

export const REASON_LABEL = {
  PURCHASE: "Compra",
  ADJUSTMENT: "Ajuste",
  SALE: "Venda",
  CANCELLATION: "Cancelamento",
} as const;
