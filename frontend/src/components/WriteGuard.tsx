import type { ReactElement } from "react";
import { cloneElement } from "react";
import { useCanWrite } from "../lib/session";

/** Em modo leitura, desabilita o botão filho e explica o porquê no tooltip. */
export function WriteGuard({ children }: { children: ReactElement<{ disabled?: boolean; title?: string }> }) {
  const canWrite = useCanWrite();
  if (canWrite) return children;
  return (
    <span title="Modo leitura: clique em Entrar e informe a chave para alterar dados" className="inline-flex">
      {cloneElement(children, { disabled: true })}
    </span>
  );
}
