import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { FileUp, Upload } from "lucide-react";
import { useState } from "react";
import { ApiError, csvExportUrl, uploadCsv } from "../api/client";
import { useInvalidate } from "../api/hooks";
import { FormError } from "./form";
import { Modal, OverlayBody, OverlayFooter } from "./Overlay";
import { useToast } from "./Toast";
import { Button } from "./ui";

type Result = { created: number; updated: number; unchanged: number; dry_run: boolean };
type LineError = { line: number; field: string; message: string };

/**
 * Importação em dois passos: primeiro a API confere o arquivo sem gravar (dry_run) e mostra o que vai mudar;
 * só depois de confirmar o mesmo arquivo é enviado de verdade. Uma linha ruim faz a API recusar tudo.
 */
export function ProductImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Importar produtos" eyebrow="Planilha CSV">
      {open && <ImportForm onDone={onClose} />}
    </Modal>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [general, setGeneral] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<LineError[]>([]);
  const invalidate = useInvalidate();
  const toast = useToast();

  function pick(f: File | null) {
    setFile(f);
    setPreview(null);
    setGeneral(null);
    setLineErrors([]);
    if (f) check.mutate(f);
  }

  function showError(err: unknown) {
    if (err instanceof ApiError) {
      setGeneral(err.message);
      setLineErrors((err.details as LineError[] | undefined) ?? []);
    } else {
      setGeneral("Não foi possível enviar o arquivo.");
    }
  }

  const check = useMutation({
    mutationFn: (f: File) => uploadCsv<Result>("/products/import", f, { dry_run: true }),
    onSuccess: setPreview,
    onError: showError,
  });

  const save = useMutation({
    mutationFn: () => uploadCsv<Result>("/products/import", file!),
    onSuccess: async (r) => {
      await invalidate(["products"], ["product"], ["dashboard"], ["low-stock"]);
      toast.success(`Importação concluída: ${r.created} criado(s), ${r.updated} atualizado(s).`);
      onDone();
    },
    onError: showError,
  });

  const nothingToDo = preview && preview.created + preview.updated === 0;

  return (
    <>
      <OverlayBody>
        <p className="text-sm text-ink-2">
          Colunas obrigatórias: <code className="num text-xs">sku; nome; categoria; preco</code>. Opcionais:{" "}
          <code className="num text-xs">estoque_minimo; ativo; descricao</code>. SKU que já existe é atualizado; o saldo de estoque
          nunca muda pela planilha.
        </p>
        <a href={csvExportUrl("/products/export.csv")} className="text-sm text-signal-ink underline" download>
          Baixar a planilha atual como modelo
        </a>

        <label
          className={clsx(
            "flex cursor-pointer items-center gap-3 rounded-[3px] border border-dashed border-line-strong px-4 py-4 text-sm hover:border-ink",
            file && "border-solid",
          )}
        >
          <FileUp className="size-5 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate">{file ? file.name : "Escolher arquivo .csv (até 1 MB)"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Arquivo CSV"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </label>

        {check.isPending && <p className="text-sm text-ink-3">Conferindo o arquivo…</p>}
        <FormError message={general} />
        {lineErrors.length > 0 && (
          <ul aria-label="Problemas encontrados" className="max-h-48 divide-y divide-line overflow-auto rounded-[3px] border border-danger/40 text-sm">
            {lineErrors.map((e, i) => (
              <li key={i} className="flex gap-3 px-3 py-1.5">
                <span className="num w-16 shrink-0 text-ink-3">linha {e.line}</span>
                <span className="num w-28 shrink-0 text-ink-2">{e.field}</span>
                <span className="text-danger">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
        {preview && (
          <dl className="grid grid-cols-3 gap-2 text-center" aria-label="Prévia da importação">
            {[
              ["Novos", preview.created],
              ["Atualizados", preview.updated],
              ["Sem mudança", preview.unchanged],
            ].map(([label, n]) => (
              <div key={label} className="rounded-[3px] bg-sunken px-2 py-3">
                <dd className="num text-2xl font-medium">{n}</dd>
                <dt className="label">{label}</dt>
              </div>
            ))}
          </dl>
        )}
      </OverlayBody>
      <OverlayFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button icon={Upload} onClick={() => save.mutate()} loading={save.isPending} disabled={!preview || !!nothingToDo}>
          {nothingToDo ? "Nada para importar" : "Importar"}
        </Button>
      </OverlayFooter>
    </>
  );
}
