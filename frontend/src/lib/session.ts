import { useSyncExternalStore } from "react";
import type { Role, User } from "../api/types";

// O login fica no sessionStorage: some ao fechar a aba, nunca vai para o localStorage.
const KEY = "stockflow.session";
const listeners = new Set<() => void>();

type Session = { token: string; user: User };

let cached: { raw: string | null; value: Session | null } = { raw: null, value: null };

function read(): Session | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    /* modo privado sem storage */
  }
  // useSyncExternalStore exige o mesmo objeto enquanto nada mudou
  if (raw !== cached.raw) cached = { raw, value: raw ? (JSON.parse(raw) as Session) : null };
  return cached.value;
}

export function getToken(): string | null {
  return read()?.token ?? null;
}

export function setSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
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

let expired = false;

/** Marca que a sessão caiu por token vencido (a tela de login mostra o aviso uma vez). */
export function markExpired() {
  expired = true;
}

export function takeExpired() {
  const value = expired;
  expired = false;
  return value;
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, read);
}

/** Mesma matriz da API (app/api/deps.py): quem pode o quê. A API é quem garante; aqui só escondemos. */
export type Permission = "operate" | "admin";

const ALLOWED: Record<Permission, Role[]> = {
  operate: ["ADMIN", "OPERADOR"],
  admin: ["ADMIN"],
};

export function can(user: User | null | undefined, permission: Permission) {
  return !!user && ALLOWED[permission].includes(user.role);
}

export function useCan(permission: Permission) {
  return can(useSession()?.user, permission);
}

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "Administrador", OPERADOR: "Operador", LEITOR: "Leitor" };
