import { Link } from "react-router";
import { GitCompareArrows, PencilRuler } from "lucide-react";
import ClickSpark from "@/components/reactbits/ClickSpark";
import Magnet from "@/components/reactbits/Magnet";
import StarBorder from "@/components/reactbits/StarBorder";
import { useLanguages } from "@/lib/api";
import { PIPELINES } from "@/lib/meta";
import { useTheme, useThemeColors } from "@/lib/theme";
import { words } from "../parts/b/bands";
import { LampRays } from "../parts/b/backgrounds";
import { Reveal } from "../parts/b/ui";

/**
 * The way out of the story and into the tools: amber light falls on one closing line, a
 * primary path to the explorer (StarBorder + Magnet + ClickSpark) and two quieter paths.
 */
export function ClosingCta() {
  const c = useThemeColors();
  const { theme } = useTheme();
  const languages = useLanguages();
  const count = languages.data?.length;
  return (
    <section aria-labelledby="cta-title" className="relative isolate overflow-hidden border-t border-line">
      <LampRays />
      <div
        aria-hidden
        className="grid-paper pointer-events-none absolute inset-0 opacity-80 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_45%,black_20%,transparent_75%)]"
      />
      <div className="relative mx-auto flex min-h-[90svh] max-w-6xl flex-col items-center justify-center px-6 py-32 text-center">
        <Reveal>
          <h2 id="cta-title" className="mx-auto max-w-4xl font-display text-[clamp(2.75rem,8vw,6.75rem)] font-semibold leading-[0.95] tracking-[-0.02em] text-ink">
            Now run the machines yourself.
          </h2>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-2 md:text-xl">
            Pick any of the {count ? `${words(count)} ` : ""}languages, type a string and watch the ground-truth DFA, the NFA, the extracted automata and all{" "}
            {words(PIPELINES.length)} models decide, one symbol at a time.
          </p>
        </Reveal>
        <Reveal delay={0.15} className="mt-12 flex flex-col items-center gap-10">
          <div className="inline-block">
            <ClickSpark sparkColor={[c.lamp, c.accept, c.ink]} sparkCount={12} sparkRadius={46} sparkSize={12} duration={520} shape="line" glow={0.6}>
              <Magnet padding={70} magnetStrength={3.2} maxOffset={14} wrapperClassName="inline-block">
                <StarBorder
                  as={Link}
                  to="/explore"
                  radius={999}
                  thickness={1.5}
                  duration={4.5}
                  stars={2}
                  glow={0.9}
                  sparkle
                  theme={theme}
                  color={c.lamp}
                  trailColor={c.lamp}
                  backgroundColor="var(--panel)"
                  textColor="var(--ink)"
                  borderColor="var(--line-strong)"
                  className="px-9 py-4 font-display text-xl font-semibold md:px-11 md:py-5 md:text-2xl"
                >
                  Explore the models
                </StarBorder>
              </Magnet>
            </ClickSpark>
          </div>
          <nav aria-label="Other ways in" className="flex flex-col items-center gap-4 sm:flex-row sm:gap-10">
            <Link to="/compare" className="group inline-flex items-center gap-2.5 rounded-full px-1 text-[17px] text-ink-2 transition-colors hover:text-ink">
              <GitCompareArrows size={18} className="text-lamp transition-transform group-hover:-rotate-6" aria-hidden />
              <span className="border-b border-transparent group-hover:border-[color:var(--lamp)]">Compare every approach on one string</span>
            </Link>
            <Link to="/learn" className="group inline-flex items-center gap-2.5 rounded-full px-1 text-[17px] text-ink-2 transition-colors hover:text-ink">
              <PencilRuler size={18} className="text-lamp transition-transform group-hover:-rotate-6" aria-hidden />
              <span className="border-b border-transparent group-hover:border-[color:var(--lamp)]">Teach a machine your own language</span>
            </Link>
          </nav>
        </Reveal>
      </div>
    </section>
  );
}
