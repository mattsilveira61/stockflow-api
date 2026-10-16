import { Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import { downloadCsv } from "../api/client";
import { useToast } from "./Toast";
import { Button } from "./ui";

type Params = Parameters<typeof downloadCsv>[2];

/** Baixa um CSV da API com o token do usuário (um link simples não mandaria o login). */
export function ExportButton({
  path,
  filename,
  params,
  variant = "ghost",
  children = "Exportar",
}: {
  path: string;
  filename: string;
  params?: Params;
  variant?: "ghost" | "link";
  children?: ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function run() {
    setLoading(true);
    try {
      await downloadCsv(path, filename, params);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (variant === "link") {
    return (
      <button type="button" onClick={run} disabled={loading} className="text-left text-sm text-signal-ink underline disabled:opacity-50">
        {children}
      </button>
    );
  }
  return (
    <Button variant="ghost" icon={Download} onClick={run} loading={loading}>
      {children}
    </Button>
  );
}
