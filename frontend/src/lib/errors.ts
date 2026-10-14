import { ApiError } from "../api/client";

// Mensagens de validação do Pydantic (em inglês) → português. `$1` recebe o número capturado.
const PYDANTIC_PT: [RegExp, string][] = [
  [/^Field required$/, "Campo obrigatório"],
  [/greater than or equal to (\S+)/, "Deve ser maior ou igual a $1"],
  [/greater than (\S+)/, "Deve ser maior que $1"],
  [/less than or equal to (\S+)/, "Deve ser no máximo $1"],
  [/at least 1 character/, "Campo obrigatório"],
  [/valid email/, "E-mail inválido"],
  [/valid integer/, "Informe um número inteiro"],
  [/valid decimal|valid number/, "Informe um número válido"],
  [/no more than 2 decimal places/, "Use no máximo 2 casas decimais"],
];

function translate(message: string) {
  for (const [pattern, pt] of PYDANTIC_PT) {
    const match = message.match(pattern);
    if (match) return pt.replace("$1", match[1] ?? "");
  }
  return message;
}

/**
 * Converte o erro da API em mensagens por campo (para mostrar embaixo de cada input)
 * e uma mensagem geral. `codeToField` liga códigos de negócio a um campo, ex.: SKU_TAKEN → sku.
 */
export function formErrors(err: unknown, codeToField: Record<string, string> = {}) {
  const fields: Record<string, string> = {};
  if (!(err instanceof ApiError)) return { fields, general: (err as Error)?.message ?? "Erro inesperado" };
  for (const d of err.details ?? []) if (d.field) fields[d.field] = translate(d.message);
  const field = codeToField[err.code];
  if (field) fields[field] = err.message;
  const general = Object.keys(fields).length ? null : err.message;
  return { fields, general };
}

/** "12,50" ou "12.5" → "12.50"; texto inválido → null. */
export function parseMoney(input: string): string | null {
  const normalized = input.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized).toFixed(2);
}

export function parseIntStrict(input: string): number | null {
  return /^\d+$/.test(input.trim()) ? Number(input.trim()) : null;
}
