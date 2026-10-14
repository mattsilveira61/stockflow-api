import { useSyncExternalStore } from "react";

const KEY = "stockflow.theme";
const listeners = new Set<() => void>();

function isDark() {
  return document.documentElement.classList.contains("dark");
}

export function toggleTheme() {
  const dark = !isDark();
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(KEY, dark ? "dark" : "light");
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  listeners.forEach((fn) => fn());
}

export function useDarkMode() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    isDark,
  );
}
