// Tangkapan layar viewport (bukan fullPage) untuk pemeriksaan visual. Hasil: tests/shots/*.png
import path from "node:path";
import { fileURLToPath } from "node:url";
import { start, openPage, file, numLines, upload, extract, confirmNo } from "./lib.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, ".."));
const env = await start(root);
const { browser, base } = env;
const APP = `${base}/public/index.html`, ADMIN = `${base}/admin/index.html`;
const shot = (page, name) => page.screenshot({ path: path.join(here, "shots", name + ".png") });
const hideToasts = (page) => page.evaluate(() => { document.getElementById("toasts").innerHTML = ""; });

for (const [w, h, tag] of [[390, 844, "m"], [1280, 860, "d"]]) {
    const mobile = w < 900;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 2 });
    const { page } = await openPage(browser, APP, { ctx });
    await shot(page, `v-${tag}-1-empty`);
    if (mobile) { await page.click('.tabbar [data-tab="ws"]'); await shot(page, `v-${tag}-1b-ws-empty`); }
    await upload(page, file(numLines("+519", 1, 240), "peru-business-list-2026.txt"));
    await upload(page, file(["Business Meta", ...Array.from({ length: 60 }, (_, i) => `+569${String(i).padStart(7, "0")} Standard`)], "chile.txt"));
    await extract(page, { count: 25, order: "random", source: "business" });
    await extract(page, { count: 10, order: "bottom", tier: "high" });
    await hideToasts(page);
    if (mobile) await page.click('.tabbar [data-tab="take"]');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `v-${tag}-2-take`);
    if (mobile) { await page.evaluate(() => window.scrollTo(0, 560)); await shot(page, `v-${tag}-2b-take-scrolled`); }
    if (mobile) { await page.click('.tabbar [data-tab="ws"]'); await hideToasts(page); await shot(page, `v-${tag}-3-ws`); await page.click('.tabbar [data-tab="hist"]'); await hideToasts(page); await shot(page, `v-${tag}-4-hist`); await page.click('.tabbar [data-tab="take"]'); }
    await page.click("#reset"); await page.waitForSelector("#modal:not([hidden])"); await shot(page, `v-${tag}-5-confirm`); await confirmNo(page);
    await page.fill("#count", "0"); await page.click("#extract"); await page.waitForTimeout(100); await hideToasts(page); await page.evaluate(() => document.getElementById("extractForm").scrollIntoView({ block: "center" })); await shot(page, `v-${tag}-6-error`);
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(["x"], "a.txt")); document.body.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true })); });
    await shot(page, `v-${tag}-7-dragveil`);
    await ctx.close();
}
// admin
for (const [w, h, tag] of [[390, 844, "m"], [1280, 860, "d"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const { page } = await openPage(browser, APP, { ctx });
    await upload(page, file(numLines("+519", 1, 240), "peru.txt"));
    await upload(page, file(["Business Meta", ...Array.from({ length: 60 }, (_, i) => `+569${String(i).padStart(7, "0")} Standard`)], "chile.txt"));
    await extract(page, { count: 25, order: "random", source: "business" });
    const a = await ctx.newPage(); await a.goto(ADMIN); await a.waitForSelector("#content:not([hidden])"); await a.waitForTimeout(200);
    await shot(a, `v-${tag}-8-admin`);
    await a.evaluate(() => window.scrollTo(0, 700)); await shot(a, `v-${tag}-9-admin-scrolled`);
    await ctx.close();
}
await env.close();
