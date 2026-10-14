import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { api } from "../api/client";
import type { Page, Product } from "../api/types";
import { money } from "../lib/format";

/**
 * Campo de produto que mistura busca e lista: digitar filtra (sem acento: "feijao" → "Feijão"),
 * clicar sem digitar mostra a lista. Setas + Enter escolhem pelo teclado.
 */
export function ProductPicker({
  label,
  value,
  onChange,
  placeholder = "Digite o nome ou SKU…",
  activeOnly,
  exclude = [],
  renderHint,
  clearable = true,
  className,
}: {
  label: string;
  value: Pick<Product, "id" | "name" | "sku"> | null;
  onChange: (product: Product | null) => void;
  placeholder?: string;
  activeOnly?: boolean;
  exclude?: number[];
  renderHint?: (p: Product) => React.ReactNode;
  clearable?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(text), 200);
    return () => clearTimeout(t);
  }, [text]);

  // Clique fora fecha a lista.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const results = useQuery({
    queryKey: ["products", "picker", term, activeOnly],
    queryFn: () =>
      api.get<Page<Product>>("/products", { q: term, is_active: activeOnly ? true : undefined, page_size: 30, sort: "name" }),
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const items = (results.data?.items ?? []).filter((p) => !exclude.includes(p.id));

  function choose(p: Product) {
    onChange(p);
    setOpen(false);
    setText("");
    setTerm("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && open && items[cursor]) {
      e.preventDefault();
      choose(items[cursor]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  const listId = `${id}-list`;
  const showSelected = value && !open;

  return (
    <div ref={boxRef} className={clsx("relative", className)}>
      <label htmlFor={id} className="label mb-1.5 block">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && items[cursor] ? `${id}-opt-${items[cursor].id}` : undefined}
          autoComplete="off"
          placeholder={showSelected ? "" : placeholder}
          value={showSelected ? `${value.name} · ${value.sku}` : text}
          onChange={(e) => {
            setText(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          className={clsx(
            "h-9 w-full rounded-[3px] border border-line-strong bg-paper pr-16 pl-9 text-sm outline-none focus:border-ink",
            showSelected && "font-medium",
          )}
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
          {clearable && value && (
            <button
              type="button"
              aria-label="Limpar produto"
              onClick={() => {
                onChange(null);
                inputRef.current?.focus();
              }}
              className="p-1 text-ink-3 hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Mostrar lista de produtos"
            onClick={() => {
              setOpen((o) => !o);
              inputRef.current?.focus();
            }}
            className="p-1 text-ink-3 hover:text-ink"
          >
            <ChevronDown className={clsx("size-4 transition", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-72 w-full min-w-72 overflow-y-auto rounded-[3px] border border-ink bg-panel py-1 shadow-[4px_4px_0_var(--ink)]"
        >
          {results.isPending ? (
            <li className="label px-3 py-2">Carregando…</li>
          ) : items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-3">Nenhum produto encontrado{term && ` para “${term}”`}.</li>
          ) : (
            items.map((p, i) => (
              <li
                key={p.id}
                id={`${id}-opt-${p.id}`}
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                className={clsx("flex cursor-pointer items-center gap-3 px-3 py-1.5", i === cursor && "bg-sunken")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="num block text-[0.7rem] text-ink-3">
                    {p.sku} · {money(p.unit_price)}
                  </span>
                </span>
                {renderHint?.(p)}
              </li>
            ))
          )}
          {results.data && results.data.total > results.data.items.length && (
            <li className="label border-t border-line px-3 pt-2 pb-1">Digite para refinar · {results.data.total} produtos</li>
          )}
        </ul>
      )}
    </div>
  );
}
