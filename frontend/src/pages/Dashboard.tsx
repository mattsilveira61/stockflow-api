import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, PackageCheck, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import type { Dashboard as DashboardData, Page, Product } from "../api/types";
import { PageHeader } from "../components/Layout";
import { Badge, Card, EmptyState, ErrorState, SegmentedControl, Spinner, StockBadge } from "../components/ui";
import { REASON_LABEL, formatDayMonth, integer, money, moneyCompact, timeAgo } from "../lib/format";

const PERIODS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

function readPeriod() {
  try {
    const saved = Number(sessionStorage.getItem("stockflow.dashboardDays"));
    return PERIODS.some((p) => p.value === saved) ? saved : 30;
  } catch {
    return 30;
  }
}

export function DashboardPage() {
  const [days, setDays] = useState(readPeriod);
  const dashboard = useQuery({
    queryKey: ["dashboard", days],
    queryFn: () => api.get<DashboardData>("/dashboard", { days }),
    placeholderData: (prev) => prev,
  });
  const lowStock = useQuery({
    queryKey: ["low-stock"],
    queryFn: () => api.get<Page<Product>>("/reports/low-stock", { page_size: 6 }),
  });

  function changePeriod(value: number) {
    setDays(value);
    try {
      sessionStorage.setItem("stockflow.dashboardDays", String(value));
    } catch {
      /* sem armazenamento */
    }
  }

  const d = dashboard.data;

  return (
    <>
      <PageHeader
        eyebrow={d ? `${formatDayMonth(d.start)} — ${formatDayMonth(d.end)}` : "Visão geral"}
        title="Dashboard"
        actions={<SegmentedControl label="Período" value={days} options={PERIODS} onChange={changePeriod} />}
      />

      {dashboard.isError && <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />}
      {dashboard.isPending && <Spinner />}

      {d && (
        <div className={clsx("grid gap-4 transition-opacity", dashboard.isFetching && "opacity-70")}>
          <Kpis data={d} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <SalesChart data={d} />
            <TopProducts data={d} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <RecentMovements data={d} />
            <Card
              title="Estoque baixo"
              action={
                lowStock.data && lowStock.data.total > 0 ? (
                  <Badge tone="warn">
                    {lowStock.data.total} {lowStock.data.total === 1 ? "item" : "itens"}
                  </Badge>
                ) : undefined
              }
              className="rise [animation-delay:320ms]"
            >
              {lowStock.isPending ? (
                <Spinner />
              ) : lowStock.isError ? (
                <ErrorState error={lowStock.error} />
              ) : lowStock.data.items.length === 0 ? (
                <EmptyState icon={PackageCheck} title="Tudo abastecido">
                  Nenhum produto ativo está no estoque mínimo.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {lowStock.data.items.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="num text-[0.7rem] text-ink-3">{p.sku}</p>
                      </div>
                      <StockMeter quantity={p.stock_quantity} min={p.min_stock} />
                      <StockBadge quantity={p.stock_quantity} min={p.min_stock} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Kpis({ data }: { data: DashboardData }) {
  const k = data.kpis;
  const alert = k.low_stock_count > 0;
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <Kpi delay={0} label="Faturamento" value={money(k.revenue)} hint={`Ticket médio ${money(k.average_ticket)}`} hero />
      <Kpi
        delay={60}
        label="Pedidos"
        value={integer(k.orders)}
        hint={`${integer(k.items_sold)} itens · ${k.cancelled_orders} cancelado${k.cancelled_orders === 1 ? "" : "s"}`}
      />
      <Kpi delay={120} label="Valor em estoque" value={money(k.stock_value)} hint={`${k.active_products} produtos ativos`} />
      <Kpi
        delay={180}
        label="Estoque baixo"
        value={integer(k.low_stock_count)}
        hint={k.out_of_stock_count ? `${k.out_of_stock_count} zerado${k.out_of_stock_count === 1 ? "" : "s"}` : "Nenhum zerado"}
        alert={alert}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  hero,
  alert,
  delay,
}: {
  label: string;
  value: string;
  hint: string;
  hero?: boolean;
  alert?: boolean;
  delay: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={clsx(
        "rise relative overflow-hidden rounded-[4px] border p-4 sm:p-5",
        hero ? "border-ink bg-ink text-paper" : "border-line bg-panel",
        alert && "border-warn/60",
      )}
    >
      {alert && <span className="hazard absolute inset-x-0 top-0 h-1" />}
      <p className={clsx("label flex items-center gap-1.5", hero && "!text-paper/60", alert && "!text-warn")}>
        {alert && <AlertTriangle className="size-3" />}
        {label}
      </p>
      <p className={clsx("num mt-3 truncate text-lg font-medium tracking-tight sm:text-2xl 2xl:text-[1.9rem]", hero && "text-signal")}>{value}</p>
      <p className={clsx("mt-1.5 truncate text-xs", hero ? "text-paper/60" : "text-ink-3")}>{hint}</p>
    </div>
  );
}

function SalesChart({ data }: { data: DashboardData }) {
  const points = data.sales_by_day.map((d) => ({ ...d, revenue: Number(d.revenue) }));
  const best = points.reduce((a, b) => (b.revenue > a.revenue ? b : a), points[0]);
  return (
    <Card
      title="Vendas por dia"
      action={
        best && best.revenue > 0 ? (
          <span className="label flex items-center gap-1">
            <TrendingUp className="size-3 text-signal" /> pico {formatDayMonth(best.date)} · {money(best.revenue)}
          </span>
        ) : undefined
      }
      className="rise [animation-delay:200ms]"
    >
      <div className="h-72 px-2 pt-4 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 24, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--signal)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--signal)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDayMonth}
              tick={{ fill: "var(--ink-3)", fontSize: 11, fontFamily: "IBM Plex Mono" }}
              tickLine={false}
              axisLine={{ stroke: "var(--line-strong)" }}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v) => moneyCompact(v)}
              tick={{ fill: "var(--ink-3)", fontSize: 11, fontFamily: "IBM Plex Mono" }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ stroke: "var(--ink)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof points)[number];
                return (
                  <div className="rounded-[3px] border border-ink bg-panel px-3 py-2 shadow-[3px_3px_0_var(--ink)]">
                    <p className="label">{formatDayMonth(p.date)}</p>
                    <p className="num mt-0.5 text-sm font-medium">{money(p.revenue)}</p>
                    <p className="text-xs text-ink-3">
                      {p.orders} pedido{p.orders === 1 ? "" : "s"}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--signal)"
              strokeWidth={2}
              fill="url(#sales-fill)"
              activeDot={{ r: 4, stroke: "var(--ink)", strokeWidth: 2, fill: "var(--signal)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function TopProducts({ data }: { data: DashboardData }) {
  const max = Math.max(1, ...data.top_products.map((t) => t.quantity));
  return (
    <Card title="Mais vendidos" className="rise [animation-delay:260ms]">
      {data.top_products.length === 0 ? (
        <EmptyState icon={TrendingUp} title="Sem vendas no período" />
      ) : (
        <ol className="space-y-4 px-5 py-5">
          {data.top_products.map((t, i) => (
            <li key={t.product_id}>
              <div className="flex items-baseline gap-3">
                <span className="num w-5 text-xs text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
                <span className="num text-sm">{integer(t.quantity)} un</span>
              </div>
              <div className="mt-1.5 ml-8 flex items-center gap-3">
                <div className="h-2 flex-1 bg-sunken">
                  <div
                    className={clsx("h-full", i === 0 ? "bg-signal" : "bg-ink")}
                    style={{ width: `${(t.quantity / max) * 100}%` }}
                  />
                </div>
                <span className="num w-20 text-right text-[0.7rem] text-ink-3">{money(t.revenue)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function RecentMovements({ data }: { data: DashboardData }) {
  return (
    <Card
      title="Últimas movimentações"
      action={
        <Link to="/movimentacoes" className="label !text-signal-ink hover:underline">
          Ver todas →
        </Link>
      }
      className="rise [animation-delay:300ms]"
    >
      {data.recent_movements.length === 0 ? (
        <EmptyState icon={ArrowDownLeft} title="Nenhuma movimentação ainda" />
      ) : (
        <ul className="divide-y divide-line">
          {data.recent_movements.map((m) => {
            const inbound = m.movement_type === "IN";
            return (
              <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                <span
                  className={clsx(
                    "grid size-7 shrink-0 place-items-center rounded-[3px]",
                    inbound ? "bg-ok-soft text-ok" : "bg-signal-soft text-signal-ink",
                  )}
                >
                  {inbound ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.product_name}</p>
                  <p className="text-[0.7rem] text-ink-3">
                    {REASON_LABEL[m.reason]}
                    {m.order_id && ` · pedido #${m.order_id}`} · {timeAgo(m.created_at)}
                  </p>
                </div>
                <span className={clsx("num text-sm font-medium", inbound ? "text-ok" : "text-ink")}>
                  {inbound ? "+" : "−"}
                  {m.quantity}
                </span>
                <span className="num hidden w-16 text-right text-[0.7rem] text-ink-3 sm:block">saldo {m.balance_after}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Régua do saldo em relação ao mínimo (o tracinho marca o mínimo). */
function StockMeter({ quantity, min }: { quantity: number; min: number }) {
  const scale = Math.max(min * 2, quantity, 1);
  return (
    <div className="relative hidden h-1.5 w-20 bg-sunken sm:block" aria-hidden>
      <div className={clsx("h-full", quantity === 0 ? "bg-danger" : "bg-warn")} style={{ width: `${(quantity / scale) * 100}%` }} />
      <span className="absolute -top-0.5 h-2.5 w-px bg-ink" style={{ left: `${(min / scale) * 100}%` }} />
      <span className="num absolute -top-4 text-[0.6rem] text-ink-3" style={{ left: `calc(${(min / scale) * 100}% - 4px)` }}>
        {quantity}/{min}
      </span>
    </div>
  );
}
