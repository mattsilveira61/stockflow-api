import { KeyRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, request } from "../api/client";
import { setApiKey } from "../lib/session";
import { useToast } from "./Toast";
import { Button } from "./ui";

/** Pede a X-API-Key e confere em POST /auth/verify antes de guardar. */
export function LoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const key = value.trim();
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      await request("POST", "/auth/verify", { headers: { "X-API-Key": key } });
      setApiKey(key);
      setValue("");
      toast.success("Acesso liberado. Agora você pode criar e alterar dados.");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Chave inválida. Confira e tente de novo." : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="login-title"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-[4px] border border-line-strong bg-panel p-0 text-ink shadow-[6px_6px_0_var(--ink)] backdrop:bg-ink/50"
    >
      <form onSubmit={submit} className="p-6">
        <div className="hazard -mx-6 -mt-6 mb-5 h-1.5" />
        <KeyRound className="mb-3 size-6 text-signal" />
        <h2 id="login-title" className="font-display text-3xl">
          Entrar
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Informe a chave de acesso (<span className="num text-xs">API_KEY</span> do arquivo <span className="num text-xs">.env</span>) para
          criar e alterar dados. Sem ela, o painel funciona em modo leitura.
        </p>
        <label className="label mt-5 mb-1.5 block" htmlFor="api-key">
          Chave de acesso
        </label>
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="num h-10 w-full rounded-[3px] border border-line-strong bg-paper px-3 text-sm outline-none focus:border-ink"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Continuar só leitura
          </Button>
          <Button type="submit" loading={loading} disabled={!value.trim()}>
            Entrar
          </Button>
        </div>
      </form>
    </dialog>
  );
}
