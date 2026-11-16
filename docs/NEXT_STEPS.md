# Where we stopped (2026-11-16) and what is next

## Done and pushed
- **Stage 1:** automata toolkit (DFA, ε-NFA, regex → Thompson, subset construction, Hopcroft / Moore /
  Brzozowski, product-construction equivalence), languages L1–L10, the 70,470-row dataset, and notebook 01
  (executed).
- **Stage 2:** generic features, LR / DT / RF / Stacking pipelines, L* / RPNI / EDSM, and notebook 02
  (executed). Artifacts: 40 models, 90 automata JSON files, explanations, 14 figures and `metrics.json`. The
  test suite (122 tests) passes.
- **Backend:** FastAPI routes with tests, plus the one-command launcher `run_all.py`.
- **Frontend foundation:**
  - the blueprint design system;
  - the shared components: AutomatonGraph with multi-token traces, Tape, charts, LightTable, Ambient and
    DimensionLine;
  - the app shell, the story chapter tape, the detail-page header and the 404 page.
- **Design direction** by the Fable design director: `docs/design/DESIGN_DIRECTION.md`.
- **Frontend pages, first pass:** Story (all 8 chapters), Explore, Automaton and NFA detail, ML detail, Compare
  and Learn.
  - Compare and Learn finished their self-review.
  - The other five builders were stopped during their final self-check.
  - The code type-checks with 0 errors and `vite build` succeeds.

## Next (in order)
1. **Fable supervision round** (the user wants Fable 5.2 as design supervisor):
   - Two Fable reviewers check the Story page and the tool pages against `docs/design/DESIGN_DIRECTION.md`
     section 5. That means screenshots in dark, light and at 390px, plus the grep checks, interaction checks and
     data-correctness checks.
   - Builder agents then apply the must-fixes and upgrades, each in its own folder.
   - Fable signs off at the end.
   - Already noticed: the hero headline colours its second line differently, which is a "generated look" tell to
     remove.
2. **`python run_all.py --check`.** It runs pytest, the frontend type-check, the production build and the
   end-to-end test in Edge (`frontend/e2e/run-e2e.mjs`). Adjust the e2e selectors if a page's markup changed;
   the shared `StringInput` and `VerdictStamp` carry `data-testid` hooks.
3. **Screenshots.** The e2e run saves them to `docs/screenshots/`. Add them to the README between the
   `SCREENSHOTS` markers.
4. **Final notebook 02 re-run** (`python run_all.py --pipeline` or `scripts/run_notebook.py`), then
   `python scripts/make_readme_tables.py --inject README.md` to refresh the results tables.
5. Final commit and push. Optionally make the repository public with `gh repo edit --visibility public`.

## Run it
```bash
D:\CondaEnvs\ai\python.exe run_all.py        # API :8000 + website :5173
```

## Notes from the builders' reports
- Under reduced motion, the Motion library prints a development-only console notice. It does not appear in
  production builds.
- Learn logs a browser "422" only when invalid samples are deliberately submitted. That is expected, and the
  page shows the server's message inline.
