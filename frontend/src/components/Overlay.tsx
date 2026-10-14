import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** <dialog> nativo: foco preso, Esc fecha, clique fora fecha. O conteúdo só existe enquanto aberto
 *  (assim os formulários começam sempre do zero). */
function useNativeDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

function Header({ title, eyebrow, onClose }: { title: string; eyebrow?: string; onClose: () => void }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
      <div>
        {eyebrow && <p className="label mb-1">{eyebrow}</p>}
        <h2 className="font-display text-2xl leading-none">{title}</h2>
      </div>
      <button type="button" aria-label="Fechar" onClick={onClose} className="-mr-1 p-1 text-ink-3 hover:text-ink">
        <X className="size-5" />
      </button>
    </header>
  );
}

/** Painel lateral (cadastros). */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  const ref = useNativeDialog(open);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-[min(30rem,100vw)] max-w-none border-l border-line-strong bg-panel p-0 text-ink backdrop:bg-ink/40 open:animate-[drawer-in_0.25s_cubic-bezier(0.2,0.7,0.2,1)]"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="hazard h-1.5 shrink-0" />
          <Header title={title} eyebrow={eyebrow} onClose={onClose} />
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Janela central (ações rápidas). */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  const ref = useNativeDialog(open);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[4px] border border-line-strong bg-panel p-0 text-ink shadow-[6px_6px_0_var(--ink)] backdrop:bg-ink/50"
    >
      {open && (
        <>
          <div className="hazard h-1.5" />
          <Header title={title} eyebrow={eyebrow} onClose={onClose} />
          {children}
        </>
      )}
    </dialog>
  );
}

export function OverlayBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5", className)}>{children}</div>;
}

export function OverlayFooter({ children }: { children: ReactNode }) {
  return <footer className="flex shrink-0 justify-end gap-2 border-t border-line bg-sunken/50 px-6 py-3.5">{children}</footer>;
}
