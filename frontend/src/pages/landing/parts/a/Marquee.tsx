/*
 * Adapted from Magic UI "Marquee" (https://magicui.design/docs/components/marquee, MIT licence),
 * the copy in src/components/magicui/marquee.tsx. Changes for this page:
 *  - ships its own namespaced keyframes (the global stylesheet has no `animate-marquee`);
 *  - repeated copies are aria-hidden so screen readers read the content once;
 *  - pauses while off screen (animation-play-state) and on hover / focus;
 *  - reduced motion: no animation, the first copy simply sits in place.
 */
import { useRef, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from "react";
import { useInView } from "motion/react";
import { cn } from "@/lib/utils";

const CSS = `
@keyframes landing-a-marquee-x { from { transform: translateX(0); } to { transform: translateX(calc(-100% - var(--gap))); } }
.landing-a-marquee-track { animation: landing-a-marquee-x var(--duration) linear infinite; }
.landing-a-marquee[data-reverse="true"] .landing-a-marquee-track { animation-direction: reverse; }
.landing-a-marquee[data-paused="true"] .landing-a-marquee-track,
.landing-a-marquee[data-hover-pause="true"]:hover .landing-a-marquee-track,
.landing-a-marquee[data-hover-pause="true"]:focus-within .landing-a-marquee-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .landing-a-marquee-track { animation: none; } }
`;

interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
  reverse?: boolean;
  pauseOnHover?: boolean;
  /** Seconds per full loop. */
  duration?: number;
  /** Gap between items, any CSS length. */
  gap?: string;
  repeat?: number;
  children: ReactNode;
}

export function Marquee({ className, reverse = false, pauseOnHover = true, duration = 40, gap = "0.75rem", repeat = 3, children, style, ...props }: MarqueeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "100px 0px 100px 0px" });
  return (
    <div
      ref={ref}
      {...props}
      data-reverse={reverse}
      data-paused={!inView}
      data-hover-pause={pauseOnHover}
      className={cn("landing-a-marquee flex overflow-hidden", className)}
      style={{ ...style, "--duration": `${duration}s`, "--gap": gap, gap } as CSSProperties}
    >
      {/* React 19 hoists and de-duplicates <style href precedence>. */}
      <style href="landing-a-marquee" precedence="default">
        {CSS}
      </style>
      {Array.from({ length: repeat }, (_, i) => (
        <div key={i} className="landing-a-marquee-track flex shrink-0 justify-around" style={{ gap }} aria-hidden={i > 0 || undefined}>
          {children}
        </div>
      ))}
    </div>
  );
}
