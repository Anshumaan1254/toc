import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { StringInput } from "@/components/ui/primitives";
import { useSummary } from "@/lib/api";
import { words } from "../parts/b/bands";
import { Reveal } from "../parts/b/ui";

/** The language the closing string is run against on the compare page. */
const CLOSING_LANGUAGE = "L6";

/**
 * The page's last interaction: type a string and send it to every approach at once on the
 * compare page. Drafting paper only, no light effects; the three tools follow as plain links.
 */
export function ClosingCta() {
  const summary = useSummary();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const count = summary.data?.approaches.length;
  const countWords = count ? words(count) : "all";
  const run = () => navigate(`/compare?lang=${CLOSING_LANGUAGE}&s=${encodeURIComponent(value)}`);
  return (
    <section aria-labelledby="cta-title" className="relative isolate overflow-hidden border-t border-line">
      <div
        aria-hidden
        className="grid-paper pointer-events-none absolute inset-0 opacity-80 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_45%,black_20%,transparent_75%)]"
      />
      <div className="relative mx-auto flex min-h-[90svh] max-w-6xl flex-col items-center justify-center px-4 py-28 text-center sm:px-6 md:py-32">
        <Reveal>
          <h2 id="cta-title" className="mx-auto max-w-4xl font-display text-[clamp(2.75rem,8vw,6.75rem)] font-semibold leading-[0.95] tracking-[-0.02em] text-ink">
            Now try to fool one.
          </h2>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-2 md:text-xl">
            Pick a language, type a string, and watch {count ? `${countWords} ` : "every one of the "}approaches answer.
          </p>
        </Reveal>
        <Reveal delay={0.12} className="mt-12 w-full max-w-xl text-left">
          <StringInput
            value={value}
            onChange={setValue}
            onSubmit={run}
            alphabet={["0", "1"]}
            placeholder="Type a string of 0 and 1"
            submitLabel={count ? `Run all ${countWords}` : "Run them all"}
            label={`A string for ${CLOSING_LANGUAGE}`}
          />
        </Reveal>
        <Reveal delay={0.2}>
          <nav aria-label="Other ways in" className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:gap-10">
            <TextLink to="/explore">Explore the languages</TextLink>
            <TextLink to="/compare">Compare all {countWords}</TextLink>
            <TextLink to="/learn">Teach a machine yourself</TextLink>
          </nav>
        </Reveal>
      </div>
    </section>
  );
}

function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="text-[17px] text-ink-2 underline decoration-[color:var(--line-strong)] decoration-1 underline-offset-[6px] transition-colors hover:text-ink hover:decoration-[color:var(--ink-2)]"
    >
      {children}
    </Link>
  );
}
