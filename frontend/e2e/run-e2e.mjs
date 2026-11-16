// End-to-end test in the installed Microsoft Edge (playwright-core, no browser download).
//   node e2e/run-e2e.mjs [baseUrl=http://127.0.0.1:5173] [--no-shots]
// Visits every page, runs the full flow (language -> approach -> input -> submit -> verdict),
// exercises Compare and Learn, fails on any console error, and saves README screenshots.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const base = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "http://127.0.0.1:5173").replace(/\/$/, "");
const shots = !process.argv.includes("--no-shots");
const SHOT_DIR = fileURLToPath(new URL("../../docs/screenshots/", import.meta.url));
await mkdir(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];

async function check(name, path, { theme = "dark", width = 1440, height = 900, shot = null, fullShot = false, action = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("toc-theme", t);
    } catch {}
  }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  const started = Date.now();
  let ok = true;
  let detail = "";
  try {
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 45000 });
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 20000 });
    if (action) detail = (await action(page)) ?? "";
    if (shot && shots) {
      if (fullShot) {
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < total; y += 500) {
          await page.mouse.wheel(0, 500);
          await page.waitForTimeout(220);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(600);
      }
      await page.waitForTimeout(900);
      await page.screenshot({ path: SHOT_DIR + shot, fullPage: fullShot });
    }
  } catch (err) {
    ok = false;
    detail = String(err).split("\n")[0];
  }
  if (errors.length) ok = false;
  results.push({ name, path, ok, ms: Date.now() - started, detail, errors });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} ${path}${detail ? `  — ${detail}` : ""}${errors.length ? `\n      console: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  await ctx.close();
}

async function runString(page, value, expected) {
  const input = page.getByTestId("string-input").first();
  await input.scrollIntoViewIfNeeded();
  await input.fill(value);
  await page.getByTestId("string-submit").first().click();
  const verdict = page.getByTestId("verdict").first();
  await verdict.waitFor({ state: "visible", timeout: 30000 });
  const got = await verdict.getAttribute("data-verdict");
  if (expected && got !== expected) throw new Error(`expected ${expected} for "${value}", got ${got}`);
  return `"${value}" → ${got}`;
}

// ---------------------------------------------------------------- pages
await check("story (dark)", "/", {
  shot: "story-dark.png",
  action: async (page) => {
    const h = await page.locator("h1").first().innerText();
    if (!h.trim()) throw new Error("empty hero headline");
    return `hero: ${h.slice(0, 60).replace(/\s+/g, " ")}`;
  },
});
await check("story (light)", "/", { theme: "light", shot: "story-light.png" });
await check("story (full page)", "/", { shot: "story-full.png", fullShot: true, width: 1280 });
await check("story (mobile)", "/", { width: 390, height: 844, shot: "story-mobile.png" });

await check("explore → choose L7 → ground-truth DFA", "/explore?lang=L7", {
  shot: "explore.png",
  action: async (page) => {
    const link = page.locator('a[href="/explore/L7/dfa"]').first();
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await page.waitForURL("**/explore/L7/dfa", { timeout: 15000 });
    await page.locator("h1").first().waitFor();
    return "navigated to /explore/L7/dfa";
  },
});

await check("detail: DFA try-it (L7 'aabb' accepted)", "/explore/L7/dfa", {
  shot: "detail-dfa.png",
  action: (page) => runString(page, "aabb", "accepted"),
});
await check("detail: DFA try-it (L7 'abab' rejected)", "/explore/L7/dfa", { action: (page) => runString(page, "abab", "rejected") });
await check("detail: NFA try-it (L9 '100')", "/explore/L9/nfa", { shot: "detail-nfa.png", action: (page) => runString(page, "100", "accepted") });
await check("detail: NFA with ε (L1)", "/explore/L1/nfa", { action: (page) => runString(page, "0110", "accepted") });
await check("detail: minimized DFA (L8)", "/explore/L8/min_dfa", { shot: "detail-min-dfa.png", action: (page) => runString(page, "abab", "accepted") });
await check("detail: L* DFA from RF (L6)", "/explore/L6/lstar_rf", { shot: "detail-lstar.png", action: (page) => runString(page, "110", "accepted") });
await check("detail: RPNI (L2)", "/explore/L2/rpni", { action: (page) => runString(page, "1101", "accepted") });
await check("detail: EDSM (L10)", "/explore/L10/edsm", { action: (page) => runString(page, "abab", "accepted") });
await check("detail: ML random forest (L6)", "/explore/L6/ml_rf", { shot: "detail-ml.png", action: (page) => runString(page, "110", null) });
await check("detail: ML logistic regression (L3)", "/explore/L3/ml_lr", { action: (page) => runString(page, "0101", "accepted") });
await check("detail: ML decision tree (L10)", "/explore/L10/ml_dt", { action: (page) => runString(page, "aabbab", null) });
await check("detail: ML stack (L1, light)", "/explore/L1/ml_stack", { theme: "light", shot: "detail-ml-light.png", action: (page) => runString(page, "0110", "accepted") });

await check("compare (L6, long string)", "/compare?lang=L6&s=111111111111111111111110", {
  shot: "compare.png",
  action: async (page) => {
    await page.getByText(/Ground-truth DFA/).first().waitFor({ timeout: 30000 });
    const body = await page.locator("main").innerText();
    if (!/Random Forest/.test(body) || !/EDSM/.test(body)) throw new Error("not every approach is listed");
    return "all approaches listed";
  },
});
await check("compare: submit a new string", "/compare?lang=L7", {
  action: async (page) => {
    await page.getByTestId("string-input").first().fill("babb");
    await page.getByTestId("string-submit").first().click();
    await page.waitForURL(/s=babb/, { timeout: 15000 });
    await page.getByText(/Ground-truth DFA/).first().waitFor({ timeout: 30000 });
    return "URL updated and results shown";
  },
});

await check("learn: samples → DFA → classify", "/learn", {
  shot: "learn.png",
  action: async (page) => {
    const areas = page.locator("textarea");
    if ((await areas.count()) < 2) throw new Error("expected two sample editors");
    await areas.nth(0).fill(["", "aa", "bb", "abab", "aabb", "baba", "abba", "aaaa"].join("\n").replace(/^\n/, "ε\n"));
    await areas.nth(1).fill(["a", "b", "aab", "bab", "abb", "aaa", "bbb", "ababa"].join("\n"));
    await page.getByRole("button", { name: /learn/i }).first().click();
    await page.locator('svg[role="img"][aria-label*="DFA with"]').first().waitFor({ timeout: 30000 });
    return runString(page, "abbaab", "accepted");
  },
});
await check("404 page", "/no-such-page", { action: async (page) => ((await page.getByText(/trap state/i).count()) ? "trap state shown" : "") });

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${shots ? `; screenshots in docs/screenshots/` : ""}`);
process.exit(failed.length ? 1 : 0);
