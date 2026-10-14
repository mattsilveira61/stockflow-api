import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { History, X } from "lucide-react";
import { api } from "../api/client";
import { useProductOptions } from "../api/hooks";
import type { MovementWithProduct, Page } from "../api/types";
import { PageHeader } from "../components/Layout";
import { Pagination } from "../components/Table";
import { Card, EmptyState, ErrorState, Spinner } from "../components/ui";
import { REASON_LABEL } from "../lib/format";
import { useUrlFilters } from "../lib/useUrlFilters";
import { MovementTable } from "./ProductDetail";

const DEFAULTS = { product_id: "", movement_type: "", reason: "", created_from: "", created_to: "", page: "1" };

const selectClass = "h-9 rounded-[3px] border border-line-strong bg-paper px-2.5 text-sm";

export function MovementsPage() {
  const [f, setF] = useUrlFilters(DEFAULTS);
  const products = useProductOptions();
  const filtered = Object.entries(f).some(([k, v]) => k !== "page" && v !== "");

  const movements = useQuery({
    queryKey: ["movements", f],
    queryFn: () => api.get<Page<MovementWithProduct>>("/movements", { ...f, page_size: 20 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader eyebrow="Auditoria" title="Movimentações" />
      <Card className="rise">
        <div className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-3">
          <select aria-label="Produto" value={f.product_id} onChange={(e) => setF({ product_id: e.target.value })} className={clsx(selectClass, "min-w-48 flex-1")}>
            <option value="">Todos os produtos</option>
            {products.data?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
          <select aria-label="Tipo" value={f.movement_type} onChange={(e) => setF({ movement_type: e.target.value })} className={selectClass}>
            <option value="">Entradas e saídas</option>
            <option value="IN">Só entradas</option>
            <option value="OUT">Só saídas</option>
          </select>
          <select aria-label="Motivo" value={f.reason} onChange={(e) => setF({ reason: e.target.value })} className={selectClass}>
            <option value="">Todos os motivos</option>
            {Object.entries(REASON_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5">
            <span className="label">de</span>
            <input type="date" aria-label="Data inicial" value={f.created_from} onChange={(e) => setF({ created_from: e.target.value })} className={clsx(selectClass, "num")} />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="label">até</span>
            <input type="date" aria-label="Data final" value={f.created_to} onChange={(e) => setF({ created_to: e.target.value })} className={clsx(selectClass, "num")} />
          </label>
          {filtered && (
            <button
              onClick={() => setF({ product_id: "", movement_type: "", reason: "", created_from: "", created_to: "" })}
              className="label inline-flex h-9 items-center gap-1 px-2 hover:!text-ink"
            >
              <X className="size-3" /> Limpar
            </button>
          )}
        </div>

        {movements.isPending ? (
          <Spinner />
        ) : movements.isError ? (
          <ErrorState error={movements.error} onRetry={() => movements.refetch()} />
        ) : movements.data.items.length === 0 ? (
          <EmptyState icon={History} title="Nenhuma movimentação encontrada">
            {filtered ? "Ajuste os filtros para ver mais resultados." : undefined}
          </EmptyState>
        ) : (
          <div className={clsx(movements.isPlaceholderData && "opacity-60")}>
            <MovementTable movements={movements.data.items} showProduct />
            <Pagination
              page={movements.data.page}
              pages={movements.data.pages}
              total={movements.data.total}
              onPage={(page) => setF({ page: String(page) })}
              noun={["movimentação", "movimentações"]}
            />
          </div>
        )}
      </Card>
    </>
  );
}
