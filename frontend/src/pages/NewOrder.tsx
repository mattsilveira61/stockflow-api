import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, Minus, PackagePlus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client";
import { STOCK_KEYS, useCustomerOptions, useInvalidate } from "../api/hooks";
import type { Order, Product } from "../api/types";
import { FormError, SelectField } from "../components/form";
import { PageHeader } from "../components/Layout";
import { ProductPicker } from "../components/ProductPicker";
import { useToast } from "../components/Toast";
import { Button, Card, EmptyState, StockBadge } from "../components/ui";
import { formErrors } from "../lib/errors";
import { money } from "../lib/format";
import { useCanWrite } from "../lib/session";

type Line = { product: Product; quantity: number };

/** Carrinho: o total aqui é só uma prévia; o valor oficial é calculado pela API. */
export function NewOrderPage() {
  const canWrite = useCanWrite();
  const customers = useCustomerOptions();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string>();
  // Uma chave por tentativa de pedido: reenviar (clique duplo, rede instável) não cria outro.
  // Muda quando o carrinho muda, porque aí já é outro pedido.
  const idempotencyKey = useRef(crypto.randomUUID());
  const resetKey = () => (idempotencyKey.current = crypto.randomUUID());

  const total = lines.reduce((sum, l) => sum + Number(l.product.unit_price) * l.quantity, 0);
  const units = lines.reduce((sum, l) => sum + l.quantity, 0);

  function addProduct(p: Product | null) {
    if (!p) return;
    resetKey();
    setError(null);
    setLines((ls) => (ls.some((l) => l.product.id === p.id) ? ls : [...ls, { product: p, quantity: 1 }]));
  }

  function setQuantity(id: number, quantity: number) {
    resetKey();
    setError(null);
    setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, quantity: Math.max(1, quantity) } : l)));
  }

  function remove(id: number) {
    resetKey();
    setError(null);
    setLines((ls) => ls.filter((l) => l.product.id !== id));
  }

  const submit = useMutation({
    mutationFn: () =>
      api.post<Order>(
        "/orders",
        { customer_id: Number(customerId), items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })) },
        { "Idempotency-Key": idempotencyKey.current },
      ),
    onSuccess: async (order) => {
      await invalidate(...STOCK_KEYS);
      toast.success(`Pedido #${order.id} criado · ${money(order.total_amount)}`);
      navigate(`/pedidos/${order.id}`);
    },
    // Em caso de erro o carrinho continua montado: dá para ajustar e tentar de novo.
    onError: (err) => setError(formErrors(err).general ?? "Confira os dados do pedido."),
  });

  function confirm() {
    if (!customerId) return setCustomerError("Escolha o cliente");
    setCustomerError(undefined);
    submit.mutate();
  }

  return (
    <>
      <Link to="/pedidos" className="label mb-3 inline-flex items-center gap-1 hover:!text-ink">
        <ArrowLeft className="size-3" /> Pedidos
      </Link>
      <PageHeader eyebrow="Vendas" title="Novo pedido" />

      {!canWrite && (
        <div className="mb-4">
          <FormError message="Modo leitura: clique em Entrar e informe a chave para criar pedidos." />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="Itens" className="rise">
          <div className="border-b border-line px-5 py-4">
            <ProductPicker
              label="Adicionar produto"
              value={null}
              onChange={addProduct}
              activeOnly
              clearable={false}
              exclude={lines.map((l) => l.product.id)}
              renderHint={(p) => (
                <span className="flex items-center gap-2">
                  <span className="num text-xs text-ink-3">{p.stock_quantity} em estoque</span>
                  <StockBadge quantity={p.stock_quantity} min={p.min_stock} />
                </span>
              )}
            />
          </div>

          {lines.length === 0 ? (
            <EmptyState icon={PackagePlus} title="Carrinho vazio">
              Busque um produto acima. Dá para digitar sem acento: “feijao”, “agua”…
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => {
                const over = l.quantity > l.product.stock_quantity;
                return (
                  <li key={l.product.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <div className="min-w-40 flex-1">
                      <p className="font-medium">{l.product.name}</p>
                      <p className={clsx("num text-[0.7rem]", over ? "font-medium text-danger" : "text-ink-3")}>
                        {l.product.sku} · {money(l.product.unit_price)} · {l.product.stock_quantity} disponíveis
                        {over && " · acima do estoque"}
                      </p>
                    </div>
                    <div className="flex items-center">
                      <StepButton label={`Diminuir ${l.product.name}`} onClick={() => setQuantity(l.product.id, l.quantity - 1)} disabled={l.quantity <= 1}>
                        <Minus className="size-3.5" />
                      </StepButton>
                      <input
                        aria-label={`Quantidade de ${l.product.name}`}
                        inputMode="numeric"
                        value={l.quantity}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D/g, ""));
                          setQuantity(l.product.id, Number.isFinite(n) ? n : 1);
                        }}
                        className={clsx(
                          "num h-8 w-14 border-y border-line-strong bg-paper text-center text-sm outline-none focus:border-ink",
                          over && "border-danger text-danger",
                        )}
                      />
                      <StepButton label={`Aumentar ${l.product.name}`} onClick={() => setQuantity(l.product.id, l.quantity + 1)}>
                        <Plus className="size-3.5" />
                      </StepButton>
                    </div>
                    <p className="num w-24 text-right font-medium">{money(Number(l.product.unit_price) * l.quantity)}</p>
                    <button type="button" aria-label={`Remover ${l.product.name}`} onClick={() => remove(l.product.id)} className="p-1 text-ink-3 hover:text-danger">
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="rise grid content-start gap-4 [animation-delay:80ms] lg:sticky lg:top-20">
          <Card title="Resumo">
            <div className="space-y-4 px-5 py-4">
              <SelectField label="Cliente" value={customerId} onChange={(e) => setCustomerId(e.target.value)} error={customerError}>
                <option value="">Escolha o cliente…</option>
                {customers.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between text-ink-2">
                  <dt>Itens</dt>
                  <dd className="num">
                    {lines.length} produto{lines.length === 1 ? "" : "s"} · {units} un
                  </dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-dashed border-line-strong pt-3">
                  <dt className="label !text-ink">Total</dt>
                  <dd className="num text-3xl font-medium text-signal-ink">{money(total)}</dd>
                </div>
              </dl>
              <FormError message={error} />
              <Button className="w-full" icon={ShoppingCart} onClick={confirm} loading={submit.isPending} disabled={!canWrite || lines.length === 0}>
                Confirmar pedido
              </Button>
              <p className="text-[0.7rem] leading-relaxed text-ink-3">
                Preço e total finais são calculados pela API no momento da confirmação. O estoque é baixado na mesma operação: se algum item
                faltar, nada é gravado.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center border border-line-strong text-ink-2 first:rounded-l-[3px] last:rounded-r-[3px] hover:bg-sunken hover:text-ink disabled:opacity-35"
    >
      {children}
    </button>
  );
}
