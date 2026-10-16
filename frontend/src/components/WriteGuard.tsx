import type { ReactElement } from "react";
import { cloneElement } from "react";
import { useCan, type Permission } from "../lib/session";

const REASON: Record<Permission, string> = {
  operate: "Seu perfil só consulta. Peça ao administrador um acesso de operador.",
  admin: "Só o administrador altera o catálogo.",
};

/** Desabilita o botão filho quando o perfil não pode a ação, e explica o porquê no tooltip. */
export function WriteGuard({
  need = "operate",
  children,
}: {
  need?: Permission;
  children: ReactElement<{ disabled?: boolean; title?: string }>;
}) {
  const allowed = useCan(need);
  if (allowed) return children;
  return (
    <span title={REASON[need]} className="inline-flex">
      {cloneElement(children, { disabled: true })}
    </span>
  );
}
