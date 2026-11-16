import { useEffect, useState } from "react";
import { NavLink, useLocation, useOutlet } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpen, Menu, Moon, Sun, X } from "lucide-react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useSummary } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useLenis } from "./SmoothScroll";
import { Logo } from "./Logo";

const LINKS = [
  { to: "/", label: "Story", end: true },
  { to: "/explore", label: "Explore" },
  { to: "/compare", label: "Compare" },
  { to: "/learn", label: "Learn" },
];

export function apiDocsUrl(): string {
  if (typeof window !== "undefined" && ["5173", "4173"].includes(window.location.port)) return "http://127.0.0.1:8000/docs";
  return "/docs";
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to the light whiteprint theme" : "Switch to the dark blueprint theme"}
      title={dark ? "Whiteprint (light)" : "Blueprint (dark)"}
      className="grid h-9 w-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn("rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors", isActive ? "bg-panel-2 text-ink" : "text-ink-2 hover:text-ink");
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
      <nav
        aria-label="Main"
        className="pointer-events-auto flex w-full max-w-5xl items-center gap-2 rounded-full border border-line bg-[color:var(--bg)]/70 py-1.5 pl-3 pr-1.5 shadow-[var(--shadow)] backdrop-blur-xl"
      >
        <NavLink to="/" className="mr-auto flex items-center gap-2 rounded-full pr-2 text-ink" aria-label="Automata Lab home">
          <Logo className="h-7 w-7" />
          <span className="font-display text-[17px] font-semibold tracking-tight">Automata Lab</span>
        </NavLink>
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
          <a href={apiDocsUrl()} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-2 hover:text-ink">
            <BookOpen size={15} aria-hidden /> API
          </a>
        </div>
        <ThemeToggle />
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-panel-2 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="pointer-events-auto absolute inset-x-4 top-16 rounded-2xl border border-line bg-panel p-2 shadow-[var(--shadow)] md:hidden"
          >
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => cn("block rounded-xl px-4 py-3 text-base", isActive ? "bg-panel-2 text-ink" : "text-ink-2")}>
                {l.label}
              </NavLink>
            ))}
            <a href={apiDocsUrl()} target="_blank" rel="noreferrer" className="block rounded-xl px-4 py-3 text-base text-ink-2">
              API documentation
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function Footer() {
  const { data: summary } = useSummary();
  return (
    <footer className="relative z-10 border-t border-line bg-bg">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 text-sm text-ink-2 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-ink">
            <Logo className="h-6 w-6" />
            <span className="font-display text-base font-semibold">Automata Lab</span>
          </div>
          <p className="max-w-md text-muted">
            Problem 1: Intelligent Automata Learning and Regular Language Classification. Ten regular languages,{" "}
            {summary ? `${summary.meta.dataset_rows.toLocaleString("en-US")} labelled strings` : "a labelled dataset of strings"}, four classifiers and the
            automata hiding inside them. Everything is seeded with {summary?.meta.seed ?? 42} and reproducible from the notebooks.
          </p>
        </div>
        <div className="space-y-2">
          <p className="font-medium text-ink">Explore</p>
          <ul className="space-y-1.5">
            {LINKS.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} className="hover:text-ink">
                  {l.label}
                </NavLink>
              </li>
            ))}
            <li>
              <a href={apiDocsUrl()} target="_blank" rel="noreferrer" className="hover:text-ink">
                API documentation
              </a>
            </li>
          </ul>
        </div>
        <div className="space-y-2">
          <p className="font-medium text-ink">Made with</p>
          <p className="text-muted">
            FastAPI, scikit-learn, React, Motion, GSAP and Lenis. Interface pieces from React Bits, Magic UI, Aceternity UI and Kokonut UI. Type set in IBM
            Plex.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function AppShell() {
  const location = useLocation();
  const outlet = useOutlet();
  const lenis = useLenis();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (location.hash) return;
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 450);
    return () => window.clearTimeout(t);
  }, [location.pathname, lenis, location.hash]);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-lamp focus:px-4 focus:py-2 focus:text-black">
        Skip to content
      </a>
      <Nav />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          id="main"
          key={location.pathname}
          className="relative flex-1"
          initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.28 }}
        >
          {outlet}
        </motion.main>
      </AnimatePresence>
      <Footer />
    </div>
  );
}
