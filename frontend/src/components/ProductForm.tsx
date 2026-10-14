import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useCategories, useInvalidate } from "../api/hooks";
import type { Product } from "../api/types";
import { formErrors, parseIntStrict, parseMoney } from "../lib/errors";
import { FormError, SelectField, SwitchField, TextAreaField, TextField } from "./form";
import { Drawer, OverlayBody, OverlayFooter } from "./Overlay";
import { useToast } from "./Toast";
import { Button } from "./ui";

/** Cria (sem `product`) ou edita um produto. O saldo nunca é editado aqui. */
export function ProductFormDrawer({ open, onClose, product }: { open: boolean; onClose: () => void; product?: Product }) {
  return (
    <Drawer open={open} onClose={onClose} title={product ? "Editar produto" : "Novo produto"} eyebrow={product?.sku ?? "Cadastro"}>
      <ProductForm product={product} onDone={onClose} />
    </Drawer>
  );
}

function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const categories = useCategories();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [form, setForm] = useState({
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    unit_price: product ? Number(product.unit_price).toFixed(2).replace(".", ",") : "",
    min_stock: String(product?.min_stock ?? 0),
    category_id: String(product?.category_id ?? ""),
    is_active: product?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const set = (field: keyof typeof form) => (value: string | boolean) => setForm((f) => ({ ...f, [field]: value }));

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      product ? api.patch<Product>(`/products/${product.id}`, body) : api.post<Product>("/products", body),
    onSuccess: async (saved) => {
      await invalidate(["products"], ["product", saved.id], ["dashboard"], ["low-stock"]);
      toast.success(product ? "Produto atualizado." : `Produto ${saved.sku} criado.`);
      onDone();
    },
    onError: (err) => {
      const { fields, general } = formErrors(err, {
        SKU_TAKEN: "sku",
        CATEGORY_INACTIVE: "category_id",
        CATEGORY_NOT_FOUND: "category_id",
      });
      setErrors(fields);
      setGeneral(general);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    const price = parseMoney(form.unit_price);
    const min = parseIntStrict(form.min_stock);
    if (!form.sku.trim()) local.sku = "Informe o SKU";
    if (!form.name.trim()) local.name = "Informe o nome";
    if (price === null) local.unit_price = "Preço inválido. Ex.: 12,90";
    if (min === null) local.min_stock = "Informe um número inteiro (0 ou mais)";
    if (!form.category_id) local.category_id = "Escolha uma categoria";
    setErrors(local);
    setGeneral(null);
    if (Object.keys(local).length) return;

    const body = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      unit_price: price,
      min_stock: min,
      category_id: Number(form.category_id),
      ...(product ? { is_active: form.is_active } : {}),
    };
    save.mutate(body);
  }

  const options = (categories.data?.items ?? []).filter((c) => c.is_active || String(c.id) === form.category_id);

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <OverlayBody>
        <FormError message={general} />
        <div className="grid grid-cols-[1fr_1.6fr] gap-3">
          <TextField label="SKU" value={form.sku} onChange={(e) => set("sku")(e.target.value)} error={errors.sku} autoFocus={!product} className="[&_input]:num [&_input]:uppercase" />
          <TextField label="Nome" value={form.name} onChange={(e) => set("name")(e.target.value)} error={errors.name} />
        </div>
        <SelectField
          label="Categoria"
          value={form.category_id}
          onChange={(e) => set("category_id")(e.target.value)}
          error={errors.category_id}
        >
          <option value="">Escolha…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!c.is_active && " (desativada)"}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Preço (R$)"
            inputMode="decimal"
            placeholder="0,00"
            value={form.unit_price}
            onChange={(e) => set("unit_price")(e.target.value)}
            error={errors.unit_price}
          />
          <TextField
            label="Estoque mínimo"
            inputMode="numeric"
            value={form.min_stock}
            onChange={(e) => set("min_stock")(e.target.value)}
            error={errors.min_stock}
            hint="Abaixo disso entra no alerta"
          />
        </div>
        <TextAreaField label="Descrição (opcional)" value={form.description} onChange={(e) => set("description")(e.target.value)} />
        {product ? (
          <SwitchField
            label="Produto ativo"
            description="Desativado não aparece para novos pedidos, mas o histórico é mantido."
            checked={form.is_active}
            onChange={set("is_active")}
          />
        ) : (
          <p className="rounded-[3px] bg-sunken px-3 py-2.5 text-xs text-ink-2">
            O produto começa com <strong>estoque 0</strong>. Depois de criar, use <strong>Entrada / Saída</strong> para lançar o estoque. Assim todo
            saldo fica registrado no histórico.
          </p>
        )}
      </OverlayBody>
      <OverlayFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          {product ? "Salvar alterações" : "Criar produto"}
        </Button>
      </OverlayFooter>
    </form>
  );
}
