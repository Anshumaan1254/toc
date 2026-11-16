# Automata Lab: Intelligent Automata Learning and Regular Language Classification

**Problem 1.** Learn a finite-state machine from labelled strings, use it to classify unseen strings, and compare it with
machine-learning classifiers and with classical DFA-based recognition.

This repository contains the whole project:
- a from-scratch automata toolkit (DFA, ε-NFA, regex → Thompson, subset construction, Hopcroft / Moore / Brzozowski
  minimization, product-construction equivalence, Myhill–Nerode, L\*, RPNI, EDSM);
- a 70,470-string dataset over ten regular languages;
- four scikit-learn pipelines (Logistic Regression, Decision Tree, Random Forest, Stacking), and the DFA each of them has
  implicitly learned, extracted with Angluin's L\*;
- two executed notebooks;
- a FastAPI backend;
- an interactive website (React) that explains it all.

![The story page](docs/screenshots/story-dark.png)

---

## Quick start

Requirements: Python 3.10+ with the packages in `requirements.txt` (developed in the conda env `ai`, Python 3.11), and
Node.js 18+.

```bash
# 1. Python packages (skip if your environment already has them)
python -m pip install -r requirements.txt

# 2. Run everything: API on :8000 + website on :5173 (installs the frontend packages on first run)
python run_all.py
```

On the development machine conda is not on `PATH`, so the commands are run with the environment's interpreter directly:
`D:\CondaEnvs\ai\python.exe run_all.py`.

| command | what it does |
|---|---|
| `python run_all.py` | starts the API (http://127.0.0.1:8000, docs at `/docs`) and the website dev server (http://127.0.0.1:5173), opens the browser |
| `python run_all.py --prod` | builds the website and serves website + API from one server on :8000 |
| `python run_all.py --pipeline` | regenerates everything: executes notebook 01 (dataset) and notebook 02 (EDA, models, automata, metrics) |
| `python run_all.py --check` | every gate: pytest, frontend type-check, production build, end-to-end test in a real browser |
| `python -m pytest -q` | the test suite only |

`make setup / data / models / test / build / run / prod / check` provide the same commands on Unix shells.

All artifacts (dataset, executed notebooks, models, automata JSON, metrics, figures) are committed, so the website works
straight after cloning. If they are missing, `run_all.py` regenerates them first.

---

## Project structure

```text
toc/
├── notebooks/
│   ├── 01_generate_dataset.ipynb        # Stage 1 – languages, automata checks, dataset (executed, with outputs)
│   └── 02_eda_models_automata.ipynb     # Stage 2 – split, EDA, pipelines, L*/RPNI/EDSM, comparison (generated + executed)
├── src/
│   ├── automata/   dfa.py · nfa.py (subset construction) · regex.py (Thompson) · minimize.py (Hopcroft, Moore,
│   │               Brzozowski, Myhill–Nerode) · equivalence.py (product construction) · learners.py (L*, RPNI, EDSM)
│   │               · languages.py (L1–L10) · export.py (automaton JSON)
│   ├── ml/         features.py (generic string features) · pipelines.py · evaluate.py · explain.py · distill.py (L* on a model)
│   ├── data/       generate.py (dataset) · splits.py (leak-free split) · io.py (safe CSV / strict JSON)
│   ├── experiment.py   per-language orchestration shared by notebook 02 and the backend
│   ├── envcheck.py     first-cell guard: right interpreter, pinned versions
│   ├── viz.py          validated chart palette for the notebooks
│   └── paths.py
├── data/            dataset.csv (+ .parquet), dataset_report.{json,md}, splits/splits.csv
├── artifacts/       models/*.joblib · automata/*.json · explain/*.json · figures/*.png · metrics.json
├── backend/app/     FastAPI: main.py (routes) · services.py · store.py · schemas.py
├── frontend/        React + Vite website (src/pages, src/components, e2e/)
├── scripts/         build_notebook_0{1,2}.py · run_notebook.py · make_readme_tables.py
├── tests/           pytest: automata, minimization, equivalence, learners, features/ML, dataset, API
├── run_all.py · Makefile · requirements.txt · pyproject.toml
```

---

## The languages

Each language has **four independent definitions** that are cross-checked on every dataset row:
1. a hand-built ground-truth DFA (the only source of labels);
2. an NFA (natural, or Thompson's ε-NFA of the regex);
3. a regular expression (also run through Python's `re`);
4. a plain Python predicate.

The minimal state counts were derived by hand (total DFA, trap state counted) and are asserted, never computed from the
algorithms' own output.

L1–L8 are the eight required languages. Two were added:
- **L9** (third symbol from the end is 1) shows the subset construction's exponential blow-up: its 4-state NFA needs
  2³ = 8 DFA states.
- **L10** ((#a − #b) ≡ 0 mod 3) is a counting language whose membership depends on an interaction of two residues.

---

## How it works

### Stage 1 · Dataset (`notebooks/01_generate_dataset.ipynb`)
* **Exhaustive** short strings: every string of length 0–10, including ε (2,047 per language).
* **Sampled buckets**, each exactly 50/50: 11–15 and 16–20 (the *main* pool) plus 21–30 and 31–40 (the *long* pool,
  never used for training). They mix five strategies:
  * *exact DFA-guided uniform samples*, drawn from the accepted or rejected strings of a given length with a counting
    DP over the DFA;
  * *hard negatives*: 1–2 substitute, insert or delete edits of a positive that fall outside the language;
  * *near-miss positives*: the mirror image;
  * *structured strings*: runs, repeats and palindromes.
* Labels come only from the ground-truth DFA. They are asserted equal to the NFA simulation, the subset-construction
  DFA, Thompson's ε-NFA, the Python predicate and Python's `re` on all 70,470 rows. Equivalence is also proven for the
  whole language with the product construction.
* There are no duplicates per language. The pools are disjoint by construction, and the CSV is reloaded with a strict
  loader (empty strings and digit-strings stay text) and compared cell by cell.

### Stage 2 · Models and automata (`notebooks/02_eda_models_automata.ipynb`)
* **Split.** The main pool is split 70/15/15, stratified by language × label × length bucket. A leakage-check cell
  asserts that train, validation, test and long are pairwise disjoint, and that every long string is longer than every
  training string.
* **Features** (`src/ml/features.py`). 124 generic, language-agnostic features for a binary alphabet:
  * length, per-symbol counts and ratios;
  * 1–4-gram counts;
  * one-hot symbols at the first and last 6 positions;
  * prefix/suffix patterns;
  * longest runs and the number of symbol changes;
  * counts and length modulo 2, 3 and 4.

  Nothing is tuned to a target language. The transformer is vectorized (the L\* extraction sends hundreds of thousands
  of queries through it) and is checked against a slow reference implementation.
* **Pipelines.** P1 LR (scaled, saga, L1/L2), P2 Decision Tree, P3 Random Forest, P4 Stacking (LR + DT + RF base
  learners, logistic meta-learner on 5-fold out-of-fold probabilities). Every grid point is fit on train and scored on
  validation. The winner is **not** refit on train+validation, so validation scores stay honest, and the test and long
  sets are only touched for the final report.
* **Ground-truth automata.** NFA → subset construction → Hopcroft (Moore and Brzozowski agree), each step proven
  equivalent with the product construction.
* **Automata extracted from every pipeline (L\*).** The trained pipeline is the membership oracle; queries are batched
  and cached. The equivalence query is approximated by testing the hypothesis against the model on:
  * every string up to length 10;
  * the training strings (the model's answers only, never the labels);
  * 2,000 fresh random strings of length 0–40 per query.

  The shortest disagreement becomes the counterexample, and its prefixes are added to S (Angluin's rule) before the
  table is made closed and consistent again. A classifier's language need not be regular, so each run is bounded
  (64 states, 400k queries, 90 s, 60 rounds). When a round would exceed the state budget, the last complete hypothesis
  is returned with `converged = false`. Accuracy (against the truth) and **fidelity** (against the model) are reported
  separately.
* **Passive learning.** RPNI and blue-fringe EDSM on the labelled training strings, implemented on a union-find
  prefix-tree acceptor with an undo log.

---

## Key results

<!-- RESULTS:START -->
### Languages

| id | language | alphabet | regular expression | minimal DFA | NFA | subset DFA |
|---|---|---|---|---|---|---|
| L1 | Even number of 0s | {0,1} | `(1*01*0)*1*` | 2 | 14 (ε) | 5 |
| L2 | Ends with "01" | {0,1} | `(0\|1)*01` | 3 | 3 | 3 |
| L3 | Contains "101" | {0,1} | `(0\|1)*101(0\|1)*` | 4 | 4 | 6 |
| L4 | Number of 1s divisible by 3 | {0,1} | `0*(10*10*10*)*` | 3 | 18 (ε) | 8 |
| L5 | No two consecutive 1s | {0,1} | `(0\|10)*1?` | 3 | 12 (ε) | 5 |
| L6 | Binary multiple of 3 | {0,1} | `(0\|1(01*0)*1)*` | 3 | 16 (ε) | 7 |
| L7 | (a\|b)*abb | {a,b} | `(a\|b)*abb` | 4 | 4 | 4 |
| L8 | Length ≡ 0 (mod 4) and starts with a | {a,b} | `a(a\|b)(a\|b)(a\|b)((a\|b)(a\|b)(a\|b)(a\|b))*` | 6 | 39 (ε) | 17 |
| L9 | Third symbol from the end is 1 | {0,1} | `(0\|1)*1(0\|1)(0\|1)` | 8 | 4 | 8 |
| L10 | #a − #b ≡ 0 (mod 3) | {a,b} | `(ba\|(a\|bb)(ab)*(b\|aa))*` | 3 | 24 (ε) | 9 |

### ML pipelines: test accuracy / accuracy on unseen lengths 21-40

| language | LR | DT | RF | Stack | best pipeline (test F1) |
|---|---|---|---|---|---|
| L1 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | LR (1.000) |
| L2 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | DT (1.000) |
| L3 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | DT (1.000) |
| L4 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | LR (1.000) |
| L5 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | DT (1.000) |
| L6 | 0.626 / 0.538 | 0.735 / 0.528 | 0.760 / 0.544 | 0.750 / 0.528 | RF (0.725) |
| L7 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | LR (1.000) |
| L8 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | LR (1.000) |
| L9 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | LR (1.000) |
| L10 | 0.586 / 0.518 | 0.985 / 0.581 | 1.000 / 0.796 | 0.999 / 0.619 | RF (1.000) |

### Mean over the ten languages

| pipeline | val acc | val F1 | test acc | test precision | test recall | test F1 | long acc |
|---|---|---|---|---|---|---|---|
| LR | 0.923 | 0.906 | 0.921 | 0.908 | 0.904 | 0.905 | 0.906 |
| DT | 0.974 | 0.969 | 0.972 | 0.967 | 0.968 | 0.968 | 0.911 |
| RF | 0.974 | 0.969 | 0.976 | 0.972 | 0.973 | 0.973 | 0.934 |
| Stack | 0.976 | 0.971 | 0.975 | 0.972 | 0.969 | 0.970 | 0.915 |

### Learned automata: states after minimization (✓ = exactly equivalent to the ground truth)

| language | truth | L*·LR | L*·DT | L*·RF | L*·Stack | RPNI | EDSM |
|---|---|---|---|---|---|---|---|
| L1 | 2 | 2 ✓ | 2 ✓ | 2 ✓ | 2 ✓ | 2 ✓ | 2 ✓ |
| L2 | 3 | 3 ✓ | 3 ✓ | 3 ✓ | 3 ✓ | 3 ✗ `1` | 3 ✓ |
| L3 | 4 | 4 ✓ | 4 ✓ | 4 ✓ | 4 ✓ | 4 ✓ | 4 ✓ |
| L4 | 3 | 3 ✓ | 3 ✓ | 3 ✓ | 3 ✓ | 3 ✓ | 3 ✓ |
| L5 | 3 | 3 ✓ | 3 ✓ | 3 ✓ | 3 ✓ | 3 ✓ | 3 ✓ |
| L6 | 3 | 54* ✗ `ε` | 37* ✗ `11011` | 3* ✓ | 7* ✗ `11011` | 3 ✓ | 3 ✓ |
| L7 | 4 | 4 ✓ | 4 ✓ | 4 ✓ | 4 ✓ | 4 ✗ `bb` | 4 ✓ |
| L8 | 6 | 6 ✗ `ε` | 6 ✓ | 6 ✓ | 6 ✓ | 6 ✓ | 6 ✓ |
| L9 | 8 | 8 ✓ | 8 ✓ | 8 ✓ | 8 ✓ | 8 ✓ | 8 ✓ |
| L10 | 3 | 20* ✗ `aa` | 12* ✗ `a` | 3* ✓ | 3* ✓ | 3 ✓ | 3 ✓ |

`*` = L* stopped at its 64-state budget (did not converge); `✗ w` = shortest string on which the DFA and the ground truth disagree.

### Ground truth vs learned DFAs vs ML pipelines (means over the ten languages)

| approach | test acc | long acc | drop | size | µs / string | build time (s) | exact languages |
|---|---|---|---|---|---|---|---|
| Ground-truth DFA | 1.000 | 1.000 | +0.000 | 7.8 transitions | 0.51 | – | 10 |
| L* DFA from Logistic Regression | 0.918 | 0.904 | +0.014 | 21.4 transitions | 0.51 | 0.104 | 7 |
| L* DFA from Decision Tree | 0.980 | 0.968 | +0.012 | 16.4 transitions | 0.53 | 0.070 | 8 |
| L* DFA from Random Forest | 1.000 | 1.000 | +0.000 | 7.8 transitions | 0.51 | 0.240 | 10 |
| L* DFA from Stacked ensemble | 0.998 | 0.997 | +0.001 | 8.6 transitions | 0.51 | 0.234 | 9 |
| Passive DFA (RPNI) | 1.000 | 1.000 | +0.000 | 7.8 transitions | 0.51 | 0.033 | 8 |
| Passive DFA (EDSM) | 1.000 | 1.000 | +0.000 | 7.8 transitions | 0.52 | 0.072 | 10 |
| Logistic Regression | 0.921 | 0.906 | +0.016 | 13.0 params/nodes | 2.19 | 0.671 | – |
| Decision Tree | 0.972 | 0.911 | +0.061 | 73.2 params/nodes | 2.04 | 0.014 | – |
| Random Forest | 0.976 | 0.934 | +0.042 | 17,769.0 params/nodes | 22.82 | 0.102 | – |
| Stacked ensemble | 0.975 | 0.915 | +0.060 | 17,859.2 params/nodes | 27.30 | 3.581 | – |

### Insights (generated by notebook 02)

- The ground-truth automata are exact by construction (proved with the product construction) and use 2-8 states.
- Passive learning from the labelled training strings: EDSM recovered the exact minimal DFA for 10/10 languages, RPNI for 8/10 (misses: L2 (shortest wrong string '1'), L7 (shortest wrong string 'bb'), where the split moved a few of the shortest strings out of training).
- L* extracted a DFA equivalent to the ground truth from 34 of 40 pipelines: 31 converged (the model implements the language exactly) and 3 stopped at the state budget (the DFA reflects the model's short-string behaviour; see fidelity).
- Mean test accuracy of the ML pipelines: Logistic Regression 0.921, Decision Tree 0.972, Random Forest 0.976, Stacked ensemble 0.975; on unseen lengths 21-40: 0.906, 0.911, 0.934, 0.915.
- L6 (binary multiples of 3) defeats every ML pipeline (about 0.53 on long strings): no generic feature encodes a position-weighted sum mod 3. L10 defeats the linear model, and on long strings also the trees.
- A DFA classifies a string in about 0.5 microseconds with a handful of states; the random forests carry about 17,769 tree nodes on average.
- Converged extractions that still differ from the truth pinpoint the model's error exactly: L8/Logistic Regression on '' ('' = the empty string).
<!-- RESULTS:END -->

**In plain words**
* **Classical automata are exact.** Every ground-truth construction is proven equivalent and classifies all test
  strings, and all strings of the unseen lengths 21–40, with 2–8 states.
* **Passive automata learning beats ML where it matters.** EDSM recovers all ten languages exactly from the training
  strings, including the counting languages that defeat every ML model. RPNI recovers eight. For L2 and L7 a few of the
  shortest strings landed in validation/test, and RPNI's fixed merge order then made a wrong but consistent merge.
* **ML is near-perfect only when a generic feature matches the language.** L6 (binary multiples of 3) is out of reach
  for all four pipelines: about 0.53 on long strings, because no generic feature encodes a position-weighted sum mod 3.
  L10 is out of reach for the linear model and, on long strings, for the trees, which split on count thresholds of the
  training lengths.
* **L\* shows what each model learned.** When a model implements a regular language, L\* returns its minimal DFA, and
  equivalence checking finds the exact difference from the truth. For example, the L8 logistic regression is wrong only
  on ε. When it does not, the bounded extraction says so (`converged = false`, low fidelity).
* **Complexity and speed.** A DFA needs about 8 transitions and about half a microsecond per string. The forests need
  about 18k nodes and are about 40× slower per string in batch.

Figures for every claim are in `artifacts/figures/` and in notebook 02.

---

## The website

| page | what you can do |
|---|---|
| **Story** (`/`) | A live machine reads a tape in the hero; type your own string. Scroll through the problem, the objectives, the theory in motion (subset construction, minimization, equivalence), the dataset, the results (counters, charts, the DFA-vs-ML table) and "the DFA inside the model". |
| **Explore** (`/explore`) | Pick one of the ten languages, then one of 13 approaches (ground-truth DFA, NFA, minimized DFA, four L\* DFAs, RPNI, EDSM, four ML pipelines), each with live stats. |
| **Detail** (`/explore/:lang/:approach`) | **Automata:** an animated graph; state and transition tables; minimization before/after with Moore rounds; the Myhill–Nerode table; how it was learned; NFA subset construction step by step. **ML:** an animated pipeline diagram; coefficients, tree or importances; metrics and confusion matrix; the extracted DFA. **Try it:** type a string and watch it run symbol by symbol, active states and all, ending in a verdict with confidence and time taken. |
| **Compare** (`/compare`) | Run one string through all 13 approaches side by side. Disagreements with the ground truth are explained (for example "longer than any training string"). |
| **Learn** (`/learn`) | Paste accepted and rejected samples, pick RPNI, EDSM or an ML model + L\*, and learn a minimized DFA live. Then classify new strings with it and with ML models trained on the same samples. |

**Design.** The website uses a "blueprint" visual direction: automata are schematics, so the dark theme is a cyanotype
with a drafting grid and the light theme a whiteprint. The amber lamp is the machine's read head. Type is IBM Plex
(Condensed for headlines, Mono for strings and states). Charts use a colour-blind-validated categorical palette, and each
has a table view.

**Built with:** React 19, Vite, Tailwind v4, Motion, GSAP ScrollTrigger and Lenis smooth scrolling, and dagre for graph
layout. Components come from the open registries behind 21st.dev:
- [React Bits](https://reactbits.dev): Threads, LightRays, LetterGlitch, DotGrid, RippleGrid, Aurora, SpotlightCard,
  StarBorder, CountUp and text effects;
- [Magic UI](https://magicui.design): AnimatedBeam, NumberTicker, Marquee, BorderBeam, ScrollProgress;
- [Aceternity UI](https://ui.aceternity.com) and [Kokonut UI](https://kokonutui.com).

Sources are recorded in `frontend/src/components/THIRD_PARTY.lock.json` (`frontend/scripts/fetch-components.mjs`
re-fetches them). Reduced motion is respected and all controls are keyboard operable.

**API** (OpenAPI at `/docs`): `GET /api/languages`, `GET /api/approaches?language=`, `GET /api/automata/{lang}/{approach}`,
`GET /api/models/{lang}/{pipeline}`, `GET /api/metrics`, `GET /api/summary`, `GET /api/dataset`, `POST /api/classify`,
`POST /api/compare`, `POST /api/learn`, `POST /api/learn/{session}/classify`.

<!-- SCREENSHOTS:START -->
<!-- SCREENSHOTS:END -->

---

## Testing

* `python -m pytest -q` covers:
  * DFA and NFA acceptance, ε-closure, subset construction (including the L9 blow-up) and Thompson's construction;
  * hand-derived minimal state counts (L1 = 2, L2 = 3, …);
  * Hopcroft = Moore = Brzozowski on 300 random DFAs;
  * shortest counterexamples and the product construction;
  * L\* recovering all ten languages exactly, and respecting its budget on a non-regular oracle;
  * RPNI and EDSM consistency, and identification from characteristic samples;
  * the vectorized features against a reference implementation;
  * the pipelines, the dataset invariants and CSV round-trips, and the API endpoints including friendly errors.
* Notebook 02 runs the suite from its last section.
* `python run_all.py --check` adds the frontend type-check, the production build, and an end-to-end run in Microsoft Edge
  (`frontend/e2e/run-e2e.mjs`). The end-to-end run visits every page, completes the full flow (language → approach → input →
  verdict) and fails on any console error.

---

## Decisions and deviations from the specification

* **Environment.** The project uses the existing conda environment `ai` (Python 3.11.15) instead of a fresh virtualenv,
  as requested. `requirements.txt` pins the direct dependencies to the exact versions in that environment, and the first
  cell of each notebook asserts the interpreter and the pinned versions.
* **Notebook execution.** Notebooks are executed with `scripts/run_notebook.py` (nbclient, which is what
  `jupyter nbconvert --execute` uses) instead of the `jupyter` command line, for two reasons on the development machine.
  The user-level `python3` kernelspec points to a different Python, and Windows Application Control blocks the
  `jupyter-*.exe` shims. The runner pins the kernel to the current interpreter.
* **Two extra languages** (L9, L10), to show the subset-construction blow-up and an interaction-type counting language.
* **Class balance.** Exhaustive short strings are kept complete, so the 0–5 and 6–10 buckets keep each language's natural
  ratio (L8, for instance, has no positives at lengths that are not multiples of 4). Every sampled bucket is exactly
  balanced, and the report shows both.
* **Split stratification** goes one level finer than asked (language × label × length bucket).
* **No refit on train+validation** after model selection, to keep the reported validation metrics honest.
* **L\* equivalence queries** are approximated by testing (no exact teacher exists for a trained model), under the
  budgets described above. Both RPNI and EDSM are implemented, and both are reported.
* **Frontend toolchain pinned below the newest majors** (Vite 6 with Rollup's WASM build, React Router 7, Motion 12,
  TypeScript 5.8). Rollup's and Rolldown's native binaries are blocked by Windows Application Control on the development
  machine.
* The GitHub repository was created **private** because no visibility was specified. Make it public with
  `gh repo edit --visibility public`.

## Limitations

* The ML results depend on the generic feature set. A hand-crafted feature such as "binary value mod 3" would make L6
  trivial, which is exactly why such features were excluded.
* L\* against a model uses an approximate teacher. A converged extraction is exact with respect to the test suite, not
  proven equivalent to the model. Non-converged extractions are a bounded regular approximation and are labelled as such.
* RPNI and EDSM are only as good as their sample. With very few strings they overgeneralize (see the sample-efficiency
  figure), and RPNI is sensitive to gaps among the shortest strings.
* Timings are wall-clock measurements on one laptop. The DFA timings are a pure-Python loop and the ML timings are batched
  scikit-learn `predict_proba` calls, so compare orders of magnitude rather than exact values.
