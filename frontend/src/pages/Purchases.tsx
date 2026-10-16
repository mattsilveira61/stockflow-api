import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Plus, Truck, X } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client";
import { useSupplierOptions } from "../api/hooks";
import type { Page, PurchaseStatus, PurchaseSummary } from "../api/types";
import { PageHeader } from "../components/Layout";
import { Pagination, Table, Td, Th } from "../components/Table";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "../components/ui";
import { WriteGuard } from "../components/WriteGuard";
import { formatDateTime, money } from "../lib/format";
import { useUrlFilters } from "../lib/useUrlFilters";

const DEFAULTS = { status: "", supplier_id: "", page: "1" };
const control = "h-9 rounded-[3px] border border-line-strong bg-paper px-2.5 text-sm";

export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; tone: "neutral" | "signal" | "ok" | "danger" }> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  ORDERED: { label: "Enviado", tone: "signal" },
  RECEIVED: { label: "Recebido", tone: "ok" },
  CANCELLED: { label: "Cancelado", tone: "danger" },
};

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const s = PURCHASE_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PurchasesPage() {
  const [f, setF] = useUrlFilters(DEFAULTS);
  const suppliers = useSupplierOptions();
  const navigate = useNavigate();
  const filtered = f.status !== "" || f.supplier_id !== "";

  const purchases = useQuery({
    queryKey: ["purchases", f],
    queryFn: () => api.get<Page<PurchaseSummary>>("/purchases", { ...f, page_size: 20 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Pedidos de compra"
        actions={
          <WriteGuard>
            <Button icon={Plus} onClick={() => navigate("/compras/nova")}>
              Nova compra
            </Button>
          </WriteGuard>
        }
      />
      <Card className="rise">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <select aria-label="Status" value={f.status} onChange={(e) => setF({ status: e.target.value })} className={control}>
            <option value="">Todos os status</option>
            {Object.entries(PURCHASE_STATUS).map(([value, s]) => (
              <option key={value} value={value}>
                {s.label}
              </option>
            ))}
          </select>
          <select aria-label="Fornecedor" value={f.supplier_id} onChange={(e) => setF({ supplier_id: e.target.value })} className={clsx(control, "min-w-48 flex-1")}>
            <option value="">Todos os fornecedores</option>
            {suppliers.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {filtered && (
            <Button variant="ghost" icon={X} onClick={() => setF({ status: "", supplier_id: "" })} className="h-9">
              Limpar
            </Button>
          )}
        </div>

        {purchases.isPending ? (
          <Spinner />
        ) : purchases.isError ? (
          <ErrorState error={purchases.error} onRetry={() => purchases.refetch()} />
        ) : purchases.data.items.length === 0 ? (
          <EmptyState icon={Truck} title={filtered ? "Nenhuma compra com esses filtros" : "Nenhuma compra ainda"}>
            O estoque só sobe quando a compra é recebida.
          </EmptyState>
        ) : (
          <div className={clsx(purchases.isPlaceholderData && "opacity-60")}>
            <Table>
              <thead>
                <tr>
                  <Th>Compra</Th>
                  <Th>Fornecedor</Th>
                  <Th>Status</Th>
                  <Th className="hidden md:table-cell">Atualizada</Th>
                  <Th className="text-right">Custo</Th>
                </tr>
              </thead>
              <tbody>
                {purchases.data.items.map((p) => (
                  <tr key={p.id} className="hover:bg-sunken/60">
                    <Td>
                      <Link to={`/compras/${p.id}`} className="num font-medium text-signal-ink hover:underline">
                        #{p.id}
                      </Link>
                    </Td>
                    <Td className="font-medium">{p.supplier_name}</Td>
                    <Td>
                      <PurchaseStatusBadge status={p.status} />
                    </Td>
                    <Td className="num hidden text-xs text-ink-3 md:table-cell">{formatDateTime(p.updated_at)}</Td>
                    <Td className={clsx("num text-right font-medium", p.status === "CANCELLED" && "text-ink-3 line-through")}>{money(p.total_cost)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={purchases.data.page}
              pages={purchases.data.pages}
              total={purchases.data.total}
              onPage={(page) => setF({ page: String(page) })}
              noun={["compra", "compras"]}
            />
          </div>
        )}
      </Card>
    </>
  );
}
