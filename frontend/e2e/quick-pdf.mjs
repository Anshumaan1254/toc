// Print docs/quick/guide.html to docs/Automata_Lab_Guide_quick.pdf with the installed Edge.
import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";
const html = fileURLToPath(new URL("../../docs/quick/guide.html", import.meta.url));
const out = fileURLToPath(new URL("../../docs/Automata_Lab_Guide_quick.pdf", import.meta.url));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: out, format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8px;color:#5f7891;width:100%;padding:0 16mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>Automata Lab · quick guide</span><span>page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
});
await browser.close();
console.log(out);
