import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

/**
 * Filtros guardados na URL (?q=arroz&page=2): sobrevivem ao recarregar e dá para compartilhar o link.
 * `defaults` deve ser uma constante fora do componente. Mudar qualquer filtro volta para a página 1.
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(
    () => Object.fromEntries(Object.entries(defaults).map(([k, d]) => [k, params.get(k) ?? d])) as T,
    [params, defaults],
  );

  const update = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === "" || v === defaults[k]) next.delete(k);
            else next.set(k, v as string);
          }
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams, defaults],
  );

  return [values, update] as const;
}
