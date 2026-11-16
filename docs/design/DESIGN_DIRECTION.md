# Automata Lab: design direction

This is the brief the frontend is reviewed against in the next round. It covers the art direction, the motion and type systems, page-by-page designs, and the acceptance checklist.

**What this is based on.** Screenshots of every route at 1440px dark, of the story, a DFA page and an ML page in light, and of the story, Explore, Compare, Learn and 404 at 390px, taken while the page builders were still working. At that moment the story chapters, Explore, Compare, Learn and the detail bodies still rendered "under construction", so the visual verdict rests on what was real: the tokens in `src/index.css`, the app shell, the detail-page header, and the 404 page. Component props quoted here were read from the vendored files; numeric tuning values are starting points to adjust by eye. API facts were read from the running API.

---

## 1. Art direction verdict

**The blueprint concept holds. Keep it, and make it quieter and more literal.**

Automata are drawn objects: circles, arrows, a start arrow, a double ring. A drafting sheet is the one visual world where those are the native marks rather than decoration, and it gives "calm" for free: one ink colour, hairlines, a lot of empty paper. The Apple-like quality will not come from more effects. It comes from large type, one object on stage at a time, and scroll that moves that object.

### Keep
- **Cyanotype / whiteprint pair.** Both themes already read well. The 24px grid with a 120px heavy rule is right at its current strength; do not make it louder.
- **The lamp (amber) means "the machine is here right now".** This is the best idea in the system. Protect it: amber is never used for buttons-as-decoration, chart series highlights, or headings. One exception already shipped: the primary button. Keep that as the only one.
- **Mint = accepted, coral = rejected**, and nothing else is ever mint or coral.
- **Plex Sans Condensed for display, Plex Mono for anything the machine reads or names** (strings, states, regexes, features).
- **The 404 page.** "This path leads to a trap state" is exactly the tone: a real concept used as a joke, drawn with the real component.
- **The rubber stamp verdict** (`VerdictStamp`), the tape and read head (`Tape`), and the travelling token (`AutomatonGraph`).

### Push further
- **Drafting annotations instead of UI chrome.** Dimension lines with ticks under big numbers, leader lines from a label to the thing it names, a title block in the corner of a drawing ("L7, minimized DFA, 4 states, sheet 3 of 13"), registration crosses at panel corners. These replace eyebrow labels, pills and card borders.
- **One object on stage.** Each story chapter has a single drawing that occupies at least half the viewport. Text sits beside it, never in a box around it.
- **Scale as drama.** The project's results are mostly about size and exactness (8 transitions versus 17,769 nodes; 34 of 40). Show sizes at true relative scale rather than as numbers in tiles.
- **The whiteprint theme needs the same care as the dark one.** Every WebGL background must take theme colours from `useThemeColors()` and use `lightMode` where the component has it (LetterGlitch, Aurora, RippleGrid, LightRays).

### Drop
- `Aurora`, `LightRays`, `BackgroundBeams`, `spotlight-new`, `SpotlightCard`, `StarBorder`, `ShinyText`, `shimmer-button`, `border-beam`: gradient washes and glowing borders. They belong to a different, louder site and they are the fastest way to look generated.
- `confetti`: an exact DFA is celebrated by the stamp, not by confetti.
- `sticky-scroll-reveal` and `timeline` as shipped: both are card-shaped and bring their own colours. Build the pinned chapters with GSAP directly (section 2).
- `FlipWords`, `RotatingText`, `TextType` in headlines. Headlines say one thing.
- Rows of rounded rectangles for the 10 languages, the 13 approaches, the 4 pipelines, or the insights.

### Signature moments
There are four. Everything else is supporting.

1. **The machine reads (Hero).** A real DFA and a real tape. Strings arrive, the lamp walks the tape, the token crosses transitions, the stamp lands. The visitor can type their own string within the first screen.
2. **The wall at length 20 (Results).** A slope chart for L6 on the length ruler: each pipeline has two real points, accuracy on the test split (lengths up to 20) and on the long split (21 to 40), joined by a line. A vertical dimension line between them marks "training stopped here". The four pipeline lines fall to a coin flip as they cross it; the 3-state DFA's line runs flat at 100%. The API has no per-length accuracy, so there are exactly two points per series and nothing in between.
3. **The light table (Inside the model, and every L\* detail page).** The DFA extracted from a model slides over the ground truth like tracing paper on a light table. When they are the same machine the lines register and the sheet is stamped "exact". When they are not, the one place they differ lights amber. For L8 with logistic regression that place is a single string: ε.
4. **17,769 to 8 (Results).** A field of 17,769 dots (one per random-forest tree node, drawn on a 2D canvas) fills the screen, then collapses into the 8 arrows of an average DFA drawn at the same dot size.

---

## 2. Motion language

### Principles
- **Motion shows the machine working or shows the reader where to look.** If it does neither, remove it.
- **Things are drawn, not faded.** Lines draw along their length (`pathLength` 0 to 1), states ink in from the ring outward, numbers count. Opacity-only fades are for text.
- **The lamp moves at reading speed.** A symbol step is slow enough to follow by eye.
- **Calm means few things move at once.** At most one looping animation per viewport, not counting the background.

### Easing and duration tokens
Add to `src/index.css` and use everywhere (GSAP accepts the same curves through `CustomEase` or the named equivalents shown).

| Token | Curve | GSAP name | Use |
|---|---|---|---|
| `--ease-draw` | `cubic-bezier(0.22, 1, 0.36, 1)` | `power4.out` | entrances, line drawing, text reveals |
| `--ease-move` | `cubic-bezier(0.65, 0, 0.35, 1)` | `power2.inOut` | anything travelling from A to B: token, overlay sheets, tab indicator |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | `power2.in` | exits only, always shorter than the entrance |
| stamp spring | Motion `{ type: "spring", stiffness: 520, damping: 24, mass: 0.9 }` | | `VerdictStamp` landing: scale 1.6 to 1, rotate -14deg to -6deg |
| settle spring | Motion `{ type: "spring", stiffness: 220, damping: 28 }` | | layout changes, graph nodes moving between layouts |

| Duration | Value | Use |
|---|---|---|
| micro | 120 to 160ms | hover, press, focus ring |
| ui | 220 to 300ms | tabs, selects, tooltips, row highlight |
| reveal | 600 to 800ms | headline and drawing entrances |
| stage | 900 to 1200ms | light-table registration, dot-field collapse, layout morphs |
| symbol step | 650ms default (`useTracePlayer` `stepMs`): about 420ms token travel plus 230ms dwell | trace playback; speed control offers 0.5x, 1x, 2x |

### Stagger rules
- Characters 18 to 24ms, words 40ms, list rows 60ms, graph states 70ms in BFS order from the start state.
- A stagger sequence never exceeds 600ms in total. With more than 10 items, reduce the per-item delay to fit.
- Text reveals run once. They do not replay on scroll-back.

### Scroll choreography
- **One scroll driver per section.** Either a GSAP `ScrollTrigger` timeline or Motion `useScroll`, never both on the same element. Pinned chapters use GSAP; simple parallax and progress use Motion.
- **Scrub:** `scrub: 0.6` on pinned timelines. Lenis is already configured at `duration: 1.1`; do not add a second smoothing layer.
- **Pin budget for the story page:** three pinned chapters at most (Objectives sweep, Theory, Inside the model). The hero is sticky for 150vh but not scrubbed. Everything else scrolls normally with reveal-on-enter.
- **Pin length:** 100vh of scroll per beat, 300 to 400vh per chapter, never more than 4 beats. Each beat changes exactly one thing in the drawing.
- **Snap:** `snap: { snapTo: "labels", duration: { min: 0.2, max: 0.5 }, delay: 0.1, ease: "power2.inOut" }` on the Objectives sweep only. Do not snap anywhere else.
- **Entering and leaving a pin:** the first 8% and last 8% of every pinned timeline are empty holds, so the chapter never changes at the same instant it sticks.
- **Layout stability:** pinned sections have a fixed height before data arrives (skeleton of the same size). Call `ScrollTrigger.refresh()` once after `document.fonts.ready` and once after the summary query resolves. Build every trigger inside `gsap.context()` and revert it on unmount.
- **Reveal-on-enter:** `start: "top 78%"`, `once: true`, translate at most 24px.
- **Scroll progress is a tape.** On the story page replace the generic progress bar with a thin strip fixed under the nav: one mono cell per chapter (sentence-case chapter names on hover, not numbers), the lamp sitting over the current chapter and moving with `--ease-move`. Clicking a cell scrolls there through Lenis. This is the page's navigation and its motif at once.

### Backgrounds
The CSS drafting grid (`.grid-paper`) is the default on every page and costs nothing. Canvas and WebGL backgrounds are accents with a fixed assignment:

| Where | Component | Tuning (starting values) | Notes |
|---|---|---|---|
| Hero | `Threads` | `color` from `--line-strong`, `accentColor` from `--lamp`, `lineCount` 14, `amplitude` 0.6, `speed` 0.25, `opacity` 0.35, `enableMouseInteraction` | Sits in the lower 55% behind the tape, masked to transparent at the top. Reads as strings converging on the machine. Has a `paused` prop. |
| Dataset chapter | `LetterGlitch` | `characters="01ab"`, `glitchColors` = [accept, reject, muted], `baseOpacity` 0.25, `speed` slow, `centerFade` high, `lightMode` from theme, `dpr` 1.5 | The wall of strings is the subject here, so this is content, not wallpaper. No `paused` prop: mount and unmount by IntersectionObserver. |
| Inside the model | `DotGrid` | `dotSize` 2, `gap` 26, `baseColor` from `--line`, `activeColor` from `--lamp`, `proximity` 110, `opacity` 0.5, `glow` 0, `dpr` 1.5 | Dots as membership queries. Has `paused`. |
| Closing | `RippleGrid` | `color` from `--line-strong`, `autoRipple` on at a long `rippleInterval`, `opacity` 0.4, `glow` 0, `lightMode` from theme | One slow ripple from the button. Has `paused`. |
| Explore | `animated-grid-pattern` (SVG) | `numSquares` 12, `maxOpacity` 0.12, `duration` 4 | Cells of the drafting grid light briefly. |
| Results, Compare, Learn, all detail pages, 404 | none beyond `.grid-paper` | | Charts and tools need a still page. |

Rules:
- **One canvas live at a time.** Each background is wrapped in a small `<Ambient>` helper that mounts it when its section is within 25% of the viewport and unmounts (or sets `paused`) otherwise, and pauses on `document.hidden`.
- **Intensity ceiling:** a background never exceeds 0.5 opacity, never contains pure white or the lamp colour as a fill, and is masked out behind body text (`mask-image: radial-gradient(...)` or a linear fade).
- **Below 768px:** `Threads` and `DotGrid` are replaced by `.grid-paper`. `LetterGlitch` stays at a larger `fontSize` and `dpr` 1.
- Lazy-load every canvas component with `React.lazy` so none is in the entry chunk.

### Reduced motion
`SmoothScroll` already turns Lenis off. In addition:
- Wrap every pinned timeline in `gsap.matchMedia()` under `(prefers-reduced-motion: no-preference) and (min-width: 768px)`. Outside it, each beat is rendered as a normal stacked block with its drawing in the final state.
- Backgrounds render one static frame or fall back to `.grid-paper`.
- Trace playback jumps to the end (`useTracePlayer` already does) and shows the full path highlighted plus the step list; the step-forward button still works.
- Counters show the final value. The stamp appears without the drop.
- Nothing essential is conveyed only by motion: every animated verdict also exists as text.

### Performance budget
- 60fps while scrolling the story on a mid-range laptop; no long task over 50ms during a scrub.
- Animate `transform`, `opacity` and SVG `stroke-dashoffset` only. No animated `filter: blur` on anything larger than a headline, no animated `box-shadow`.
- Canvas `dpr` capped at 1.5 (1 on mobile).
- Graphs with more than 24 states (for example the 54-state L\*·LR machine on L6): no per-state entrance stagger, no glow, token only.
- Route-level code splitting for the five pages; entry chunk carries the shell and the hero only.
- No layout shift when data arrives: every data-driven block reserves its height.

---

## 3. Typography and layout

### Type scale
All display sizes use `clamp()` so 390px and 1440px share one rule.

| Role | Family | Size / line-height | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Display (hero, chapter openers) | Plex Sans Condensed | `clamp(3rem, 8.4vw, 8.5rem)` / 0.94 | 600 | -0.02em | at most 4 words per line, `text-wrap: balance` |
| Page title (h1 on tool pages) | Plex Sans Condensed | `clamp(2.5rem, 5vw, 4.5rem)` / 1.0 | 600 | -0.015em | |
| Chapter heading (h2) | Plex Sans Condensed | `clamp(2rem, 4.2vw, 3.75rem)` / 1.04 | 600 | -0.01em | |
| Section heading (h3) | Plex Sans Condensed | 1.5rem / 1.2 | 600 | 0 | |
| Lede | Plex Sans | `clamp(1.125rem, 1.6vw, 1.375rem)` / 1.5 | 400 | 0 | colour `--ink-2` |
| Body | Plex Sans | 1rem / 1.6 (1.0625rem on story prose) | 400 | 0 | |
| Caption, axis, table header | Plex Sans | 0.8125rem / 1.4 | 500 | 0.005em | colour `--muted`; sentence case, never all caps |
| Annotation | Plex Mono | 0.75rem / 1.3 | 400 | 0 | drafting notes, title blocks, dimension labels |
| Mono inline (strings, states, regex) | Plex Mono | 0.9375em of surrounding text | 500 | 0 | |
| Tape cell | Plex Mono | existing `Tape` sizes; `lg` in hero and Try-it | 500 | | |
| Big number | Plex Sans Condensed, `.tabular` | `clamp(4rem, 11vw, 10rem)` / 0.9 | 600 | -0.03em | unit and label in caption style beside it |
| Stat number (detail header) | Plex Sans Condensed, `.tabular` | `clamp(2rem, 3.4vw, 3rem)` / 1 | 600 | -0.01em | currently about 28px: increase |

The empty string is always shown as `ε` through `showString()`, in mono.

### Layout
- **Container:** 1104px content width (what the shell uses now), 24px side padding on mobile, 12 columns with a 24px gutter that lines up with the drafting grid.
- **Prose measure:** 60 to 68 characters. Ledes 40 to 48. Display lines 14 to 22.
- **Story rhythm:** `padding-block: clamp(6rem, 16vh, 12.5rem)` between chapters. A chapter opens with its heading alone on screen before any content.
- **Tool pages:** 64 to 96px between sections; the primary instrument (input, graph, verdict) is visible without scrolling at 1440x900 and at 390x844.
- **Asymmetry over centring.** Text in columns 1 to 5, the drawing in 6 to 12, alternating by chapter. Only the hero headline and the closing are centred.
- **No boxes by default.** Group with space, a hairline (`--line`), or a title block. `Panel` is for instruments the user operates (input, player controls), not for holding paragraphs.
- **Grid band edges:** where a `.grid-paper` band ends (for example under the detail header) fade it out over 80px with a mask instead of the current hard rule.

### Staging numbers and charts
- **One number per screen.** A big number gets a dimension line under it (hairline with end ticks) carrying its label in annotation type, and a single sentence of meaning beside it.
- Count with `CountUp` (`mode="roll"` for integers, `duration` 1.2, `separator=","`, `trigger="view"`) or `number-ticker`; both must receive values from the API, with the final value rendered in the DOM for screen readers (`aria-label`).
- **Charts are drawn in.** Bars grow from the baseline with `--ease-draw` and 40ms stagger; lines draw left to right in 900ms. Axis and gridlines are present first.
- **Direct labels over legends** when there are four series or fewer. The series colours come from `PIPELINES` / `APPROACHES` in `src/lib/meta.ts` and never from literals.
- **A chart has one sentence above it that states the finding**, written as a plain claim ("Every pipeline falls to a coin flip past length 20"), not a description of the axes.

---

## 4. Page by page

### 4.1 Story page (`/`)

Shared: the chapter tape under the nav (section 2). Copy is sentence case and specific. Every number below is illustrative of the wording only; values are read from the API (section 5.1).

#### Hero: "A machine reading a tape"
- **Primary moment.** Centre stage: the minimized DFA for L7 (`(a|b)*abb`, 4 states) rendered with `AutomatonGraph` (`zoomable={false}`, `animateIn`, `maxHeight` about 360), with a `Tape size="lg"` beneath it. A queue of real strings from `sampleLabelled(dfa, 8, 42)` feeds in one at a time: the lamp walks the tape, the token crosses each transition (`activeEdge` + `tokenKey`), the final state takes the `verdict` halo, and a `VerdictStamp size="lg"` lands. Then the next string slides in from the right.
- **Headline** above, set with `SplitText` (`splitType="words"`, `duration` 0.8, `delay` 40, `ease="power4.out"`, `mask`, `trigger="load"`):
  - "Ten languages. Four classifiers. One question: what did the model actually learn?"
  - Alternative, shorter: "What machine is hiding inside the model?"
- **Lede:** "We trained classifiers to recognise regular languages, then asked each one the same thing a student is asked: draw your automaton."
- **Interaction.** A `StringInput` sits directly under the tape with the placeholder "Type a string of a and b". Typing pauses the queue and runs the visitor's string immediately, client-side through `runDfa`. A language switcher (three quiet text links: "ends with abb", "even number of 0s", "third symbol from the end is 1") morphs the graph to another language.
- **Scroll.** The stage is `position: sticky` for 150vh. As the visitor scrolls, the headline moves up and fades, the graph scales to 0.85 and settles to the right column, and the next chapter's heading rises beside it. Motion `useScroll` with `useTransform`, no pin.
- **Background.** `Threads` per the table.
- **Buttons.** "Explore the ten languages" (primary) and "See the results" (text link to `#results`). No arrows.
- **Loading.** The graph area shows the drafting grid with a dashed circle and "Drawing the machine…" in annotation type. **Error:** the stage shows a static inline SVG of the L7 machine and the line "The API is not answering, so this drawing is a still."
- **Mobile.** Headline, then tape, then graph at `rankdir="TB"` if the LR layout is wider than the screen, then input. No sticky stage. The stamp overlays the tape's right end.

#### Problem: "Two ways to know a language"
- **Primary moment.** A split drawing. Left: a 3-state machine with the caption "A rule you can read." Right: the same strings entering a grey box labelled "124 numbers about the string" and leaving as a probability gauge (`Gauge`). The same string is shown passing through both at once; both stamp "accepted".
- **Then the turn:** a second, longer string enters. The machine stamps correctly; the gauge needle wavers near 0.5.
- **Copy.** Heading: "A DFA is a rule. A classifier is a guess that is usually right." Body, about 70 words, defining regular language, DFA and classifier with `Term` tooltips.
- **Choreography.** Not pinned. Two reveal-on-enter beats; the second string is triggered at `top 40%`.
- **Mobile.** The two halves stack; the string is shown once above both.

#### Objectives: pinned horizontal sweep
- **Primary moment.** One continuous drawing that pans sideways: a long drafting sheet about 4 viewports wide showing the pipeline of the whole project as a single schematic, left to right: languages, strings, features, models, extracted machines, comparison. Each objective is a station on that line with a short heading and one sentence. A lamp token travels along the connecting wire as the visitor scrolls, so the sweep reads as one string passing through the whole project.
- **Technique.** GSAP: `pin: true`, `scrub: 0.6`, `end: () => "+=" + (track.scrollWidth - innerWidth)`, `x` tween on the track with `ease: "none"`, labels per station and the snap config from section 2. The wire is one SVG path with `stroke-dashoffset` tied to the same timeline. `animated-beam` is not needed.
- **Copy.** Station headings as verbs: "Define ten languages exactly", "Generate strings that are hard on purpose", "Describe each string with 124 generic features", "Train four kinds of model", "Ask each model for its automaton", "Measure what it costs".
- **No numbered tiles.** Stations are positions on a wire, not cards. If numbering appears at all it is the real sequence along the wire, in annotation type.
- **Mobile and reduced motion.** A vertical version of the same wire with stations stacked and the lamp following scroll down the left edge (the `tracing-beam` idea, drawn with our own SVG so colours match). No horizontal pinning below 768px.

#### Theory: "Theory in motion" (pinned, 4 beats)
- **Primary moment.** One language (L2, "ends with 01") kept on stage through four transformations, text on the left changing per beat, drawing on the right morphing:
  1. **NFA.** "Guessing is allowed." The NFA with several states lit at once (`active` as a set).
  2. **Subset construction.** "Track every guess at once." NFA states gather into labelled sets; each new DFA state is inked as its set forms (drive from the real `SubsetStep[]` of `/api/automata/L2/nfa`).
  3. **Minimization.** "Merge what nothing can tell apart." States tint by Moore block (`groups` from `moore_rounds`), then same-coloured states slide together.
  4. **Equivalence.** "Two drawings, one language." The result is laid over the hand-built DFA on the light table and registers.
- **Technique.** GSAP pin, 400vh, `scrub: 0.6`. Beat changes set React state from `onUpdate` using label ranges (not a tween per node); the graph's own Motion transitions animate the change over `stage` duration, so scrubbing backwards also works.
- **Copy.** Left column per beat: a 3 to 6 word heading and at most two sentences. A small "Open this construction" text link to the matching detail page tab.
- **Mobile and reduced motion.** Four stacked blocks, each with its drawing in the finished state and a "Play" button that runs that step's animation in place.

#### Dataset: "70,470 strings, chosen to be awkward"
- **Primary moment.** `LetterGlitch` fills the section with 0, 1, a, b in mint, coral and muted ink. Over it, the row count rolls up large (`CountUp mode="roll"`), with a dimension line: "labelled strings, lengths 0 to 40".
- **Second beat.** The wall clears from the centre (`centerFade`) and a length ruler appears, 0 to 40, with the split drawn on it: train, validation and test up to `meta.max_train_length`, and the "long" split beyond it, hatched. This ruler is deliberately the same axis reused in signature moment 2.
- **Third beat.** How strings were generated, as a single stacked horizontal bar per language built from `dataset.strategies` (exhaustive short strings, DFA-uniform positives and negatives, near-miss edits, structured runs), directly labelled. One sentence about the near-miss strings, with any count read from `dataset.strategies` (`hard_negative_edit`, `near_miss_positive_edit`) for the selected language: "Many of the negatives are one edit away from a positive."
- **Interaction.** `LetterGlitch` draws random characters and cannot show real strings, and the dataset endpoint returns no sample rows. So the real strings are a DOM layer on top: about 12 strings from `sampleLabelled(dfa, 12, 42)` for the selected language, set in mono, drifting slowly upward, each with a mint or coral mark. The canvas keeps `interactive` for the cursor glow only.
- **Copy.** Heading: "70,470 strings, chosen to be awkward". Sub: "Every string up to length 10, then samples built to sit right on each language's boundary."
- **Mobile.** Number, ruler, then bars for the selected language only, with a language `Segmented` control.

#### Results (`id="results"`): four findings, one per screen
No card grid of insights. Each finding is a full-height block with one claim, one drawing, one number.

1. **"L\* found the exact machine inside 34 of 40 models."** A 10 by 4 matrix drawn as a registration sheet: rows are languages, columns the four pipelines, each cell a small glyph: a registered double ring for `equivalent_to_truth`, an offset double ring for not. Cells ink in with 30ms stagger. The six misses are amber-outlined and each is a link. Hovering a cell shows states, queries and stop reason. The cell for L8·LR carries the note "differs on one string: ε". The header number counts up from the same data the matrix is drawn from.
2. **"Past length 20, binary multiples of 3 become a coin flip."** Signature moment 2. A slope chart for L6 (custom SVG, or `LineChart` with two x positions): one line per pipeline from `ml.L6[p].test.accuracy` to `ml.L6[p].long.accuracy`, plus the DFA's flat line. The training boundary is a vertical dimension line between the two positions labelled "models never saw strings longer than this". Lines draw left to right in 900ms; end points are directly labelled with their values. The API exposes only `val`, `test` and `long` metrics, so do not draw intermediate points. A second, smaller sentence covers L10 honestly: "L10 fools the linear model outright, and the trees lose it on long strings."
3. **"A forest of 17,769 nodes, or eight arrows."** Signature moment 4. A 2D canvas draws one dot per node (count from the API), laid out in a loose grid that fills the block. On scroll past 50% the dots fly to the positions of an average DFA's transitions and the rest fade; the caption changes from the forest's size and microseconds per string to the DFA's. Timing: `stage` duration, `--ease-move`, dots staggered by distance from centre. Beside it, the DFA-vs-ML table from `summary.comparison_overall`, set as a ruled schedule (hairlines, no zebra, tabular numerals, the "exact on N of 10" column drawn as ten small rings).
4. **"From labelled strings alone, EDSM rebuilt all ten."** `LineChart` from `summary.sample_efficiency`: accuracy against training fraction for RPNI and EDSM, with a language selector. One sentence on RPNI's two misses, with the shortest wrong string taken from `stats.counterexample_to_truth` of `/api/automata/:lang/rpni` (not parsed from the insight prose).

- **Choreography.** Not pinned. Each block reveals on enter; charts draw once.
- **Mobile.** The matrix keeps 10 by 4 (it fits at 390px with 28px cells); the comparison schedule becomes a two-line-per-row list; the dot field uses a reduced sample with the true count stated.

#### Inside the model: "Ask the model thousands of questions" (pinned, 4 beats)
- **Primary moment.** Signature moment 3, built up over four beats with a real case chosen by a selector (default L6 · Random forest; also L8 · Logistic regression).
  1. **"Ask."** Membership queries as dots: the `DotGrid` background plus a foreground stream of short strings flying to a box labelled with the model name and returning mint or coral. The counter shows `membership_queries` from the API.
  2. **"Write it down."** The observation table as a ledger. Rows are access strings, columns are distinguishing suffixes, each cell a mint or coral mark, filled row by row with a pen-stroke reveal (cell `scaleX` 0 to 1 from the left, 20ms stagger). The API does not expose table cells. Build the ledger honestly on the client: rows are the shortest access string of each state of the extracted DFA (BFS), columns are the suffixes from the minimized DFA's `distinguishing_suffixes`, and each cell is `runDfa(extracted, row + column)`. Caption it "the rows that ended up mattering" and show the real totals beside it from `learning.table_shape` (S, S·Σ, E) and the real `learning.rounds` as a short list: round, states, counterexample.
  3. **"Guess, and get corrected."** Each round's hypothesis DFA size from `learning.rounds` shown as a growing machine, with the counterexample string arriving on a tape and being rejected by the hypothesis.
  4. **"Hold it up to the truth."** The light table. The extracted machine, in lamp ink on a translucent sheet offset by 10px and rotated 1.5deg, slides onto the ground-truth drawing and registers (`stage` duration, `--ease-move`). The stamp lands: "exact".
- **The honest footnotes, as part of the design.** For L6 · Random forest: "The forest scores 76% on the test set. The machine L\* drew from its answers on short strings is still the exact 3-state DFA." Wording must follow the data: this run has `equivalent_to_truth: true` but `converged: false` (`stop_reason: "max_states"`), so say "matches the ground truth", never "converged". For L8 · Logistic regression: the sheets register everywhere except the start state, which stays amber, with the note "This model and the truth disagree about exactly one string: ε."
- **Technique.** GSAP pin, 400vh, `scrub: 0.6`, beats set by label ranges as in Theory.
- **Mobile and reduced motion.** Four stacked blocks; the light table plays on a button press and ends in the registered state.

#### Closing
- Centred. Heading: "Now try to fool one." Sub: "Pick a language, type a string, and watch thirteen approaches answer."
- A single `StringInput` that submits to `/compare` with the string in the query, wrapped in `Magnet` (`magnetStrength` low, `padding` 60) for the button only. `RippleGrid` behind, one ripple on submit.
- Three text links below: "Explore the languages", "Compare all thirteen", "Teach a machine yourself".

### 4.2 Explore (`/explore`)

This is the page most at risk of becoming 10 cards and then 13 cards. It must not.

- **Structure: an index and a drawing sheet.** Left (columns 1 to 5): the ten languages as a typographic list. Each row is the language name in h3 condensed type with its regex in mono underneath and its id in annotation type at the left margin. Hairlines between rows. Right (columns 6 to 12, `position: sticky; top: 96px`): one drawing sheet with a title block, showing the minimized DFA of the highlighted language with a sample string looping through it slowly.
- **Primary moment.** Moving through the list changes the machine on the sheet: the previous drawing un-inks (200ms), the new one draws in BFS order (`animateIn`). Hover highlights on desktop; arrow keys move the highlight; Enter or click selects.
- **After selection: the schedule of approaches.** The list compresses to a single line (selected language plus "change"), and below the sheet a ruled schedule appears with three labelled groups from `FAMILIES`: ground truth, learned automata, ML pipelines. Each of the 13 approaches is a row, not a card: series colour tick, name, a two-bar micro chart (test accuracy and long accuracy on a shared 0 to 100 axis), size with unit, and for automata a registered or offset ring for exactness. Rows ink in with 60ms stagger. The whole row is the link to `/explore/:lang/:approach`; on hover the row's hairline turns to the series colour and the sheet above previews that approach (the automaton, or for ML a small pipeline diagram).
- **Live stats.** All values from `useApproaches(language)`; `keepPreviousData` is already set, so switching languages cross-fades numbers instead of flashing skeletons.
- **Copy.** Title: "Ten languages, thirteen ways to decide them". Lede: "Pick a language to see its machine. Then pick who you want to ask." Group notes come from `FAMILIES[...].description`.
- **States.** Loading: the list shows ten hairline rows with `Skeleton` text; the sheet shows the dashed-circle placeholder. Error: `ErrorState` with retry in place of the list, sheet stays empty. An approach with no artefact is shown as a muted row with the reason, not hidden.
- **Mobile.** The sheet becomes a 240px-high sticky strip at the top; the language list scrolls beneath it and highlights the row nearest the strip's lower edge (IntersectionObserver). The schedule rows become two lines: name and exactness on the first, micro bars and size on the second.
- **Deep link.** `/explore?lang=L6` opens with that language selected.

### 4.3 Automaton detail (`/explore/:lang/dfa`, `min_dfa`, `lstar_*`, `rpni`, `edsm`)

- **Header fixes (seen in screenshots).** Increase stat numbers to the stat scale. Replace the two stacked native selects with a compact "L7 · minimized DFA" switcher (keep native `select` semantics, restyle, place inline with the breadcrumb). Fade the grid band's lower edge. The family pill becomes part of the title block.
- **Primary moment: the Try-it instrument is first, not last.** Directly under the header: `StringInput`, `Tape size="lg"`, the graph, the player controls, and the stamp, all visible at 1440x900. Typing a string and pressing Enter plays the trace from `/api/classify`: lamp over the tape cell, token along `activeEdge`, the visited path left faintly inked behind it, the final state haloed by `verdict`, then the stamp. A step list beside the graph (state, symbol, next state) highlights in sync and is clickable to scrub.
- **Keyboard.** Space plays or pauses, left and right step, Home restarts. Show the hints with `Kbd`.
- **Below, as tabs or long scroll (builder's choice, tabs must be linkable by hash):**
  - **Transition table.** Ruled, mono, start row marked with the arrow glyph, accepting rows with a double ring. Hovering a cell highlights that edge in the graph and vice versa.
  - **Minimization (`min_dfa`).** A Moore-round player over `minimization.moore_rounds`: the "before" DFA tinted by block (`groups` prop), a round counter, and a sentence per round naming the split ("Round 2: C and D part ways, because reading 1 sends them to different blocks"). Final beat: same-coloured states slide together into the "after" machine (settle spring). Before and after counts as a dimension line: "7 states to 3".
  - **Myhill–Nerode table.** From `distinguishing_suffixes`: a triangular table of state pairs, each cell the shortest suffix that tells them apart, in mono. Hovering a cell runs that suffix from both states in the graph, one token mint and one coral.
  - **How it was learned (`lstar_*`, `rpni`, `edsm`).** The ledger and round list as in the story's Inside-the-model chapter, using this record's `learning` data (queries, rounds, counterexamples, table shape, or PTA states, merges and promotions for the passive learners).
  - **Against the ground truth: the light table.** The comparison target is always the language's `min_dfa`. Two `AutomatonGraph` instances are stacked in one frame. Compute a state bijection client-side by BFS from both start states in alphabet order, matching on transitions only, and compare accepting sets afterwards. There are three outcomes:
    1. **Same transitions, same accepting states.** Rename the candidate's states through the bijection so both get the identical dagre layout, render the candidate in lamp ink on top (wrap it in a div that overrides `--ink-2` and `--ink` with the lamp colour; the graph strokes read those variables), start it offset and rotated, and animate to register. Stamp "exact".
    2. **Same transitions, different accepting states.** Register the sheets the same way, then leave the states whose acceptance differs ringed in amber with a note. This is the L8 · Logistic regression case if its structure matches: the start state differs, and the note reads "disagrees on ε".
    3. **No bijection** (different sizes or structure, for example the 54-state machine). Do not overlay. Show the two side by side with the shortest disagreeing string from `stats.counterexample_to_truth` on a shared tape, run through both at once with `runDfa`, and stop at the step where the verdicts or paths diverge.

    Check `counterexample_to_truth` with `!= null`: for L8·LR it is the empty string, which is falsy.
  - **Metrics.** `ConfusionMatrix` for test and long, plus fidelity to the source model for L\* machines.
- **Status wording.** Badge text is derived from two independent fields: `equivalent_to_truth` gives "matches ground truth" or "differs from ground truth"; `converged` and `stop_reason` give "L\* converged" or "stopped at the state budget" (the budget figure comes from `summary.meta.extraction_config.max_states`). Never merge them.
- **Large machines** (20 to 54 states): `radius` auto-shrinks already; default to zoom-to-fit, show a note "54 states: this is a model that never settled on a rule", disable entrance stagger.
- **States.** Loading: header skeleton plus the dashed-circle sheet. Error: `ErrorState` with retry. Invalid symbol in input: the offending character is underlined coral in the input with "L7 only uses a and b", and nothing is sent.
- **Mobile.** Order: input, tape (sticky under the nav while playing), graph (`rankdir="TB"` when wider than tall), stamp, controls as a bottom bar. Tables scroll horizontally inside `data-lenis-prevent` containers with the first column frozen.

### 4.4 NFA detail (`/explore/:lang/nfa`)

Same frame as 4.3, with three differences.

- **Primary moment: many lamps.** The trace lights a set of states at once (`active` as a set from `NfaTrace`). Between symbols, ε-moves are shown as a distinct half-step: thin dashed tokens travel the ε-edges first (180ms), then the symbol tokens move. The tape head does not advance during the ε half-step, which is the whole point.
- **A "live set" readout** beside the graph in mono: `{q0, q2, q5}` updating per step, with the caption "the machine is in all of these at once".
- **Subset construction player.** From `SubsetStep[]`. Left: the NFA. Right: the DFA being built. Each step: the source set glows on the left, the `move` set lights, the ε-`closure` spreads, and on the right either a new state inks in (`new: true`) or an arrow draws to an existing one. A worklist under the DFA shows discovered sets as mono chips, the current one under the lamp. Controls as in Try-it. The caption for each step is generated from the step: "From {A,B} on 1: move gives {C}, closure adds {D}. That set is new."
- **Honest zeros.** Some NFAs have no ε-moves (L7 shows 0). In that case the ε half-step is skipped and the stat reads "no ε-moves in this one", not a bare 0.
- **Mobile.** NFA and DFA stack; the active one for the current sub-step scrolls into view.

### 4.5 ML pipeline detail (`/explore/:lang/ml_*`)

- **Primary moment: the string becomes numbers.** Try-it first again. The typed string sits on a tape; on run, it travels along a horizontal pipeline diagram: tape, "124 features", model, gauge, stamp. Use `animated-beam` for the three connecting wires (`gradientStartColor` and `gradientStopColor` both the pipeline's series colour, `pathColor` from `--line`, `duration` 2.2, `curvature` 0), firing once per run rather than looping.
  - At the features stage, the active features from `ml.active_features` pop out as mono chips with values ("count(1) mod 3 = 2", "ends_with(01) = 1"), at most 8 visible with "and 23 more".
  - At the model stage the view depends on the pipeline: logistic regression shows `drivers` as a diverging `HBars` (push toward accept in mint, toward reject in coral) summing to the `logit`; decision tree shows the `decision_path` as a lit route down a small tree, one comparison per step; random forest shows `tree_votes` as a field of small marks tipping mint or coral (a ballot, not a pie); stacking shows the three base probabilities feeding `meta_weights`.
  - The `Gauge` needle swings to `probability` with the settle spring, then the stamp lands. If the model is wrong (`correct: false`), a second smaller stamp reads "ground truth: rejected" in ink, and one sentence explains.
- **Header.** For L6 the header should make the failure legible at a glance: test accuracy and long accuracy as two numbers joined by a dimension line labelled with the drop.
- **Sections below.**
  - **What it learned.** Coefficients (`HBars`, top 15, direct-labelled), the tree (collapsible, top 4 levels drawn), or importances with their `std` whiskers.
  - **How it generalises.** Test against long accuracy; `ConfusionMatrix` for both; tuning table from `tuning` as a ruled schedule with the chosen row marked by the lamp.
  - **The automaton inside.** A compact light table for `extracted_dfa` against the truth, the exactness status with the correct wording, and a link to the full L\* page. For L6 · Random forest this block carries the page's best sentence: "76% accurate, and yet the machine L\* drew from it is exactly right."
  - **Cost.** Model size as a dot field at small scale beside the DFA's transitions, and microseconds per string for both.
- **States.** Loading: pipeline diagram drawn in outline with a slow dash animation on the wires. Error: `ErrorState`. Strings longer than `max_train_length`: an inline annotation on the tape, "longer than anything this model trained on".
- **Mobile.** The pipeline runs vertically; feature chips wrap to two rows; the model-stage view is full width.

### 4.6 Compare (`/compare`)

- **Primary moment: thirteen verdicts landing.** One input, one language selector, one tape. On run, the string is shown once at the top and thirteen lanes resolve beneath it in family order. Each lane is a ruled row: series tick, approach name, a short track along which a token runs, and a small verdict mark at the end. Automata lanes resolve in sequence at 60ms intervals; ML lanes show their probability as the token's stopping point on the track (0 on the left, 1 on the right, the 0.5 threshold drawn as a tick), which makes "barely accepted" visible. The ground-truth lane is pinned first and drawn slightly heavier.
- **Agreement, summarised as a sentence, not a badge wall:** "All thirteen agree: accepted." or "Eleven agree with the ground truth. Two do not." The dissenting lanes get a coral hairline and expand in place to show `explanation` from the API; the others dim to 60%.
- **Disagreement finder.** A text button, "Find a string they disagree on", tries the known counterexamples for that language (from `stats.counterexample_to_truth` of the non-equivalent machines) and long random strings via `randomString`, and loads the first one where `disagreements` is non-empty. For L6 this nearly always succeeds and is the most persuasive interaction on the site.
- **Length note.** When `longer_than_training` is true: an annotation on the tape, "longer than any training string, so the models are extrapolating".
- **Drill-in.** Clicking a lane opens that approach's detail page with the string carried in the query so its Try-it plays immediately.
- **Copy.** Title: "One string, thirteen answers". Placeholder: "Type a string, or press the dice for a hard one".
- **States.** Empty: lanes drawn with empty tracks and the line "Nothing has been read yet." Loading: tokens idle at the start of each track with a slow pulse; no spinner. Error: `ErrorState` above the lanes, lanes keep the previous result dimmed. Unavailable approach (`available: false`): muted lane with its reason.
- **Mobile.** Lanes become compact two-line rows (name and mark on the first line, track on the second); the input and language selector are sticky at the top; expanded explanations push content rather than overlaying.

### 4.7 Learn (`/learn`)

- **Primary moment: your samples become a machine.** Two columns. Left: the sample editor as two ruled lists, "should accept" and "should reject", strings in mono, with presets from `presets.ts` as text links ("ends with 01", "even number of a"). Right: the drawing sheet.
- **The build animation.** On "Learn", the sheet first draws the prefix tree of the samples (computed client-side from the strings: a trie, accepting leaves mint, rejecting coral, undecided hollow), holds for 400ms, then states merge into the learned DFA returned by `/api/learn` (settle spring, merged states sliding together), and the title block fills in: learner, states, merges. If the API returns learning stats (PTA states, merges, promotions), show them as the dimension line "23 states to 3".
- **Then test it.** A `StringInput` and tape appear under the sheet; traces play on the learned machine via `/api/learn/:session/classify`. A `Segmented` control switches the learner (RPNI, EDSM, and the ML learners); with an ML learner the right column shows the gauge and feature chips instead of a graph, and the same string can be run on both to compare.
- **Teaching moments built into the states.**
  - Contradictory samples (same string in both lists): caught client-side, the string is underlined in both lists with "This string is in both lists."
  - Too few samples: the learned machine is shown anyway, with the note "With only 4 examples, this is the simplest machine that fits. Add a string it gets wrong." and a one-click "Add as counterexample" on any test result the user marks as wrong.
  - Single-state result: "Every sample was accepted, so the simplest machine accepts everything."
- **Copy.** Title: "Teach a machine from examples". Lede: "Give it strings it should accept and strings it should reject. It will draw the smallest machine it can justify."
- **States.** Empty: the sheet shows a single dashed start state and "No samples yet. Try a preset." Loading: the trie stays on screen with the lamp scanning nodes. Error: `ErrorState` under the editor; samples are never cleared by an error.
- **Mobile.** Editor first, with the two lists as tabs; a sticky "Learn" button; the sheet opens full-width beneath and scrolls into view on completion.

### 4.8 Not found

Keep as built. Three small changes:
- At 390px the two buttons wrap their labels onto two lines. Stack them full-width below 420px.
- Let the trap state's self-loop carry a slow token forever (it is a trap), paused under reduced motion.
- If the bad path looks like a known pattern (`/explore/L11/...`), say so: "There is no L11. There are ten languages." with a link to Explore.

### 4.9 Shared component changes these designs need

Several designs above need small additions to shared components. One builder owns these (the foundation owner), so the seven page builders do not each patch them locally. All additions are optional props; existing call sites keep working.

| Component | Today | Addition | Needed by |
|---|---|---|---|
| `AutomatonGraph` | one `activeEdge`, one token | `activeEdges?: { from: string; to: string; kind?: "symbol" \| "epsilon"; color?: string }[]` with one token per edge; ε tokens thinner and dashed | NFA trace and ε half-step, subset player, Myhill–Nerode two-token hover |
| `AutomatonGraph` | no memory of the path | `visited?: { from: string; to: string }[]` drawn at 35% lamp opacity under the live edge | Try-it traces, hero |
| `AutomatonGraph` | no way to flag a state | `marked?: string[]` giving those states an amber dashed outer ring | light table outcome 2, minimization "about to merge" |
| `AutomatonGraph` | ink colours | none needed: strokes read `--ink-2`, `--ink`, `--lamp`, `--state-fill`, so a wrapper `style` override recolours a whole sheet | light table overlay |
| `VerdictStamp` | `accepted` only, text fixed | `label?: string` and `tone?: "accept" \| "reject" \| "ink"` | "exact", "ground truth: rejected" |
| `Tape` | no annotations | `note?: { at: number; text: string }` rendered as a leader line above a cell | "longer than any training string" |
| new `LightTable` | | `truth: DfaPayload`, `candidate: DfaPayload`, `counterexample?: string \| null`; implements the three outcomes in 4.3 | story, automaton detail, ML detail |
| new `Ambient` | | wraps a lazy background: mounts within 25% of the viewport, sets `paused` where supported, pauses on `document.hidden`, renders `.grid-paper` under reduced motion or below 768px | every canvas background |
| new `DimensionLine` | | hairline with end ticks and an annotation label | big numbers, before and after counts |

If the foundation owner cannot add the multi-token prop in time, the fallback is a second absolutely-positioned `AutomatonGraph` for the second token, with its states and edges made transparent through the same variable override.

---

## 5. Supervision checklist

### 5.1 Data correctness: where each headline number comes from
No headline figure may be typed into a component. Headlines written in this brief with numbers in them ("70,470 strings…", "34 of 40", "17,769 nodes", "124 features") are templates: the number is interpolated from the API and formatted with `int()` / `pct()` from `src/lib/meta.ts`. Review will grep for the literals. The shell footer currently hard-codes 70,470; it should read it from `useSummary()` too.

| Shown as | Source |
|---|---|
| 70,470 strings | `GET /api/dataset` `total_rows` (also `summary.meta.dataset_rows`) |
| 124 features | `summary.meta.feature_count_binary` |
| Longest training string, 20 | `summary.meta.max_train_length` |
| Split sizes | `summary.meta.split_sizes` |
| 34 of 40 | count of `summary.automata[L]["lstar_*"].equivalent_to_truth === true` over 10 languages and 4 pipelines |
| 31 converged, 3 at budget | of the 34 matching records: `converged === true` gives 31; the other 3 have `stop_reason: "max_states"` (currently L6 RF, L10 RF, L10 stack). A raw count of `converged` over all 40 gives 32, because L8 · LR converges without matching |
| The six that differ | same records. Currently L6 (LR, DT, stack), L8 (LR), L10 (LR, DT) |
| EDSM 10, RPNI 8 | `summary.summary.comparison_overall[].exact_languages` |
| L6 on long strings, about 0.53 | `summary.ml.L6[pipeline].long.accuracy` (0.528 to 0.544) |
| L6 forest, 76% | `summary.ml.L6.rf.test.accuracy` |
| 17,769 nodes | `comparison_overall` row "Random Forest" `mean_size` |
| About 8 transitions | `comparison_overall` row "Ground-truth DFA" `mean_size` (7.8) |
| About 0.5 µs per string | `comparison_overall[].inference_us_per_string` |
| L8 · LR differs on ε | `GET /api/automata/L8/lstar_lr` `stats.counterexample_to_truth === ""` |
| Per-language stats on Explore and detail headers | `GET /api/approaches?language=`, `GET /api/automata/...`, `GET /api/models/...` |

Copy constraints that follow from the data:
- "Every pipeline fails on L6" is true. "Only L6 fails" is false: L10 defeats logistic regression (0.59 test) and the tree models drop to 0.58 to 0.80 on long strings.
- "Matches the ground truth" and "converged" are different fields. L6 · Random forest matches without converging; L8 · Logistic regression converges without matching.
- The 17,769 figure is a mean across languages. On the L6 forest page the real size is that model's own `complexity.total_nodes`.

### 5.2 Checks that apply to every page
Run from `frontend/`:

1. `node e2e/shot.mjs <url> <out> 1440 900 dark 2500 1`, the same in `light`, and `390 844 dark`: the `errors` array is empty in all three.
2. No horizontal page scroll at 390px (full-page shot is exactly 390 wide; no clipped text).
3. `grep -rnE "34 ?/ ?40|34 of 40|70,?470|17,?769|89,?008|124 (generic )?features" src/pages src/components/layout` returns nothing outside comments.
4. `grep -rnE "uppercase|tracking-widest" src/pages` returns nothing (no all-caps eyebrow labels). The rubber stamp's capitals inside `VerdictStamp` are the one exemption: it is a stamp.
5. `grep -rn "→" src/pages` returns nothing inside buttons or links.
6. `grep -rnE "Aurora|LightRays|BackgroundBeams|background-beams|spotlight-new|SpotlightCard|StarBorder|ShinyText|shimmer-button|border-beam|confetti|FlipWords|flip-words|RotatingText|TextType|sticky-scroll-reveal|aceternity/timeline" src/pages` returns nothing.
7. `npx tsc --noEmit` and the production build pass.
8. With `prefers-reduced-motion` emulated: no pinned sections, no looping animation, all content present and in final state.
9. Keyboard: every interactive element reachable in a sensible order with a visible lamp focus ring; no focus trap in the mobile menu.
10. Both themes: text contrast at least 4.5:1 for body and captions; accept and reject are never distinguished by colour alone (stamp text, ring glyph, or a label is always present).
11. Loading, empty and error states exist and are designed (stop the API mentally: each page must still explain itself).
12. At most one canvas background mounted at any scroll position (check the DOM for `canvas` count while scrolling).

### 5.3 Acceptance criteria by page

**Story**
- Hero: a machine is reading a string within 1.5s of load; typing a valid string runs it within 100ms without a network call; the stamp matches `runDfa`.
- Chapter tape present, reflects the current chapter, and navigates on click and by keyboard.
- Exactly three pinned chapters; each releases cleanly with no jump when scrolling in both directions; scrubbing backwards restores earlier beats.
- Each Results finding has one claim sentence, one drawing and one number, and no grid of insight cards exists anywhere on the page.
- The 10 by 4 matrix shows exactly the six non-matching cells listed in 5.1 and its count equals the headline number, both computed from the same array.
- The L6 chart contains only real data points.
- The light table registers for a matching pair, and for L8 · LR shows the ε disagreement (start state ringed amber when the transition structures match, the divergence run otherwise).
- Under 768px: no horizontal pinning; every chapter readable as a vertical sequence.
- Scrolling the full page at 1440px holds 60fps on the review machine and never shows two canvases at once.

**Explore**
- No card grid. Languages are a typographic list; approaches are schedule rows.
- Highlighting a language redraws the sheet within 300ms; arrow keys work.
- All 13 approaches appear in three family groups with values from `useApproaches`; switching language does not flash skeletons.
- Each row links to the correct detail URL; `?lang=` deep link works.
- At 390px the sticky sheet strip and list are both usable.

**Automaton detail**
- Try-it instrument visible without scrolling at 1440x900 and 390x844.
- Tape head position, lit state, lit edge and step-list row always agree, at every speed and when stepping backwards.
- Verdict equals `accepted` from `/api/classify`; ε input works and is displayed as ε.
- Invalid symbols are rejected client-side with a specific message.
- Minimization player: block colours match `moore_rounds` per round; before and after counts match `states_before` and `states_after`.
- Status badges use `equivalent_to_truth` and `converged` independently.
- Light table: overlays only when the bijection exists; otherwise shows the divergence run. The ε counterexample case renders.
- 54-state machine (L6 · L\*·LR) opens without jank, zoom-to-fit by default.
- Space, arrows and Home control playback; controls have accessible names.

**NFA detail**
- Multiple states lit simultaneously per `NfaTrace`; ε half-steps do not advance the tape head.
- Subset player follows `SubsetStep[]` exactly: `new: true` steps add a state, others add only an edge; the final DFA's state count equals the header stat.
- Languages with no ε-moves show the dedicated wording.

**ML detail**
- The pipeline animation fires once per run, in order: tape, features, model, gauge, stamp.
- Feature chips show real `active_features` names and values; the model-stage view matches the pipeline type.
- Gauge value equals `probability`; verdict equals `accepted`; a wrong prediction shows the ground truth as well.
- Coefficient, tree and importance views use real data with direct labels.
- Extracted-DFA block uses the correct status wording and links to the L\* page.
- Header shows test and long accuracy from the API for the selected language (L6 forest shows the drop).

**Compare**
- All 13 lanes present in family order, ground truth first.
- Summary sentence counts match `results` and `disagreements`.
- ML tokens stop at `probability` on the track; the 0.5 tick is visible.
- "Find a string they disagree on" returns a real disagreement for L6 within 3 seconds or says honestly that it found none.
- `longer_than_training` annotation appears when true.
- Clicking a lane carries the string to the detail page.
- Usable at 390px with sticky input.

**Learn**
- A preset learns and draws a machine in under 2 seconds with the trie-to-DFA transition (or its reduced-motion equivalent).
- Contradictory and empty sample sets are handled client-side with specific messages.
- Test strings run against the returned session; verdicts match the API.
- Learner switch works for all five learners; ML learners show gauge and features.
- An API error never clears the user's samples.

**Not found**
- Buttons do not wrap at 390px; both themes render; links work.

### 5.4 Top 10 failure modes to watch for
1. **Cards came back.** Ten language tiles, thirteen approach tiles, four pipeline tiles, seven insight tiles. Any of these is a rejection.
2. **Hard-coded headline numbers** that happen to match today's results, or hero copy that contradicts the API ("only L6 fails", "L\* converged on 34").
3. **Empty-string bugs.** `if (counterexample)` hiding the L8 ε case; ε rendered as a blank cell; a required-field validation that blocks submitting the empty string.
4. **Pin breakage.** ScrollTrigger measured before fonts or data arrived, producing jumps, overlapping chapters, or dead scroll; triggers not reverted on route change so Explore inherits a pinned spacer.
5. **Two scroll systems fighting.** GSAP pin plus Motion `useScroll` on the same section, or native smooth scrolling re-enabled alongside Lenis.
6. **Background soup.** More than one canvas alive, a background behind body text at full strength, amber or white used as a wash, or the light theme left with dark-theme canvas colours.
7. **Lamp inflation.** Amber used for headings, borders, chart highlights and hovers until it no longer means "the read head is here".
8. **Trace desync.** Tape head, token, lit state and step list drifting apart at 2x speed, on step-back, or when a new string is submitted mid-run.
9. **Mobile as an afterthought.** Horizontal pin left on at 390px, graphs clipped, tables overflowing the page, hover-only interactions with no tap equivalent.
10. **Motion that only decorates.** Looping text effects in headlines, replaying reveals on every scroll-back, staggered entrances longer than 600ms, and no reduced-motion path.
