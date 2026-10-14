import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api/client";
import { STOCK_KEYS, useInvalidate } from "../api/hooks";
import type { Order } from "../api/types";
import { FormError } from "../components/form";
import { PageHeader } from "../components/Layout";
import { Modal, OverlayBody, OverlayFooter } from "../components/Overlay";
import { Table, Td, Th } from "../components/Table";
import { useToast } from "../components/Toast";
import { Button, Card, ErrorState, Spinner } from "../components/ui";
import { WriteGuard } from "../components/WriteGuard";
import { formErrors } from "../lib/errors";
import { formatDateTime, integer, money } from "../lib/format";
import { OrderStatusBadge } from "./Orders";

export function OrderDetailPage() {
  const id = Number(useParams().id);
  const [confirming, setConfirming] = useState(false);
  const order = useQuery({ queryKey: ["order", id], queryFn: () => api.get<Order>(`/orders/${id}`) });

  const back = (
    <Link to="/pedidos" className="label mb-3 inline-flex items-center gap-1 hover:!text-ink">
      <ArrowLeft className="size-3" /> Pedidos
    </Link>
  );
  if (order.isPending) return <Spinner />;
  if (order.isError) {
    return (
      <>
        {back}
        <ErrorState error={order.error} />
      </>
    );
  }

  const o = order.data;
  const cancelled = o.status === "CANCELLED";
  const units = o.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      {back}
      <PageHeader
        eyebrow={formatDateTime(o.created_at)}
        title={`Pedido #${o.id}`}
        actions={
          !cancelled && (
            <WriteGuard>
              <Button variant="danger" icon={Ban} onClick={() => setConfirming(true)}>
                Cancelar pedido
              </Button>
            </WriteGuard>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card title="Itens" className="rise">
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th className="text-right">Qtd.</Th>
                <Th className="text-right">Preço un.</Th>
                <Th className="text-right">Subtotal</Th>
              </tr>
            </thead>
            <tbody>
              {o.items.map((i) => (
                <tr key={i.product_id} className="hover:bg-sunken/60">
                  <Td>
                    <Link to={`/produtos/${i.product_id}`} className="font-medium hover:text-signal-ink hover:underline">
                      {i.name}
                    </Link>
                    <span className="num ml-2 text-[0.7rem] text-ink-3">{i.sku}</span>
                  </Td>
                  <Td className="num text-right">{i.quantity}</Td>
                  <Td className="num text-right text-ink-2">{money(i.unit_price)}</Td>
                  <Td className="num text-right font-medium">{money(i.subtotal)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="px-5 py-3 text-xs text-ink-3">Os preços são os do momento da venda. Mudanças posteriores no cadastro não alteram este pedido.</p>
        </Card>

        <div className="rise relative grid content-start gap-4 [animation-delay:80ms]">
          <Card>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="label">Status</span>
                <OrderStatusBadge status={o.status} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="label">Cliente</span>
                <span className="text-right font-medium">{o.customer_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="label">Itens</span>
                <span className="num">{integer(units)} un</span>
              </div>
              {cancelled && (
                <div className="flex items-center justify-between">
                  <span className="label">Cancelado em</span>
                  <span className="num text-xs">{formatDateTime(o.updated_at)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-dashed border-line-strong pt-3">
                <span className="label !text-ink">Total</span>
                <span className={cancelled ? "num text-2xl text-ink-3 line-through" : "num text-3xl font-medium text-signal-ink"}>{money(o.total_amount)}</span>
              </div>
            </div>
          </Card>
          {cancelled && (
            <div className="rounded-[3px] border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
              Pedido cancelado. O estoque de todos os itens já foi devolvido.
            </div>
          )}
        </div>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Cancelar pedido?" eyebrow={`Pedido #${o.id}`}>
        <CancelConfirm order={o} onDone={() => setConfirming(false)} />
      </Modal>
    </>
  );
}

function CancelConfirm({ order, onDone }: { order: Order; onDone: () => void }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: () => api.post<Order>(`/orders/${order.id}/cancel`),
    onSuccess: async () => {
      await invalidate(...STOCK_KEYS);
      toast.success(`Pedido #${order.id} cancelado. Estoque devolvido.`);
      onDone();
    },
    onError: async (err) => {
      setError(formErrors(err).general);
      // Já cancelado (por outra aba, por exemplo): atualiza a tela para mostrar o estado real.
      await invalidate(["order", order.id]);
    },
  });

  return (
    <>
      <OverlayBody>
        <FormError message={error} />
        <p className="text-sm text-ink-2">O status muda para cancelado e as quantidades abaixo voltam para o estoque. Não dá para desfazer.</p>
        <ul className="divide-y divide-line rounded-[3px] border border-line text-sm">
          {order.items.map((i) => (
            <li key={i.product_id} className="flex justify-between gap-3 px-3 py-2">
              <span className="truncate">{i.name}</span>
              <span className="num text-ok">+{i.quantity}</span>
            </li>
          ))}
        </ul>
      </OverlayBody>
      <OverlayFooter>
        <Button variant="ghost" onClick={onDone}>
          Voltar
        </Button>
        <Button variant="danger" icon={Ban} onClick={() => cancel.mutate()} loading={cancel.isPending}>
          Sim, cancelar
        </Button>
      </OverlayFooter>
    </>
  );
}
