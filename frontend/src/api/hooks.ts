import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Category, Customer, Page, Supplier } from "./types";

/** Todas as categorias (são poucas): usadas em selects e para mostrar o nome na tabela. */
export function useCategories() {
  return useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => api.get<Page<Category>>("/categories", { page_size: 100 }),
    staleTime: 60_000,
  });
}

/** Clientes para selects (até 100; a busca por nome fica na tela de Clientes). */
export function useCustomerOptions() {
  return useQuery({
    queryKey: ["customers", "options"],
    queryFn: () => api.get<Page<Customer>>("/customers", { page_size: 100 }),
    staleTime: 30_000,
  });
}


/** Fornecedores para selects; `activeOnly` para montar compras novas. */
export function useSupplierOptions(activeOnly = false) {
  return useQuery({
    queryKey: ["suppliers", "options", activeOnly],
    queryFn: () => api.get<Page<Supplier>>("/suppliers", { page_size: 100, ...(activeOnly ? { active: true } : {}) }),
    staleTime: 30_000,
  });
}

/** Tudo o que depende do saldo: invalidar depois de qualquer movimentação ou pedido. */
export const STOCK_KEYS = [["products"], ["product"], ["product-movements"], ["movements"], ["dashboard"], ["low-stock"], ["orders"], ["order"]];

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: unknown[][]) => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}
