import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);
const STORAGE_KEY = "toc-theme";

function readStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* storage unavailable (private mode, previews) */
  }
  return "dark"; // the blueprint is the primary look
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);
  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export interface ThemeColors {
  bg: string;
  panel: string;
  ink: string;
  ink2: string;
  muted: string;
  lamp: string;
  accept: string;
  reject: string;
  line: string;
}

const FALLBACK: Record<Theme, ThemeColors> = {
  dark: { bg: "#0a1a2f", panel: "#0f2540", ink: "#eaf3fb", ink2: "#a9c6e2", muted: "#7896b3", lamp: "#ffc857", accept: "#57e3b9", reject: "#ff8b7b", line: "#9cc3e6" },
  light: { bg: "#f3f7fb", panel: "#ffffff", ink: "#0b2742", ink2: "#33536f", muted: "#5f7891", lamp: "#b56a00", accept: "#0b8a64", reject: "#c2412d", line: "#33536f" },
};

/** Token values as hex strings, for canvases / WebGL backgrounds that cannot read CSS variables. */
export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  return FALLBACK[theme];
}
