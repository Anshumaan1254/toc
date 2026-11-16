// Screenshot a page in the installed Microsoft Edge and report console errors.
// node e2e/shot.mjs <url> <out.png> [width] [height] [theme=dark|light] [waitMs] [fullPage=0|1]
// Full-page shots scroll through the page first so scroll-triggered animations play.
import { chromium } from "playwright-core";
const [url, out, w = "1440", h = "900", theme = "dark", waitMs = "1500", full = "0"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
await ctx.addInitScript((t) => { try { localStorage.setItem("toc-theme", t); } catch {} }, theme);
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(waitMs));
if (full === "1") {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.floor(Number(h) * 0.6)) {
    await page.mouse.wheel(0, Math.floor(Number(h) * 0.6));
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}
await page.screenshot({ path: out, fullPage: full === "1" });
console.log(JSON.stringify({ url, out, errors }));
await browser.close();
