// Helper bersama untuk tes E2E Nomor Vault.
import { chromium } from "playwright";
import { serve } from "./serve.mjs";

export async function start(root) {
    const srv = await serve(root);
    const browser = await chromium.launch({
        executablePath: process.env.CHROME_PATH || undefined,
        args: ["--no-sandbox"]
    });
    return { srv, browser, base: `http://127.0.0.1:${srv.port}`, close: async () => { await browser.close(); srv.close(); } };
}

export function makeRunner() {
    const results = [];
    const run = async (id, desc, fn) => {
        const t0 = Date.now();
        let ok = false, detail;
        try {
            const r = await fn();
            ok = r === true || (r && r.ok === true);
            detail = r && typeof r === "object" ? r.detail : undefined;
            if (r !== true && !ok && r && r.ok === undefined) detail = r;
        } catch (e) { ok = false; detail = "EXC " + String(e && e.message || e).split("\n")[0]; }
        results.push({ id, desc, ok, detail });
        console.log(`${ok ? "PASS" : "FAIL"} ${id} ${desc}${detail !== undefined ? " :: " + JSON.stringify(detail) : ""} (${Date.now() - t0}ms)`);
    };
    const summary = () => {
        const fail = results.filter((r) => !r.ok);
        console.log(`\nTOTAL ${results.length}  PASS ${results.length - fail.length}  FAIL ${fail.length}`);
        if (fail.length) console.log("FAIL IDS: " + fail.map((r) => r.id).join(", "));
        return fail.length;
    };
    return { run, summary, results };
}

/* Buka halaman baru dengan pengumpulan pageerror. */
export async function openPage(browser, url, opts = {}) {
    const ctx = opts.ctx || await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.errors = [];
    page.consoleErrors = [];
    page.on("pageerror", (e) => page.errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") page.consoleErrors.push(m.text()); });
    if (url) await page.goto(url);
    if (opts.settle !== false && url && url.includes("/public/")) await settled(page);
    return { ctx, page };
}

export const settled = (page) => page.waitForFunction(() => window.NV && !NV.state.busy && !NV.state.loading && (NV.state.activeId == null || NV.state.inv || NV.state.invFailed), null, { timeout: 30000 });

export const file = (lines, name = "x.txt", mimeType = "text/plain") => ({ name, mimeType, buffer: Buffer.from(Array.isArray(lines) ? lines.join("\n") : lines) });

/* Generator nomor: prefix + indeks, tier bergantian. */
export function numLines(prefix, from, count, { tiers = ["Exclusive", "Standard", "Low", "Agent AI"], header = true } = {}) {
    const out = header ? ["Business Meta"] : [];
    for (let i = 0; i < count; i++) out.push(`${prefix}${String(from + i).padStart(7, "0")} ${tiers[i % tiers.length]}`);
    return out;
}

export async function upload(page, files) {
    await page.setInputFiles("#fileInput", files);
    await page.waitForFunction(() => !NV.state.busy);
    await settled(page);
}

export const text = (page, sel) => page.textContent(sel).then((s) => s.trim());
export const num = (page, sel) => text(page, sel).then((s) => Number(s.replace(/\D/g, "")));

export async function setFilters(page, { source, tier, order, count }) {
    if (source) await page.selectOption("#source", source);
    if (tier) await page.selectOption("#tier", tier);
    if (order) await page.selectOption("#order", order);
    if (count !== undefined) await page.fill("#count", String(count));
}

export async function extract(page, f = {}) {
    await setFilters(page, f);
    const before = await page.evaluate(() => NV.state.list.reduce((a, w) => a + w.history.length, 0));
    await page.click("#extract");
    await page.waitForFunction((b) => !NV.state.busy && (NV.state.list.reduce((a, w) => a + w.history.length, 0) > b || document.getElementById("countErr").textContent), before, { timeout: 30000 });
}

export const outLines = async (page) => (await page.inputValue("#output")).split("\n");

// Setelah "Ya", aksi (hapus/impor) berjalan async dan menandai app sibuk.
// Tunggu sampai selesai; kalau tidak, upload berikutnya sengaja ditolak ("Masih memproses") dan tes jadi flaky.
export async function confirmYes(page) {
    await page.waitForSelector("#modal:not([hidden]) [data-yes]");
    await page.click("#modal [data-yes]");
    await page.waitForSelector("#modal", { state: "hidden" });
    await page.waitForFunction(() => !NV.state.busy);
}
export async function confirmNo(page) { await page.waitForSelector("#modal:not([hidden]) [data-no]"); await page.click("#modal [data-no]"); await page.waitForSelector("#modal", { state: "hidden" }); }
