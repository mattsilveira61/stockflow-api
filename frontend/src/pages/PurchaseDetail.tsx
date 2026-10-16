import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, PackageCheck, Send } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api/client";
import { STOCK_KEYS, useInvalidate } from "../api/hooks";
import type { Purchase } from "../api/types";
import { FormError } from "../components/form";
import { PageHeader } from "../components/Layout";
import { Modal, OverlayBody, OverlayFooter } from "../components/Overlay";
import { Table, Td, Th } from "../components/Table";
import { useToast } from "../components/Toast";
import { Button, Card, ErrorState, Spinner } from "../components/ui";
import { WriteGuard } from "../components/WriteGuard";
import { formErrors } from "../lib/errors";
import { formatDateTime, integer, money } from "../lib/format";
import { PurchaseStatusBadge } from "./Purchases";

type Action = "send" | "receive" | "cancel";

const ACTIONS: Record<Action, { title: string; text: string; confirm: string; done: string }> = {
  send: {
    title: "Enviar ao fornecedor?",
    text: "A compra deixa de ser rascunho e não pode mais ser editada. O estoque ainda não muda.",
    confirm: "Enviar",
    done: "Compra enviada ao fornecedor.",
  },
  receive: {
    title: "Receber mercadoria?",
    text: "Confirme que tudo chegou. As quantidades abaixo entram no estoque agora, numa operação só.",
    confirm: "Confirmar recebimento",
    done: "Mercadoria recebida. Estoque atualizado.",
  },
  cancel: {
    title: "Cancelar compra?",
    text: "A compra fica registrada como cancelada. O estoque não muda.",
    confirm: "Sim, cancelar",
    done: "Compra cancelada.",
  },
};

export function PurchaseDetailPage() {
  const id = Number(useParams().id);
  const [action, setAction] = useState<Action | null>(null);
  const purchase = useQuery({ queryKey: ["purchase", id], queryFn: () => api.get<Purchase>(`/purchases/${id}`) });

  const back = (
    <Link to="/compras" className="label mb-3 inline-flex items-center gap-1 hover:!text-ink">
      <ArrowLeft className="size-3" /> Compras
    </Link>
  );
  if (purchase.isPending) return <Spinner />;
  if (purchase.isError) {
    return (
      <>
        {back}
        <ErrorState error={purchase.error} />
      </>
    );
  }

  const p = purchase.data;
  const units = p.items.reduce((s, i) => s + i.quantity, 0);
  const open = p.status === "DRAFT" || p.status === "ORDERED";

  return (
    <>
      {back}
      <PageHeader
        eyebrow={formatDateTime(p.created_at)}
        title={`Compra #${p.id}`}
        actions={
          open && (
            <WriteGuard>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" icon={Ban} onClick={() => setAction("cancel")}>
                  Cancelar
                </Button>
                {p.status === "DRAFT" ? (
                  <Button icon={Send} onClick={() => setAction("send")}>
                    Enviar ao fornecedor
                  </Button>
                ) : (
                  <Button icon={PackageCheck} onClick={() => setAction("receive")}>
                    Receber mercadoria
                  </Button>
                )}
              </div>
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
                <Th className="text-right">Custo un.</Th>
                <Th className="text-right">Subtotal</Th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((i) => (
                <tr key={i.product_id} className="hover:bg-sunken/60">
                  <Td>
                    <Link to={`/produtos/${i.product_id}`} className="font-medium hover:text-signal-ink hover:underline">
                      {i.name}
                    </Link>
                    <span className="num ml-2 text-[0.7rem] text-ink-3">{i.sku}</span>
                  </Td>
                  <Td className="num text-right">{i.quantity}</Td>
                  <Td className="num text-right text-ink-2">{money(i.unit_cost)}</Td>
                  <Td className="num text-right font-medium">{money(i.subtotal)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="rise grid content-start gap-4 [animation-delay:80ms]">
          <Card>
            <div className="space-y-3 px-5 py-4 text-sm">
              <Row label="Status">
                <PurchaseStatusBadge status={p.status} />
              </Row>
              <Row label="Fornecedor">
                <span className="text-right font-medium">{p.supplier_name}</span>
              </Row>
              <Row label="Itens">
                <span className="num">{integer(units)} un</span>
              </Row>
              {p.ordered_at && (
                <Row label="Enviada em">
                  <span className="num text-xs">{formatDateTime(p.ordered_at)}</span>
                </Row>
              )}
              {p.received_at && (
                <Row label="Recebida em">
                  <span className="num text-xs">{formatDateTime(p.received_at)}</span>
                </Row>
              )}
              <div className="flex items-baseline justify-between border-t border-dashed border-line-strong pt-3">
                <span className="label !text-ink">Custo total</span>
                <span className={p.status === "CANCELLED" ? "num text-2xl text-ink-3 line-through" : "num text-3xl font-medium text-signal-ink"}>
                  {money(p.total_cost)}
                </span>
              </div>
            </div>
          </Card>
          {p.note && <p className="rounded-[3px] bg-sunken px-4 py-3 text-sm whitespace-pre-line text-ink-2">{p.note}</p>}
          {p.status === "RECEIVED" && (
            <div className="rounded-[3px] border border-ok/40 bg-ok-soft px-4 py-3 text-sm text-ok">
              Mercadoria recebida: o estoque dos itens já foi atualizado.{" "}
              <Link to={`/movimentacoes?reason=PURCHASE`} className="underline">
                Ver movimentações
              </Link>
            </div>
          )}
        </div>
      </div>

      <Modal open={action !== null} onClose={() => setAction(null)} title={action ? ACTIONS[action].title : ""} eyebrow={`Compra #${p.id}`}>
        {action && <ConfirmAction purchase={p} action={action} onDone={() => setAction(null)} />}
      </Modal>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function ConfirmAction({ purchase, action, onDone }: { purchase: Purchase; action: Action; onDone: () => void }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const a = ACTIONS[action];

  const run = useMutation({
    mutationFn: () => api.post<Purchase>(`/purchases/${purchase.id}/${action}`),
    onSuccess: async () => {
      await invalidate(["purchase", purchase.id], ["purchases"], ["purchase-suggestions"], ...(action === "receive" ? STOCK_KEYS : []));
      toast.success(a.done);
      onDone();
    },
    onError: async (err) => {
      setError(formErrors(err).general);
      // Mudou em outra aba: mostra o estado real
      await invalidate(["purchase", purchase.id]);
    },
  });

  return (
    <>
      <OverlayBody>
        <FormError message={error} />
        <p className="text-sm text-ink-2">{a.text}</p>
        {action === "receive" && (
          <ul className="divide-y divide-line rounded-[3px] border border-line text-sm">
            {purchase.items.map((i) => (
              <li key={i.product_id} className="flex justify-between gap-3 px-3 py-2">
                <span className="truncate">{i.name}</span>
                <span className="num text-ok">+{i.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </OverlayBody>
      <OverlayFooter>
        <Button variant="ghost" onClick={onDone}>
          Voltar
        </Button>
        <Button variant={action === "cancel" ? "danger" : "primary"} onClick={() => run.mutate()} loading={run.isPending}>
          {a.confirm}
        </Button>
      </OverlayFooter>
    </>
  );
}
