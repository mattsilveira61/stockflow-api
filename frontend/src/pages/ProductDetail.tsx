import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, History, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import { useCategories } from "../api/hooks";
import type { Movement, Page, Product } from "../api/types";
import { PageHeader } from "../components/Layout";
import { MovementModal } from "../components/MovementForm";
import { ProductFormDrawer } from "../components/ProductForm";
import { Pagination, Table, Td, Th } from "../components/Table";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner, StockBadge } from "../components/ui";
import { WriteGuard } from "../components/WriteGuard";
import { REASON_LABEL, formatDateTime, integer, money } from "../lib/format";

const HISTORY_PAGE = 10;

export function ProductDetailPage() {
  const id = Number(useParams().id);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const categories = useCategories();

  const product = useQuery({ queryKey: ["product", id], queryFn: () => api.get<Product>(`/products/${id}`) });
  const history = useQuery({
    queryKey: ["product-movements", id, page],
    queryFn: () => api.get<Page<Movement>>(`/products/${id}/movements`, { page, page_size: HISTORY_PAGE }),
    placeholderData: keepPreviousData,
  });
  // Para o gráfico: os 100 movimentos mais recentes, em ordem cronológica.
  const timeline = useQuery({
    queryKey: ["product-movements", id, "chart"],
    queryFn: () => api.get<Page<Movement>>(`/products/${id}/movements`, { page_size: 100 }),
  });

  if (product.isPending) return <Spinner />;
  if (product.isError) {
    return (
      <>
        <BackLink />
        <ErrorState error={product.error} />
      </>
    );
  }

  const p = product.data;
  const category = categories.data?.items.find((c) => c.id === p.category_id);

  return (
    <>
      <BackLink />
      <PageHeader
        eyebrow={`${p.sku} · ${category?.name ?? "…"}`}
        title={p.name}
        actions={
          <>
            <WriteGuard need="admin">
              <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
                Editar
              </Button>
            </WriteGuard>
            <WriteGuard>
              <Button icon={ArrowLeftRight} onClick={() => setMoving(true)} disabled={!p.is_active}>
                Entrada / Saída
              </Button>
            </WriteGuard>
          </>
        }
      />

      {!p.is_active && (
        <div className="rise mb-4 flex items-center gap-3 rounded-[3px] border border-line-strong bg-sunken px-4 py-2.5 text-sm text-ink-2">
          <Badge>Desativado</Badge> Este produto não recebe movimentações nem pedidos novos. O histórico continua disponível.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-4">
          <div className="rise relative overflow-hidden rounded-[4px] border border-ink bg-ink p-5 text-paper">
            <p className="label !text-paper/60">Saldo atual</p>
            <p className="num mt-2 text-5xl font-medium text-signal">{integer(p.stock_quantity)}</p>
            <div className="mt-3 flex items-center gap-2">
              <StockBadge quantity={p.stock_quantity} min={p.min_stock} />
              <span className="text-xs text-paper/60">mínimo {p.min_stock}</span>
            </div>
          </div>
          <Card className="rise [animation-delay:60ms]">
            <dl className="divide-y divide-line text-sm">
              <Row label="Preço">{money(p.unit_price)}</Row>
              <Row label="Valor em estoque">{money(Number(p.unit_price) * p.stock_quantity)}</Row>
              <Row label="Categoria">{category?.name ?? "—"}</Row>
              <Row label="Cadastrado em">{formatDateTime(p.created_at)}</Row>
            </dl>
            {p.description && <p className="border-t border-line px-5 py-3 text-sm text-ink-2">{p.description}</p>}
          </Card>
        </div>

        <Card title="Saldo ao longo do tempo" className="rise [animation-delay:120ms]">
          <BalanceChart movements={timeline.data?.items} min={p.min_stock} />
        </Card>
      </div>

      <Card title="Histórico de movimentações" className="rise mt-4 [animation-delay:180ms]">
        {history.isPending ? (
          <Spinner />
        ) : history.isError ? (
          <ErrorState error={history.error} />
        ) : history.data.items.length === 0 ? (
          <EmptyState icon={History} title="Sem movimentações">
            Use “Entrada / Saída” para lançar o primeiro estoque.
          </EmptyState>
        ) : (
          <div className={clsx(history.isPlaceholderData && "opacity-60")}>
            <MovementTable movements={history.data.items} />
            <Pagination
              page={history.data.page}
              pages={history.data.pages}
              total={history.data.total}
              onPage={setPage}
              noun={["movimentação", "movimentações"]}
            />
          </div>
        )}
      </Card>

      <ProductFormDrawer open={editing} onClose={() => setEditing(false)} product={p} />
      <MovementModal open={moving} onClose={() => setMoving(false)} product={p} />
    </>
  );
}

function BackLink() {
  return (
    <Link to="/produtos" className="label mb-3 inline-flex items-center gap-1 hover:!text-ink">
      <ArrowLeft className="size-3" /> Produtos
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-2.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="num text-right">{children}</dd>
    </div>
  );
}

export function MovementTable({ movements, showProduct }: { movements: (Movement & { sku?: string; product_name?: string })[]; showProduct?: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Data</Th>
          {showProduct && <Th>Produto</Th>}
          <Th>Tipo</Th>
          <Th className="text-right">Qtd.</Th>
          <Th className="text-right">Saldo</Th>
          <Th className="hidden md:table-cell">Origem</Th>
        </tr>
      </thead>
      <tbody>
        {movements.map((m) => {
          const inbound = m.movement_type === "IN";
          return (
            <tr key={m.id} className="hover:bg-sunken/60">
              <Td className="num text-xs whitespace-nowrap text-ink-2">{formatDateTime(m.created_at)}</Td>
              {showProduct && (
                <Td>
                  <Link to={`/produtos/${m.product_id}`} className="font-medium hover:text-signal-ink hover:underline">
                    {m.product_name}
                  </Link>
                  <span className="num ml-2 text-[0.7rem] text-ink-3">{m.sku}</span>
                </Td>
              )}
              <Td>
                <span className={clsx("inline-flex items-center gap-1.5 font-medium", inbound ? "text-ok" : "text-signal-ink")}>
                  {inbound ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                  {REASON_LABEL[m.reason]}
                </span>
              </Td>
              <Td className={clsx("num text-right font-medium", inbound ? "text-ok" : "text-ink")}>
                {inbound ? "+" : "−"}
                {m.quantity}
              </Td>
              <Td className="num text-right">{m.balance_after}</Td>
              <Td className="hidden max-w-64 truncate text-xs text-ink-3 md:table-cell">
                {m.order_id ? (
                  <Link to={`/pedidos/${m.order_id}`} className="num text-signal-ink hover:underline">
                    Pedido #{m.order_id}
                  </Link>
                ) : m.purchase_order_id ? (
                  <Link to={`/compras/${m.purchase_order_id}`} className="num text-signal-ink hover:underline">
                    {m.note ?? `Compra #${m.purchase_order_id}`}
                  </Link>
                ) : (
                  (m.note ?? "—")
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function BalanceChart({ movements, min }: { movements?: Movement[]; min: number }) {
  if (!movements) return <Spinner />;
  if (movements.length === 0) return <EmptyState icon={History} title="Sem dados ainda" />;
  const points = [...movements].reverse().map((m) => ({ t: m.created_at, saldo: m.balance_after }));
  return (
    <div className="h-64 px-2 pt-4 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(t: string) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            tick={{ fill: "var(--ink-3)", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            tickLine={false}
            axisLine={{ stroke: "var(--line-strong)" }}
            minTickGap={32}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--ink-3)", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ReferenceLine
            y={min}
            stroke="var(--warn)"
            strokeDasharray="4 4"
            label={{ value: `mín ${min}`, position: "insideTopRight", fill: "var(--warn)", fontSize: 10, fontFamily: "IBM Plex Mono" }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof points)[number];
              return (
                <div className="rounded-[3px] border border-ink bg-panel px-3 py-2 shadow-[3px_3px_0_var(--ink)]">
                  <p className="label">{formatDateTime(d.t)}</p>
                  <p className="num mt-0.5 text-sm font-medium">saldo {d.saldo}</p>
                </div>
              );
            }}
          />
          <Line type="stepAfter" dataKey="saldo" stroke="var(--ink)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, fill: "var(--signal)", stroke: "var(--ink)" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
