import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Download, PackageSearch, Plus, Search, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, csvExportUrl } from "../api/client";
import { useCategories } from "../api/hooks";
import type { Page, Product } from "../api/types";
import { ProductImportDialog } from "../components/CsvImport";
import { PageHeader } from "../components/Layout";
import { ProductFormDrawer } from "../components/ProductForm";
import { Pagination, SortTh, Table, Td, Th } from "../components/Table";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner, StockBadge } from "../components/ui";
import { WriteGuard } from "../components/WriteGuard";
import { money } from "../lib/format";
import { useUrlFilters } from "../lib/useUrlFilters";

const DEFAULTS = { q: "", category_id: "", status: "active", sort: "name", page: "1" };
const PAGE_SIZE = 15;

export function ProductsPage() {
  const [f, setF] = useUrlFilters(DEFAULTS);
  const [search, setSearch] = useState(f.q);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const categories = useCategories();
  const categoryName = new Map(categories.data?.items.map((c) => [c.id, c.name]));

  // Busca com atraso de 300 ms: não dispara uma requisição a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => search !== f.q && setF({ q: search }), 300);
    return () => clearTimeout(t);
  }, [search, f.q, setF]);

  const products = useQuery({
    queryKey: ["products", "list", f],
    queryFn: () =>
      api.get<Page<Product>>("/products", {
        q: f.q,
        category_id: f.category_id,
        is_active: f.status === "all" ? undefined : f.status === "active",
        sort: f.sort,
        page: f.page,
        page_size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Produtos"
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={csvExportUrl("/products/export.csv", {
                q: f.q,
                category_id: f.category_id,
                is_active: f.status === "all" ? undefined : f.status === "active",
                sort: f.sort,
              })}
              download
              className="inline-flex h-9 items-center gap-2 rounded-[3px] border border-line-strong px-3.5 text-sm font-semibold text-ink transition hover:border-ink hover:bg-sunken"
            >
              <Download className="size-4" /> Exportar
            </a>
            <WriteGuard>
              <Button variant="ghost" icon={Upload} onClick={() => setImporting(true)}>
                Importar
              </Button>
            </WriteGuard>
            <WriteGuard>
              <Button icon={Plus} onClick={() => setCreating(true)}>
                Novo produto
              </Button>
            </WriteGuard>
          </div>
        }
      />

      <Card className="rise">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              aria-label="Buscar por nome ou SKU"
              placeholder="Buscar por nome ou SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-[3px] border border-line-strong bg-paper pr-3 pl-9 text-sm outline-none focus:border-ink"
            />
          </div>
          <select
            aria-label="Categoria"
            value={f.category_id}
            onChange={(e) => setF({ category_id: e.target.value })}
            className="h-9 rounded-[3px] border border-line-strong bg-paper px-2.5 text-sm"
          >
            <option value="">Todas as categorias</option>
            {categories.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Situação"
            value={f.status}
            onChange={(e) => setF({ status: e.target.value })}
            className="h-9 rounded-[3px] border border-line-strong bg-paper px-2.5 text-sm"
          >
            <option value="active">Ativos</option>
            <option value="inactive">Desativados</option>
            <option value="all">Todos</option>
          </select>
        </div>

        {products.isPending ? (
          <Spinner />
        ) : products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : products.data.items.length === 0 ? (
          <EmptyState icon={PackageSearch} title="Nenhum produto encontrado">
            {f.q || f.category_id ? "Tente outra busca ou limpe os filtros." : "Cadastre o primeiro produto."}
          </EmptyState>
        ) : (
          <div className={clsx("transition-opacity", products.isPlaceholderData && "opacity-60")}>
            <Table>
              <thead>
                <tr>
                  <SortTh field="sku" sort={f.sort} onSort={(sort) => setF({ sort })}>
                    SKU
                  </SortTh>
                  <SortTh field="name" sort={f.sort} onSort={(sort) => setF({ sort })}>
                    Produto
                  </SortTh>
                  <Th className="hidden md:table-cell">Categoria</Th>
                  <SortTh field="unit_price" sort={f.sort} onSort={(sort) => setF({ sort })} className="text-right">
                    Preço
                  </SortTh>
                  <SortTh field="stock_quantity" sort={f.sort} onSort={(sort) => setF({ sort })} className="text-right">
                    Estoque
                  </SortTh>
                  <Th className="hidden sm:table-cell">Situação</Th>
                </tr>
              </thead>
              <tbody>
                {products.data.items.map((p) => (
                  <tr key={p.id} className="group hover:bg-sunken/60">
                    <Td className="num text-xs text-ink-2">{p.sku}</Td>
                    <Td>
                      <Link to={`/produtos/${p.id}`} className="font-medium group-hover:text-signal-ink group-hover:underline">
                        {p.name}
                      </Link>
                      {!p.is_active && (
                        <span className="ml-2">
                          <Badge>Desativado</Badge>
                        </span>
                      )}
                    </Td>
                    <Td className="hidden text-ink-2 md:table-cell">{categoryName.get(p.category_id) ?? "—"}</Td>
                    <Td className="num text-right">{money(p.unit_price)}</Td>
                    <Td className="text-right">
                      <span className="num font-medium">{p.stock_quantity}</span>
                      <span className="num text-xs text-ink-3"> / mín {p.min_stock}</span>
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <StockBadge quantity={p.stock_quantity} min={p.min_stock} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={products.data.page}
              pages={products.data.pages}
              total={products.data.total}
              onPage={(page) => setF({ page: String(page) })}
              noun={["produto", "produtos"]}
            />
          </div>
        )}
      </Card>

      <ProductFormDrawer open={creating} onClose={() => setCreating(false)} />
      <ProductImportDialog open={importing} onClose={() => setImporting(false)} />
    </>
  );
}
