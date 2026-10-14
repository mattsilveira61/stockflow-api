import clsx from "clsx";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { integer } from "../lib/format";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={clsx("label border-b border-line px-4 py-2.5 text-left font-medium whitespace-nowrap first:pl-5 last:pr-5", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx("border-b border-line px-4 py-2.5 align-middle first:pl-5 last:pr-5", className)}>{children}</td>;
}

/** Cabeçalho clicável: alterna entre `campo` (crescente) e `-campo` (decrescente). */
export function SortTh({
  field,
  sort,
  onSort,
  children,
  className,
}: {
  field: string;
  sort: string;
  onSort: (sort: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const active = sort.replace(/^-/, "") === field;
  const desc = sort.startsWith("-");
  const Icon = !active ? ArrowUpDown : desc ? ArrowDown : ArrowUp;
  return (
    <Th className={className}>
      <button
        type="button"
        onClick={() => onSort(active && !desc ? `-${field}` : field)}
        aria-label={`Ordenar por ${typeof children === "string" ? children.toLowerCase() : field}`}
        className={clsx("inline-flex items-center gap-1 uppercase hover:text-ink", active && "!text-ink")}
      >
        {children}
        <Icon className={clsx("size-3", !active && "opacity-40")} />
      </button>
    </Th>
  );
}

export function Pagination({
  page,
  pages,
  total,
  onPage,
  noun = ["registro", "registros"],
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
  noun?: [string, string];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <p className="label">
        {integer(total)} {total === 1 ? noun[0] : noun[1]}
        {pages > 1 && ` · página ${page} de ${pages}`}
      </p>
      {pages > 1 && (
        <div className="flex gap-1">
          <PageButton label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-4" />
          </PageButton>
          <PageButton label="Próxima página" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight className="size-4" />
          </PageButton>
        </div>
      )}
    </div>
  );
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-[3px] border border-line-strong text-ink-2 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
