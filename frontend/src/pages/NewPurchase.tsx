import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, PackagePlus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client";
import { useInvalidate, useSupplierOptions } from "../api/hooks";
import type { Product, Purchase, RestockSuggestion } from "../api/types";
import { FormError, SelectField, TextAreaField } from "../components/form";
import { PageHeader } from "../components/Layout";
import { ProductPicker } from "../components/ProductPicker";
import { useToast } from "../components/Toast";
import { Button, Card, EmptyState, StockBadge } from "../components/ui";
import { formErrors, parseMoney } from "../lib/errors";
import { money } from "../lib/format";
import { useCanWrite } from "../lib/session";

type Line = { product: Pick<Product, "id" | "name" | "sku">; quantity: string; cost: string };

// Custo inicial sugerido: 60% do preço de venda (dá para editar)
const suggestedCost = (price: string | number) => (Number(price) * 0.6).toFixed(2).replace(".", ",");

/** Monta um rascunho. O estoque só muda quando a compra for recebida, na tela de detalhe. */
export function NewPurchasePage() {
  const canWrite = useCanWrite();
  const suppliers = useSupplierOptions(true);
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string>();

  const suggestions = useQuery({
    queryKey: ["purchase-suggestions"],
    queryFn: () => api.get<RestockSuggestion[]>("/purchases/suggestions"),
  });
  const pending = (suggestions.data ?? []).filter((s) => !lines.some((l) => l.product.id === s.product_id));

  // parseMoney devolve "12.90" ou null (texto inválido)
  const parsed = lines.map((l) => {
    const costValue = parseMoney(l.cost);
    return { ...l, qty: Number(l.quantity), costValue, unit: costValue === null ? null : Number(costValue) };
  });
  const invalid = parsed.some((l) => !Number.isInteger(l.qty) || l.qty <= 0 || l.unit === null);
  const total = parsed.reduce((sum, l) => sum + (l.unit ?? 0) * (l.qty || 0), 0);

  function add(product: Line["product"], quantity: number, price: string | number) {
    setError(null);
    setLines((ls) => (ls.some((l) => l.product.id === product.id) ? ls : [...ls, { product, quantity: String(quantity), cost: suggestedCost(price) }]));
  }

  async function addSuggestions() {
    // A sugestão não traz preço: busca os produtos para calcular o custo inicial
    const products = await Promise.all(pending.map((s) => api.get<Product>(`/products/${s.product_id}`)));
    products.forEach((p, i) => add(p, pending[i].suggested_quantity, p.unit_price));
  }

  function update(id: number, patch: Partial<Line>) {
    setError(null);
    setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  }

  const submit = useMutation({
    mutationFn: () =>
      api.post<Purchase>("/purchases", {
        supplier_id: Number(supplierId),
        note: note.trim() || null,
        items: parsed.map((l) => ({ product_id: l.product.id, quantity: l.qty, unit_cost: l.costValue! })),
      }),
    onSuccess: async (purchase) => {
      await invalidate(["purchases"], ["purchase-suggestions"]);
      toast.success(`Rascunho #${purchase.id} criado · ${money(purchase.total_cost)}`);
      navigate(`/compras/${purchase.id}`);
    },
    onError: (err) => setError(formErrors(err).general ?? "Confira os dados da compra."),
  });

  function confirm() {
    if (!supplierId) return setSupplierError("Escolha o fornecedor");
    setSupplierError(undefined);
    if (invalid) return setError("Confira as quantidades (inteiros maiores que zero) e os custos.");
    submit.mutate();
  }

  return (
    <>
      <Link to="/compras" className="label mb-3 inline-flex items-center gap-1 hover:!text-ink">
        <ArrowLeft className="size-3" /> Compras
      </Link>
      <PageHeader eyebrow="Compras" title="Nova compra" />

      {!canWrite && (
        <div className="mb-4">
          <FormError message="Modo leitura: clique em Entrar e informe a chave para criar compras." />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-4">
          {pending.length > 0 && (
            <Card
              title="Sugestão de reposição"
              action={
                <Button variant="ghost" icon={Sparkles} onClick={addSuggestions} className="h-8 px-2.5">
                  Adicionar todos
                </Button>
              }
              className="rise"
            >
              <ul className="divide-y divide-line">
                {pending.map((s) => (
                  <li key={s.product_id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="num text-[0.7rem] text-ink-3">
                        {s.sku} · {s.stock_quantity} em estoque · mínimo {s.min_stock}
                      </p>
                    </div>
                    <StockBadge quantity={s.stock_quantity} min={s.min_stock} />
                    <span className="num w-16 text-right text-sm">+{s.suggested_quantity}</span>
                  </li>
                ))}
              </ul>
              <p className="px-5 py-2.5 text-[0.7rem] text-ink-3">Leva o saldo ao dobro do mínimo, já descontando compras enviadas e ainda não recebidas.</p>
            </Card>
          )}

          <Card title="Itens" className="rise [animation-delay:60ms]">
            <div className="border-b border-line px-5 py-4">
              <ProductPicker
                label="Adicionar produto"
                value={null}
                onChange={(p) => p && add(p, 1, p.unit_price)}
                activeOnly
                clearable={false}
                exclude={lines.map((l) => l.product.id)}
              />
            </div>
            {lines.length === 0 ? (
              <EmptyState icon={PackagePlus} title="Nenhum item">
                Busque um produto acima ou use a sugestão de reposição.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {parsed.map((l) => (
                  <li key={l.product.id} className="flex flex-wrap items-end gap-x-4 gap-y-2 px-5 py-3">
                    <div className="min-w-40 flex-1 self-center">
                      <p className="font-medium">{l.product.name}</p>
                      <p className="num text-[0.7rem] text-ink-3">{l.product.sku}</p>
                    </div>
                    <label className="grid gap-1">
                      <span className="label">Qtd.</span>
                      <input
                        inputMode="numeric"
                        aria-label={`Quantidade de ${l.product.name}`}
                        value={l.quantity}
                        onChange={(e) => update(l.product.id, { quantity: e.target.value.replace(/\D/g, "") })}
                        className="num h-8 w-20 rounded-[3px] border border-line-strong bg-paper px-2 text-right text-sm outline-none focus:border-ink"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="label">Custo un. (R$)</span>
                      <input
                        inputMode="decimal"
                        aria-label={`Custo unitário de ${l.product.name}`}
                        value={l.cost}
                        onChange={(e) => update(l.product.id, { cost: e.target.value })}
                        className="num h-8 w-24 rounded-[3px] border border-line-strong bg-paper px-2 text-right text-sm outline-none focus:border-ink"
                      />
                    </label>
                    <p className="num w-24 self-center text-right font-medium">{money((l.unit ?? 0) * (l.qty || 0))}</p>
                    <button
                      type="button"
                      aria-label={`Remover ${l.product.name}`}
                      onClick={() => setLines((ls) => ls.filter((x) => x.product.id !== l.product.id))}
                      className="self-center p-1 text-ink-3 hover:text-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="rise grid content-start gap-4 [animation-delay:80ms] lg:sticky lg:top-20">
          <Card title="Resumo">
            <div className="space-y-4 px-5 py-4">
              <SelectField label="Fornecedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} error={supplierError}>
                <option value="">Escolha o fornecedor…</option>
                {suppliers.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
              <TextAreaField label="Observação (opcional)" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex items-baseline justify-between border-t border-dashed border-line-strong pt-3">
                <span className="label !text-ink">Custo total</span>
                <span className="num text-3xl font-medium text-signal-ink">{money(total)}</span>
              </div>
              <FormError message={error} />
              <Button className="w-full" icon={ClipboardList} onClick={confirm} loading={submit.isPending} disabled={!canWrite || lines.length === 0}>
                Salvar rascunho
              </Button>
              <p className="text-[0.7rem] leading-relaxed text-ink-3">
                O rascunho ainda pode ser enviado ao fornecedor ou cancelado. O estoque só entra quando a mercadoria for recebida.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
