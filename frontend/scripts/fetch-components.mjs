// Download UI components from their open shadcn-style registries (the same components
// that 21st.dev lists, fetched from their authors' public registries) into a staging
// folder, together with a lockfile of sources and npm dependencies.
//
//   node scripts/fetch-components.mjs <outDir>
//
// The staged files are reviewed, then copied into src/components/<vendor>/ and adapted.
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const REACT_BITS = [
  "Threads", "DotGrid", "LetterGlitch", "Squares", "Aurora", "RippleGrid", "LightRays",
  "SplitText", "BlurText", "DecryptedText", "ScrollReveal", "CountUp", "ShinyText",
  "RotatingText", "TextType", "SpotlightCard", "Magnet", "ClickSpark", "StarBorder",
];
const MAGIC_UI = ["animated-beam", "number-ticker", "border-beam", "marquee", "scroll-progress", "shimmer-button", "confetti", "hyper-text", "animated-grid-pattern"];
const ACETERNITY = ["sticky-scroll-reveal", "tracing-beam", "spotlight-new", "container-scroll-animation", "background-beams", "timeline", "text-generate-effect", "flip-words"];
const KOKONUT = ["background-paths"];

const sources = [
  ...REACT_BITS.map((n) => ({ vendor: "reactbits", name: n, url: `https://reactbits.dev/r/${n}-TS-TW.json` })),
  ...MAGIC_UI.map((n) => ({ vendor: "magicui", name: n, url: `https://magicui.design/r/${n}.json` })),
  ...ACETERNITY.map((n) => ({ vendor: "aceternity", name: n, url: `https://ui.aceternity.com/registry/${n}.json` })),
  ...KOKONUT.map((n) => ({ vendor: "kokonutui", name: n, url: `https://kokonutui.com/r/${n}.json` })),
];

const out = process.argv[2] ?? "staging";
const lock = [];
for (const src of sources) {
  try {
    const res = await fetch(src.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const item = await res.json();
    const files = [];
    for (const f of item.files ?? []) {
      if (!f.content) continue;
      const dir = join(out, src.vendor);
      await mkdir(dir, { recursive: true });
      const target = join(dir, basename(f.path));
      await writeFile(target, f.content, "utf8");
      files.push(basename(f.path));
    }
    lock.push({ ...src, files, dependencies: item.dependencies ?? [], registryDependencies: item.registryDependencies ?? [] });
    console.log(`ok   ${src.vendor}/${src.name}  ${files.join(", ")}  deps: ${(item.dependencies ?? []).join(" ")}`);
  } catch (err) {
    lock.push({ ...src, error: String(err) });
    console.log(`FAIL ${src.vendor}/${src.name}  ${err}`);
  }
}
await writeFile(join(out, "components.lock.json"), JSON.stringify(lock, null, 2), "utf8");
