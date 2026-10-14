import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Plus, ShoppingCart, X } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client";
import { useCustomerOptions } from "../api/hooks";
import type { OrderSummary, Page } from "../api/types";
import { PageHeader } from "../components/Layout";
import { Pagination, Table, Td, Th } from "../components/Table";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "../components/ui";
import { WriteGuard } from "../components/WriteGuard";
import { formatDateTime, money } from "../lib/format";
import { useUrlFilters } from "../lib/useUrlFilters";

const DEFAULTS = { status: "", customer_id: "", created_from: "", created_to: "", page: "1" };
const control = "h-9 rounded-[3px] border border-line-strong bg-paper px-2.5 text-sm";

export function OrderStatusBadge({ status }: { status: OrderSummary["status"] }) {
  return status === "CONFIRMED" ? <Badge tone="ok">Confirmado</Badge> : <Badge tone="danger">Cancelado</Badge>;
}

export function OrdersPage() {
  const [f, setF] = useUrlFilters(DEFAULTS);
  const customers = useCustomerOptions();
  const navigate = useNavigate();
  const filtered = Object.entries(f).some(([k, v]) => k !== "page" && v !== "");

  const orders = useQuery({
    queryKey: ["orders", f],
    queryFn: () => api.get<Page<OrderSummary>>("/orders", { ...f, page_size: 20 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title="Pedidos"
        actions={
          <WriteGuard>
            <Button icon={Plus} onClick={() => navigate("/pedidos/novo")}>
              Novo pedido
            </Button>
          </WriteGuard>
        }
      />
      <Card className="rise">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <select aria-label="Status" value={f.status} onChange={(e) => setF({ status: e.target.value })} className={control}>
            <option value="">Todos os status</option>
            <option value="CONFIRMED">Confirmados</option>
            <option value="CANCELLED">Cancelados</option>
          </select>
          <select aria-label="Cliente" value={f.customer_id} onChange={(e) => setF({ customer_id: e.target.value })} className={clsx(control, "min-w-48 flex-1")}>
            <option value="">Todos os clientes</option>
            {customers.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5">
            <span className="label">de</span>
            <input type="date" aria-label="Data inicial" value={f.created_from} onChange={(e) => setF({ created_from: e.target.value })} className={clsx(control, "num")} />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="label">até</span>
            <input type="date" aria-label="Data final" value={f.created_to} onChange={(e) => setF({ created_to: e.target.value })} className={clsx(control, "num")} />
          </label>
          {filtered && (
            <button onClick={() => setF({ status: "", customer_id: "", created_from: "", created_to: "" })} className="label inline-flex h-9 items-center gap-1 px-2 hover:!text-ink">
              <X className="size-3" /> Limpar
            </button>
          )}
        </div>

        {orders.isPending ? (
          <Spinner />
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
        ) : orders.data.items.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Nenhum pedido encontrado">
            {filtered ? "Ajuste os filtros para ver mais resultados." : "Crie o primeiro pedido."}
          </EmptyState>
        ) : (
          <div className={clsx(orders.isPlaceholderData && "opacity-60")}>
            <Table>
              <thead>
                <tr>
                  <Th>Pedido</Th>
                  <Th>Data</Th>
                  <Th>Cliente</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {orders.data.items.map((o) => (
                  <tr key={o.id} className="group hover:bg-sunken/60">
                    <Td>
                      <Link to={`/pedidos/${o.id}`} className="num font-medium group-hover:text-signal-ink group-hover:underline">
                        #{o.id}
                      </Link>
                    </Td>
                    <Td className="num text-xs whitespace-nowrap text-ink-2">{formatDateTime(o.created_at)}</Td>
                    <Td>{o.customer_name}</Td>
                    <Td>
                      <OrderStatusBadge status={o.status} />
                    </Td>
                    <Td className={clsx("num text-right font-medium", o.status === "CANCELLED" && "text-ink-3 line-through")}>{money(o.total_amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={orders.data.page}
              pages={orders.data.pages}
              total={orders.data.total}
              onPage={(page) => setF({ page: String(page) })}
              noun={["pedido", "pedidos"]}
            />
          </div>
        )}
      </Card>
    </>
  );
}
