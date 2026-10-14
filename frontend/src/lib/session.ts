import { useSyncExternalStore } from "react";

// A chave fica no sessionStorage: some ao fechar a aba, nunca vai para o localStorage.
const KEY = "stockflow.apiKey";
const listeners = new Set<() => void>();

export function getApiKey(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setApiKey(value: string | null) {
  try {
    if (value) sessionStorage.setItem(KEY, value);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* modo privado: segue só em memória */
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** `true` quando há chave: os botões de criar/editar ficam liberados. */
export function useCanWrite() {
  return useSyncExternalStore(subscribe, () => getApiKey() !== null);
}
