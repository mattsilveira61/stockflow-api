import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { STOCK_KEYS, useInvalidate } from "../api/hooks";
import type { Movement, MovementType, Product } from "../api/types";
import { formErrors, parseIntStrict } from "../lib/errors";
import { FormError, TextAreaField, TextField } from "./form";
import { Modal, OverlayBody, OverlayFooter } from "./Overlay";
import { useToast } from "./Toast";
import { Button } from "./ui";

/** Entrada (compra/ajuste) ou saída (ajuste) manual. Vendas e cancelamentos vêm só dos pedidos. */
export function MovementModal({ open, onClose, product }: { open: boolean; onClose: () => void; product: Product }) {
  return (
    <Modal open={open} onClose={onClose} title="Entrada / Saída" eyebrow={`${product.sku} · saldo ${product.stock_quantity}`}>
      <MovementForm product={product} onDone={onClose} />
    </Modal>
  );
}

function MovementForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const [type, setType] = useState<MovementType>("IN");
  const [reason, setReason] = useState<"PURCHASE" | "ADJUSTMENT">("PURCHASE");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [qtyError, setQtyError] = useState<string>();
  const invalidate = useInvalidate();
  const toast = useToast();

  const qty = parseIntStrict(quantity);
  const after = qty === null ? null : product.stock_quantity + (type === "IN" ? qty : -qty);

  const save = useMutation({
    mutationFn: () =>
      api.post<Movement>(`/products/${product.id}/movements`, {
        movement_type: type,
        reason: type === "OUT" ? "ADJUSTMENT" : reason,
        quantity: qty,
        note: note.trim() || null,
      }),
    onSuccess: async (m) => {
      await invalidate(...STOCK_KEYS);
      toast.success(`${type === "IN" ? "Entrada" : "Saída"} de ${m.quantity} registrada. Saldo: ${m.balance_after}.`);
      onDone();
    },
    onError: (err) => {
      const { fields, general } = formErrors(err, { INSUFFICIENT_STOCK: "quantity" });
      setQtyError(fields.quantity);
      setError(general);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (qty === null || qty <= 0) return setQtyError("Informe uma quantidade inteira maior que zero");
    setQtyError(undefined);
    save.mutate();
  }

  return (
    <form onSubmit={submit} noValidate>
      <OverlayBody>
        <FormError message={error} />
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-2">
          {(
            [
              ["IN", "Entrada", ArrowDownLeft, "border-ok bg-ok-soft text-ok"],
              ["OUT", "Saída", ArrowUpRight, "border-signal bg-signal-soft text-signal-ink"],
            ] as const
          ).map(([value, label, Icon, activeClass]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={type === value}
              onClick={() => setType(value)}
              className={clsx(
                "flex items-center justify-center gap-2 rounded-[3px] border-2 py-2.5 text-sm font-semibold transition",
                type === value ? activeClass : "border-line text-ink-2 hover:border-line-strong",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {type === "IN" ? (
          <div className="flex gap-4 text-sm">
            {(
              [
                ["PURCHASE", "Compra / reposição"],
                ["ADJUSTMENT", "Ajuste de inventário"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="reason" className="accent-[var(--signal)]" checked={reason === value} onChange={() => setReason(value)} />
                {label}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-3">Saídas manuais são registradas como ajuste (perda, avaria, inventário). Vendas saem pelos pedidos.</p>
        )}

        <TextField
          label="Quantidade"
          inputMode="numeric"
          autoFocus
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={qtyError}
          hint={
            after !== null && qty! > 0 ? (
              <span className={clsx("num", after < 0 && "text-danger")}>
                Saldo: {product.stock_quantity} → {after}
                {after < 0 && " (insuficiente)"}
              </span>
            ) : (
              `Saldo atual: ${product.stock_quantity}`
            )
          }
        />
        <TextAreaField label="Observação (opcional)" placeholder="Ex.: NF 4512, produto avariado…" value={note} onChange={(e) => setNote(e.target.value)} />
      </OverlayBody>
      <OverlayFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          Registrar {type === "IN" ? "entrada" : "saída"}
        </Button>
      </OverlayFooter>
    </form>
  );
}
