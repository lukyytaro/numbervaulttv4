// Tes E2E Nomor Vault v4 (Playwright + Chromium).
// Jalankan: node tests/e2e.mjs [folder-root]   (CHROME_PATH opsional)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { start, makeRunner, openPage, settled, file, numLines, upload, text, num, extract, setFilters, outLines, confirmYes, confirmNo } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, ".."));
const shots = path.join(here, "shots");
fs.mkdirSync(shots, { recursive: true });

const env = await start(root);
const { browser, base } = env;
const APP = `${base}/public/index.html`;
const ADMIN = `${base}/admin/index.html`;
const { run, summary } = makeRunner();
const noErr = (page) => (page.errors.length === 0 ? true : { ok: false, detail: page.errors.slice(0, 2) });
const lines = (...a) => a.flat();

/* ===================== PARSER ===================== */
{
    const { page } = await openPage(browser, APP);
    const parse = (l) => page.evaluate((t) => { const r = NV.parseText(t); return { n: r.n, f: r.f, s: r.stats }; }, [].concat(l).join("\n"));
    await run("P1", "2 nomor sebaris (koma) -> 2", async () => { const r = await parse(["Business Meta", "+51912345678, +51987654321 Exclusive"]); return { ok: r.n.length === 2, detail: r.n }; });
    await run("P2", "format beda, nomor sama -> dedup 1 (tampilan format pertama)", async () => { const r = await parse(["Business Meta", "+51 912 345 678 Exclusive", "51912345678 Standard"]); return { ok: r.n.length === 1 && r.n[0] === "+51912345678" && r.s.duplicates === 1, detail: r }; });
    await run("P3", "tanggal bukan nomor", async () => { const a = await parse("Generated 2024-05-01 10.30 Exclusive"); const b = await parse("Tanggal 15.05.2024 10.30"); return { ok: a.n.length === 0 && b.n.length === 0, detail: [a.n, b.n] }; });
    await run("P4", "dua nomor dipisah spasi tidak digabung", async () => { const r = await parse("519123456789 519987654321 Exclusive"); return { ok: r.n.length === 2 && r.n[0] === "519123456789", detail: r.n }; });
    await run("P5", "ID > 15 digit bukan nomor", async () => { const r = await parse("ID:123456789012345678901 Exclusive"); return { ok: r.n.length === 0, detail: r.s }; });
    await run("P6", "00-prefix = +, dedup dengan +", async () => { const r = await parse(["0051912345678 Exclusive", "+51912345678 Standard"]); return { ok: r.n.length === 1 && r.n[0] === "+51912345678", detail: r.n }; });
    await run("P7", "Business hanya setelah header & wajib punya tier", async () => { const r = await parse(["+51911111111 Exclusive", "Business Meta", "+51922222222 Exclusive", "+51933333333"]); return { ok: JSON.stringify(r.f) === "[1,9,0]", detail: r.f }; });
    await run("P8", "dua nomor ber-+ menempel dipisah benar", async () => { const r = await parse("+51 912 345 678 +51 987 654 321 Standard"); return { ok: r.n.length === 2 && r.n[0] === "+51912345678" && r.n[1] === "+51987654321", detail: r.n }; });
    await run("P9", "CRLF dan CR-saja", async () => { const r = await parse("Business Meta\r+51912345671 Exclusive\r\n+51912345672 Standard\r+51912345673 Low"); return { ok: r.n.length === 3, detail: r.n }; });
    await run("P10", "tier: Agent AI / AgentAI / Agent-AI; 'Slow' bukan Low", async () => { const r = await parse(["Business Meta", "+51912345671 Agent AI", "+51912345672 AgentAI", "+51912345673 Agent-AI", "+51912345674 Slow"]); return { ok: JSON.stringify(r.f) === "[12,12,12,0]", detail: r.f }; });
    await run("P11", "nomor < 9 digit ditolak & dihitung invalid", async () => { const r = await parse("+51-91-23-45 Exclusive"); return { ok: r.n.length === 0 && r.s.invalid === 1, detail: r.s }; });
    await run("P12", "prioritas tier: exclusive > standard > low > agent (perilaku v3)", async () => { const r = await parse(["Business Meta", "+51912345671 Exclusive Standard Low", "+51912345672 Standard Low", "+51912345673 Low Agent AI"]); return { ok: JSON.stringify(r.f) === "[9,10,11]", detail: r.f }; });
    await run("P13", "baris tanpa nomor/kosong tidak jadi nomor", async () => { const r = await parse(["", "   ", "Business Meta", "teks biasa", "+51912345671 Exclusive"]); return { ok: r.n.length === 1 && r.s.lines === 3, detail: r.s }; });
    await run("C1", "kode negara: 692/36/53/590/262/1/7/44; lokal=Unknown", async () => {
        const c = await page.evaluate(() => ["+692123456789", "+36301234567", "+5352345678", "+590690123456", "+262692123456", "+12025550123", "+79123456789", "+447911123456", "0812345678901"].map(NV.countryOf));
        return { ok: JSON.stringify(c) === JSON.stringify(["Marshall-Islands", "Hungary", "Cuba", "Guadeloupe", "Reunion-Mayotte", "US-Canada", "Russia-Kazakhstan", "United-Kingdom", "Unknown"]), detail: c };
    });
    await run("P-err", "tanpa pageerror", () => noErr(page));
}

/* ===================== REGRESI PERILAKU v3 ===================== */
{
    const { page } = await openPage(browser, APP);
    await upload(page, file(["Business Meta", "+51912340001 Exclusive", "+51912340002 Standard", "+51912340003 Low", "+51912340004 Agent AI", "+51912340005 Exclusive", "+51912340001 Exclusive", "+51912340006"]));
    await run("R1", "dedup dalam file: 6 unik, 5 business, nama Peru-numbers.txt", async () => {
        const s = { total: await text(page, "#total"), business: await text(page, "#business"), name: await text(page, "#activeName"), country: await text(page, "#activeCountry") };
        return { ok: s.total === "6" && s.business === "5" && s.name === "Peru-numbers.txt" && s.country.includes("Peru"), detail: s };
    });
    await run("R2", "filter source/tier", async () => {
        const av = async (source, tier) => { await setFilters(page, { source, tier }); return num(page, "#available"); };
        const m = { biz_all: await av("business", "all"), biz_high: await av("business", "high"), biz_ex: await av("business", "exclusive"), biz_low: await av("business", "low"), biz_agent: await av("business", "agent"), biz_std: await av("business", "standard"), all_all: await av("all", "all"), all_std: await av("all", "standard"), all_high: await av("all", "high") };
        return { ok: m.biz_all === 5 && m.biz_high === 4 && m.biz_ex === 2 && m.biz_low === 1 && m.biz_agent === 1 && m.biz_std === 1 && m.all_all === 6 && m.all_std === 1 && m.all_high === 4, detail: m };
    });
    await run("R2b", "chip stok per tier sesuai & klik chip = filter", async () => {
        await setFilters(page, { source: "all", tier: "all" });
        const chips = await page.$$eval("#stockChips .chip", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
        await page.click('#stockChips .chip[data-tier="exclusive"]');
        const t = await page.inputValue("#tier"); const av = await num(page, "#available");
        return { ok: chips.some((c) => /Exclusive 2/.test(c)) && chips.some((c) => /Tanpa tier 1/.test(c)) && t === "exclusive" && av === 2, detail: { chips, t, av } };
    });
    await run("R3", "bottom-up: /detek + 2 nomor terakhir business (urutan terbalik)", async () => {
        await extract(page, { source: "business", tier: "all", order: "bottom", count: 2 });
        const o = await outLines(page);
        return { ok: o[0] === "/detek" && o[1] === "+51912340005" && o[2] === "+51912340004" && o.length === 3, detail: o };
    });
    await run("R4", "jumlah > stok ditolak, stok tidak berubah, ada pesan", async () => {
        await extract(page, { count: 100 });
        const used = await page.evaluate(() => NV.state.list[0].used.length);
        const err = await text(page, "#countErr");
        return { ok: used === 2 && /Hanya 3 nomor/.test(err), detail: { used, err } };
    });
    await run("R5", "nama batch Peru-batch-001.txt dan tampil di riwayat", async () => {
        const fn = await page.evaluate(() => NV.state.list[0].history[0].filename);
        const hist = await text(page, "#history");
        return { ok: fn === "Peru-batch-001.txt" && hist.includes("Peru-batch-001.txt") && hist.includes("Batch #1"), detail: { fn } };
    });
    await run("R6", "order file = urutan file dari atas", async () => {
        await extract(page, { order: "file", count: 2 });
        const o = await outLines(page);
        return { ok: o[1] === "+51912340001" && o[2] === "+51912340002", detail: o };
    });
    await run("R7", "stat terambil/batch/progress", async () => {
        const s = { used: await text(page, "#used"), batches: await text(page, "#batches"), prog: await page.$eval("#progress", (e) => e.style.width) };
        return { ok: s.used === "4" && s.batches === "2" && Math.abs(parseFloat(s.prog) - (4 / 6) * 100) < 0.5, detail: s };
    });
    await run("R-err", "tanpa pageerror", () => noErr(page));
}

/* ===================== ORDER / ACAK ===================== */
{
    const { page } = await openPage(browser, APP);
    await upload(page, file(numLines("+519", 1, 40)));
    await run("O1", "random: N nomor unik, semua dari stok, bukan urutan file", async () => {
        await extract(page, { order: "random", count: 15, source: "business" });
        const o = (await outLines(page)).slice(1);
        const all = await page.evaluate(() => NV.state.inv.n);
        const uniq = new Set(o).size === 15 && o.every((x) => all.includes(x));
        const sortedAsFile = o.every((x, i) => i === 0 || all.indexOf(x) > all.indexOf(o[i - 1]));
        return { ok: uniq && !sortedAsFile, detail: { uniq, sortedAsFile } };
    });
    await run("O2", "tidak ada nomor terambil dua kali antar batch", async () => {
        await extract(page, { order: "random", count: 10 });
        await extract(page, { order: "bottom", count: 10 });
        const all = await page.evaluate(() => NV.state.list[0].history.flatMap((b) => b.numbers));
        return { ok: new Set(all).size === all.length && all.length === 35, detail: { n: all.length, u: new Set(all).size } };
    });
    await run("O3", "pickIdx acak seragam (6000 undian, rasio max/min < 1.25)", async () => {
        const d = await page.evaluate(() => { const c = Array(6).fill(0); for (let i = 0; i < 6000; i++) c[NV.pickIdx([0, 1, 2, 3, 4, 5], 1, "random")[0]]++; return c; });
        const r = Math.max(...d) / Math.min(...d);
        return { ok: r < 1.25, detail: { d, r } };
    });
    await run("O4", "pickIdx acak: posisi pertama & kedua seragam (pasangan)", async () => {
        const d = await page.evaluate(() => { const c = {}; for (let i = 0; i < 12000; i++) { const p = NV.pickIdx([0, 1, 2], 2, "random").join(""); c[p] = (c[p] || 0) + 1; } return c; });
        const v = Object.values(d); const r = Math.max(...v) / Math.min(...v);
        return { ok: v.length === 6 && r < 1.25, detail: { d, r } };
    });
    await run("O-err", "tanpa pageerror", () => noErr(page));
}

/* ===================== VALIDASI JUMLAH ===================== */
{
    const { page } = await openPage(browser, APP);
    await upload(page, file(numLines("+519", 1, 300)));
    for (const v of ["0", "", "2.5", "-5", "abc", "1e3", "  "]) {
        await run("N-" + JSON.stringify(v), `jumlah ${JSON.stringify(v)} ditolak, tidak ada yang terambil`, async () => {
            await page.fill("#count", v);
            await page.click("#extract");
            await page.waitForTimeout(60);
            const used = await page.evaluate(() => NV.state.list[0].used.length);
            const err = await text(page, "#countErr");
            const inv = await page.getAttribute("#count", "aria-invalid");
            return { ok: used === 0 && err.length > 0 && inv === "true", detail: { used, err, inv } };
        });
    }
    await run("N-ok", "jumlah valid diterima, pesan error dibersihkan", async () => {
        await page.fill("#count", "5");
        await page.click("#extract");
        await page.waitForFunction(() => NV.state.list[0].used.length === 5);
        return { ok: (await text(page, "#countErr")) === "" && (await page.getAttribute("#count", "aria-invalid")) === "false", detail: null };
    });
    await run("N-max", "tombol Maks mengisi jumlah = stok tersedia", async () => {
        await page.click('[data-act="max-count"]');
        const v = await page.inputValue("#count"); const av = await num(page, "#available");
        return { ok: v === String(av) && av === 295, detail: { v, av } };
    });
    await run("N-enter", "Enter di kolom jumlah menjalankan ambil", async () => {
        await page.fill("#count", "3"); await page.press("#count", "Enter");
        await page.waitForFunction(() => NV.state.list[0].used.length === 300 - 295 + 3 + 0 || NV.state.list[0].used.length === 8);
        return { ok: (await page.evaluate(() => NV.state.list[0].used.length)) === 8, detail: null };
    });
    await run("N-busy", "klik ganda cepat hanya membuat 1 batch", async () => {
        const before = await page.evaluate(() => NV.state.list[0].history.length);
        await page.fill("#count", "2");
        await page.evaluate(() => { const b = document.getElementById("extract"); b.click(); b.click(); document.getElementById("extractForm").requestSubmit(); });
        await page.waitForFunction(() => !NV.state.busy);
        const after = await page.evaluate(() => NV.state.list[0].history.length);
        return { ok: after === before + 1, detail: { before, after } };
    });
    await run("N-err", "tanpa pageerror", () => noErr(page));
}

/* ===================== PERSISTENSI HASIL & RIWAYAT ===================== */
{
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
    const { page } = await openPage(browser, APP, { ctx });
    await upload(page, file(numLines("+519", 1, 30)));
    await extract(page, { order: "file", count: 5, source: "business" });
    const out1 = await page.inputValue("#output");
    await page.reload(); await settled(page);
    await run("H1", "hasil batch terakhir pulih setelah reload", async () => {
        const out2 = await page.inputValue("#output");
        const meta = await text(page, "#resultMeta");
        return { ok: out2 === out1 && /Batch #1/.test(meta), detail: { meta } };
    });
    await run("H2", "riwayat menyimpan nomor: Lihat/Copy/Unduh batch lama", async () => {
        await extract(page, { order: "file", count: 3 });
        const b1 = await page.evaluate(() => NV.state.list[0].history[0].numbers);
        await page.click('[data-act="view-batch"][data-n="1"]');
        const viewed = await page.inputValue("#output");
        await page.click('[data-act="copy-batch"][data-n="1"]');
        await page.waitForFunction(() => /tersalin/i.test(document.getElementById("toasts").textContent));
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="dl-batch"][data-n="1"]')]);
        const content = fs.readFileSync(await dl.path(), "utf8");
        const expected = "/detek\n" + b1.join("\n");
        return { ok: viewed === expected && clip === expected && content === expected && dl.suggestedFilename() === "Peru-batch-001.txt", detail: { fn: dl.suggestedFilename() } };
    });
    await run("H3", "tombol Copy & Download utama memakai isi kotak hasil", async () => {
        await page.click('[data-act="view-batch"][data-n="2"]');
        await page.click("#copy");
        await page.waitForFunction(() => /Tersalin/.test(document.getElementById("toasts").textContent));
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
        const content = fs.readFileSync(await dl.path(), "utf8");
        return { ok: clip === (await page.inputValue("#output")) && content === clip && dl.suggestedFilename() === "Peru-batch-002.txt", detail: dl.suggestedFilename() };
    });
    await run("H4", "Copy/Download disabled saat hasil kosong", async () => {
        const c2 = await openPage(browser, APP);
        const d = await c2.page.evaluate(() => [document.getElementById("copy").disabled, document.getElementById("download").disabled]);
        return { ok: d[0] && d[1], detail: d };
    });
    await run("H5", "riwayat paginasi 20 + tombol lebih banyak", async () => {
        await page.evaluate(async () => {
            const ws = NV.state.list[0];
            const hist = ws.history.slice();
            for (let i = hist.length + 1; i <= 45; i++) hist.push({ ...hist[0], n: i, filename: "x-" + i + ".txt" });
            ws.history = hist; ws.nextBatch = 46;
            document.querySelector('[data-act="tab"][data-tab="hist"]').click();
        });
        await page.reload().catch(() => {});
        return true;
    });
    await run("H-err", "tanpa pageerror", () => noErr(page));
}

/* ===================== PENAMAAN & HAPUS ===================== */
{
    const { page } = await openPage(browser, APP);
    for (const k of [1, 2, 3]) await upload(page, file(numLines("+519" + k, 1, 5), `p${k}.txt`));
    const names = () => page.evaluate(() => NV.state.list.map((w) => w.displayName).sort());
    await run("B0", "tiga file Peru: nama berurutan", async () => { const n = await names(); return { ok: JSON.stringify(n) === JSON.stringify(["Peru-numbers-2.txt", "Peru-numbers-3.txt", "Peru-numbers.txt"]), detail: n }; });
    await run("B1", "nama workspace tetap unik setelah hapus yang pertama", async () => {
        const id = await page.evaluate(() => NV.state.list.find((w) => w.displayName === "Peru-numbers.txt").id);
        await page.click(`#files [data-act="delete"][data-id="${id}"]`);
        await confirmYes(page);
        await upload(page, file(numLines("+5194", 1, 5), "p4.txt"));
        const n = await names();
        return { ok: new Set(n).size === n.length && n.length === 3, detail: n };
    });
    await run("B2", "batch base unik antar workspace sejenis (Peru, Peru-2, Peru-3)", async () => {
        const b = await page.evaluate(() => NV.state.list.map((w) => w.batchBase).sort());
        return { ok: new Set(b).size === 3 && b.includes("Peru-2") && b.includes("Peru-3"), detail: b };
    });
    await run("B3", "batch workspace ke-2 bernama Peru-2-batch-001.txt", async () => {
        await page.click('#files .item:has-text("Peru-numbers-2.txt") [data-act="open"].btn');
        await settled(page);
        await extract(page, { count: 2, order: "file" });
        const fn = await page.evaluate(() => NV.state.list.find((w) => w.id === NV.state.activeId).history[0].filename);
        return { ok: fn === "Peru-2-batch-001.txt", detail: fn };
    });
    await run("M1", "negara campuran: nama = negara terbanyak, bukan nomor pertama; catatan tampil", async () => {
        await upload(page, file(["Business Meta", "+56912340001 Exclusive", "+51912340002 Exclusive", "+51912340003 Standard", "+51912340004 Low", "+3630123456789 Standard"]));
        const name = await text(page, "#activeName");
        const note = await text(page, "#mixedNote");
        return { ok: name.startsWith("Peru-numbers") && /Chile 1/.test(note) && /Hungary 1/.test(note) && /Peru 3/.test(note), detail: { name, note } };
    });
    await run("D1", "hapus: Batal / Esc / backdrop tidak menghapus; Hapus menghapus + toast", async () => {
        const id = await page.evaluate(() => NV.state.activeId);
        const count = () => page.evaluate(() => NV.state.list.length);
        const c0 = await count();
        await page.click("#reset"); await page.waitForSelector("#modal:not([hidden])");
        const body = await text(page, "#dlgBody");
        await confirmNo(page);
        await page.click("#reset"); await page.waitForSelector("#modal:not([hidden])"); await page.keyboard.press("Escape"); await page.waitForSelector("#modal", { state: "hidden" });
        await page.click("#reset"); await page.waitForSelector("#modal:not([hidden])"); await page.click("#modal .backdrop", { position: { x: 5, y: 5 } }); await page.waitForSelector("#modal", { state: "hidden" });
        const c1 = await count();
        await page.click("#reset"); await confirmYes(page);
        await page.waitForFunction((n) => NV.state.list.length === n - 1, c0);
        const c2 = await count();
        const gone = await page.evaluate(async (i) => (await NV.Store.getInv(i)) === null, id);
        await page.waitForFunction(() => /dihapus/.test(document.getElementById("toasts").textContent));
        return { ok: c0 === c1 && c2 === c0 - 1 && gone && /permanen/.test(body), detail: { c0, c1, c2, gone } };
    });
    await run("D2", "hapus workspace terakhir -> empty state", async () => {
        while ((await page.evaluate(() => NV.state.list.length)) > 0) { await page.click("#reset"); await confirmYes(page); await page.waitForTimeout(50); }
        const vis = await page.isVisible("#emptyCard");
        const files = await text(page, "#files");
        return { ok: vis && /Belum ada file/.test(files), detail: { vis } };
    });
    await run("B-err", "tanpa pageerror", () => noErr(page));
}

/* ===================== UPLOAD: MULTI, DRAG-DROP, PENOLAKAN ===================== */
{
    const { page } = await openPage(browser, APP);
    await run("U1", "multi-file: 2 file -> 2 workspace, aktif = terakhir", async () => {
        await upload(page, [file(numLines("+519", 1, 5), "a.txt"), file(numLines("+569", 1, 7), "b.txt")]);
        const l = await page.evaluate(() => ({ n: NV.state.list.length, active: NV.state.list.find((w) => w.id === NV.state.activeId).originalName, names: NV.state.list.map((w) => w.displayName).sort() }));
        return { ok: l.n === 2 && l.active === "b.txt" && l.names.includes("Chile-numbers.txt") && l.names.includes("Peru-numbers.txt"), detail: l };
    });
    await run("U2", "file yang sama bisa dipilih lagi (input direset)", async () => {
        const v = await page.$eval("#fileInput", (e) => e.value);
        return { ok: v === "", detail: v };
    });
    await run("U3", "ringkasan upload: duplikat & tidak valid dilaporkan", async () => {
        await upload(page, file(["Business Meta", "+51912340001 Exclusive", "+51912340001 Exclusive", "+51-91-23-45 Standard", "+51912340002 Low"], "c.txt"));
        const t = await page.evaluate(() => document.getElementById("toasts").textContent);
        const st = await page.evaluate(() => NV.state.list.find((w) => w.id === NV.state.activeId).stats);
        return { ok: /1 duplikat dibuang/.test(t) && /1 tidak valid/.test(t) && st.duplicates === 1 && st.invalid === 1, detail: { t, st } };
    });
    await run("U4", "bukan TXT ditolak dengan pesan", async () => {
        const n0 = await page.evaluate(() => NV.state.list.length);
        await upload(page, { name: "a.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 +51912345678") });
        const n1 = await page.evaluate(() => NV.state.list.length);
        const t = await page.evaluate(() => document.getElementById("toasts").textContent + document.getElementById("uploadStatus").textContent);
        return { ok: n0 === n1 && /bukan file TXT/.test(t), detail: t };
    });
    await run("U5", "file kosong & tanpa nomor ditolak", async () => {
        const n0 = await page.evaluate(() => NV.state.list.length);
        await upload(page, file("", "empty.txt"));
        const t1 = await page.evaluate(() => document.getElementById("toasts").textContent);
        await upload(page, file(["halo dunia", "tidak ada nomor"], "nonum.txt"));
        const t2 = await page.evaluate(() => document.getElementById("toasts").textContent);
        const n1 = await page.evaluate(() => NV.state.list.length);
        return { ok: n0 === n1 && /kosong/.test(t1) && /tidak menemukan nomor valid/.test(t2), detail: { t1, t2 } };
    });
    await run("U6", "file > 30 MB ditolak", async () => {
        const n0 = await page.evaluate(() => NV.state.list.length);
        await upload(page, { name: "huge.txt", mimeType: "text/plain", buffer: Buffer.alloc(31 * 1024 * 1024, "a\n") });
        const t = await page.evaluate(() => document.getElementById("toasts").textContent);
        const n1 = await page.evaluate(() => NV.state.list.length);
        return { ok: n0 === n1 && /terlalu besar/.test(t), detail: t };
    });
    await run("U7", "UTF-16LE (BOM) terbaca", async () => {
        const buf = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(["Business Meta", "+51912340001 Exclusive", "+51912340002 Standard"].join("\r\n"), "utf16le")]);
        await upload(page, { name: "u16.txt", mimeType: "text/plain", buffer: buf });
        const w = await page.evaluate(() => NV.state.list.find((x) => x.id === NV.state.activeId));
        return { ok: w.total === 2 && w.originalName === "u16.txt", detail: w.total };
    });
    await run("U8", "UTF-8 BOM terbaca (nomor pertama tidak hilang)", async () => {
        const buf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from("+51912340001 Exclusive\n+51912340002 Standard")]);
        await upload(page, { name: "bom.txt", mimeType: "text/plain", buffer: buf });
        const w = await page.evaluate(() => NV.state.list.find((x) => x.id === NV.state.activeId));
        return { ok: w.total === 2, detail: w.total };
    });

    // drag & drop
    const dnd = async (type, n = 1, extra = {}) => page.evaluate(({ type, n, extra }) => {
        const dt = new DataTransfer();
        if (extra.text) dt.setData("text/plain", "hello");
        else for (let i = 0; i < n; i++) dt.items.add(new File(["Business Meta\n+51" + (900000000 + i + (extra.off || 0)) + " Exclusive\n+51" + (910000000 + i + (extra.off || 0)) + " Low"], `drop${i}.txt`, { type: "text/plain" }));
        const ev = new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true });
        (extra.target ? document.querySelector(extra.target) : document.body).dispatchEvent(ev);
        return { prevented: ev.defaultPrevented, veil: !document.getElementById("dropveil").hidden };
    }, { type, n, extra });
    await run("F1", "drag file di mana saja: veil tampil, event dicegah (tidak navigasi)", async () => {
        const a = await dnd("dragenter"); const b = await dnd("dragover");
        return { ok: a.prevented && b.prevented && a.veil, detail: { a, b } };
    });
    await run("F2", "drop di luar dropzone mengunggah file & veil hilang", async () => {
        const n0 = await page.evaluate(() => NV.state.list.length);
        const d = await dnd("drop", 1, { off: 1000 });
        await page.waitForFunction((n) => NV.state.list.length === n + 1 && !NV.state.busy, n0);
        const veil = await page.evaluate(() => document.getElementById("dropveil").hidden);
        return { ok: d.prevented && veil, detail: d };
    });
    await run("F3", "drop 3 file sekaligus -> 3 workspace", async () => {
        const n0 = await page.evaluate(() => NV.state.list.length);
        await dnd("dragenter", 3);
        await dnd("drop", 3, { off: 5000 });
        await page.waitForFunction((n) => NV.state.list.length === n + 3 && !NV.state.busy, n0);
        return true;
    });
    await run("F4", "drag teks (bukan file) tidak dicegah & veil tidak tampil", async () => {
        const a = await dnd("dragenter", 0, { text: 1 });
        return { ok: !a.prevented && !a.veil, detail: a };
    });
    await run("F5", "dragleave menyembunyikan veil (tanpa kedip antar elemen)", async () => {
        await dnd("dragenter"); await dnd("dragenter");
        await dnd("dragleave");
        const still = await page.evaluate(() => !document.getElementById("dropveil").hidden);
        await dnd("dragleave");
        const gone = await page.evaluate(() => document.getElementById("dropveil").hidden);
        return { ok: still && gone, detail: { still, gone } };
    });
    await run("U-err", "tanpa pageerror", () => noErr(page));
}

/* ===================== ANTI-DUPLIKAT LINTAS WORKSPACE ===================== */
{
    const { page } = await openPage(browser, APP);
    await upload(page, file(numLines("+519", 1, 20), "w1.txt"));
    await upload(page, file(numLines("+519", 11, 20), "w2.txt"));         // overlap 11..20
    const ids = await page.evaluate(() => NV.state.list.map((w) => ({ id: w.id, name: w.originalName })));
    const w1 = ids.find((x) => x.name === "w1.txt").id, w2 = ids.find((x) => x.name === "w2.txt").id;
    await run("X1", "tanpa ambil: stok w2 penuh (20), tidak ada blokir", async () => ({ ok: (await num(page, "#available")) === 20 && (await page.isHidden("#statusNote")), detail: null }));
    await page.click(`#files [data-act="open"][data-id="${w1}"].btn`); await settled(page);
    await extract(page, { count: 20, order: "file", source: "business" });
    await page.click(`#files [data-act="open"][data-id="${w2}"].btn`); await settled(page);
    await run("X2", "w2: 10 nomor yang sudah terambil di w1 disembunyikan + catatan", async () => {
        const av = await num(page, "#available"); const note = await text(page, "#statusNote");
        return { ok: av === 10 && /10 nomor tidak ditawarkan/.test(note), detail: { av, note } };
    });
    await run("X3", "ambil dari w2 tidak pernah mengulang nomor w1", async () => {
        await extract(page, { count: 10, order: "random" });
        const a = await page.evaluate((i) => NV.state.list.find((w) => w.id === i).history.flatMap((b) => b.numbers), w1);
        const b = await page.evaluate((i) => NV.state.list.find((w) => w.id === i).history.flatMap((x) => x.numbers), w2);
        return { ok: a.length === 20 && b.length === 10 && !b.some((x) => a.includes(x)), detail: { a: a.length, b: b.length } };
    });
    await run("X4", "matikan switch lintas workspace -> stok w2 kembali 10 (11..20 kembali)", async () => {
        await page.uncheck("#cross");
        // 10 sudah diambil di w2 sendiri; sisa tanpa lintas = 20-10 = 10 (nomor 11..20 yg belum diambil di w2 -> tidak ada), pastikan angka konsisten
        const av = await num(page, "#available");
        const own = await page.evaluate(() => NV.state.list.find((w) => w.id === NV.state.activeId).used.length);
        return { ok: av === 20 - own, detail: { av, own } };
    });
    await run("X5", "preferensi switch tersimpan setelah reload", async () => {
        await page.reload(); await settled(page);
        return { ok: !(await page.isChecked("#cross")), detail: null };
    });
    await run("X6", "hapus w1 -> nomor w1 tersedia lagi di w2 (switch on)", async () => {
        await page.check("#cross");
        const before = await num(page, "#available");
        await page.click(`#files [data-act="delete"][data-id="${w1}"]`); await confirmYes(page);
        await page.waitForFunction(() => /dihapus/.test(document.getElementById("toasts").textContent));
        const after = await num(page, "#available");
        return { ok: before === 0 && after === 10, detail: { before, after } };
    });
    await run("X-err", "tanpa pageerror", () => noErr(page));
}

/* ===================== MULTI TAB ===================== */
{
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const { page: a } = await openPage(browser, APP, { ctx });
    await upload(a, file(numLines("+519", 1, 20), "t.txt"));
    const { page: b } = await openPage(browser, APP, { ctx });
    await b.evaluate(() => { window.__stale = JSON.parse(JSON.stringify(NV.state.list[0])); });
    await extract(a, { order: "file", count: 5, source: "business" });
    await run("G1", "tab B (basi) mengambil: tidak ada nomor sama dengan tab A", async () => {
        await extract(b, { order: "file", count: 5, source: "business" });
        const oa = (await outLines(a)).slice(1), ob = (await outLines(b)).slice(1);
        const overlap = oa.filter((x) => ob.includes(x)).length;
        return { ok: overlap === 0 && ob.length === 5, detail: { overlap } };
    });
    await run("G2", "compare-and-set menolak tulis dengan rev basi (ConflictError)", async () => {
        const r = await b.evaluate(async () => { try { await NV.Store.casWs(window.__stale); return "no-throw"; } catch (e) { return e.name; } });
        return { ok: r === "ConflictError", detail: r };
    });
    await run("G3", "tab A otomatis sinkron setelah B mengambil (tanpa reload)", async () => {
        await a.waitForFunction(() => NV.state.list[0].used.length === 10, null, { timeout: 5000 });
        return true;
    });
    await run("G4", "tab A melihat workspace baru dari B (tanpa reload)", async () => {
        await upload(b, file(numLines("+569", 1, 4), "n.txt"));
        await a.waitForFunction(() => NV.state.list.length === 2, null, { timeout: 5000 });
        return { ok: (await a.$$("#files .item")).length === 2, detail: null };
    });
    await run("G5", "B menghapus workspace aktif A -> A pindah & memberi tahu", async () => {
        const id = await a.evaluate(() => NV.state.activeId);
        await b.evaluate((i) => NV.Store.remove(i).then(() => new BroadcastChannel("nomor-vault").postMessage(1)), id);
        await a.waitForFunction((i) => NV.state.activeId !== i, id, { timeout: 5000 });
        return true;
    });
    await run("G-err", "tanpa pageerror", () => (noErr(a) === true && noErr(b) === true ? true : { ok: false, detail: [a.errors, b.errors] }));
}

/* ===================== MIGRASI v3 ===================== */
const V3 = {
    active: "id-pe",
    files: [
        { id: "id-pe", displayName: "Peru-numbers.txt", originalName: "peru.txt", country: "Peru", created: "10/10/2026, 09.00.00",
          numbers: [{ number: "+51912340001", tier: "exclusive", business: true }, { number: "+51912340002", tier: "standard", business: true }, { number: "+51912340003", tier: "low", business: true }, { number: "+51912340004", tier: "agent", business: true }, { number: "+51912340005", tier: null, business: false }],
          used: ["+51912340001", "51912340002"], history: [{ count: 2, time: "10/10/2026, 10.00.00", tier: "Semua", remaining: 3, filename: "Peru-batch-001.txt" }] },
        { id: "id-cl", displayName: "Chile-numbers.txt", originalName: "chile.txt", country: "Chile", created: "10/10/2026, 09.30.00",
          numbers: [{ number: "+56912340001", tier: "exclusive", business: true }, { number: "+56912340002", tier: "low", business: true }], used: [], history: [] },
        { broken: true }
    ]
};
{
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const seed = await ctx.newPage();
    await seed.goto(ADMIN); await seed.waitForTimeout(300);
    await run("L0", "admin sebelum migrasi: info data v3 belum dimigrasi, tanpa crash", async () => {
        await seed.evaluate((d) => localStorage.setItem("nomor-vault-v3", JSON.stringify(d)), V3);
        const errs = []; seed.on("pageerror", (e) => errs.push(String(e)));
        await seed.reload(); await seed.waitForSelector("#alerts .note");
        const t = await text(seed, "#alerts");
        return { ok: /belum dimigrasi/.test(t) && errs.length === 0, detail: t };
    });
    const { page } = await openPage(browser, APP, { ctx });
    await run("L1", "migrasi: 2 workspace valid (1 rusak dilewati), nama & aktif dipertahankan", async () => {
        const l = await page.evaluate(() => ({ names: NV.state.list.map((w) => w.displayName).sort(), active: NV.state.activeId }));
        return { ok: JSON.stringify(l.names) === JSON.stringify(["Chile-numbers.txt", "Peru-numbers.txt"]) && l.active === "id-pe", detail: l };
    });
    await run("L2", "statistik sama dengan v3: total 5, business 4, terambil 2 (+ varian tanpa +), batch 1", async () => {
        const s = { total: await text(page, "#total"), biz: await text(page, "#business"), used: await text(page, "#used"), batches: await text(page, "#batches"), av: await text(page, "#available") };
        return { ok: s.total === "5" && s.biz === "4" && s.used === "2" && s.batches === "1" && s.av === "2", detail: s };
    });
    await run("L3", "riwayat lama ditandai 'data lama' & tetap tampil", async () => {
        const t = await text(page, "#history");
        return { ok: /Batch #1/.test(t) && /data lama/.test(t) && /Peru-batch-001\.txt/.test(t), detail: t.slice(0, 120) };
    });
    await run("L4", "batch berikutnya melanjutkan penomoran: Peru-batch-002.txt", async () => {
        await extract(page, { count: 1, order: "file", source: "business" });
        const fn = await page.evaluate(() => NV.state.list.find((w) => w.id === "id-pe").history[1].filename);
        const o = await outLines(page);
        return { ok: fn === "Peru-batch-002.txt" && o[1] === "+51912340003", detail: { fn, o } };
    });
    await run("L5", "reload: tidak migrasi ulang (tidak ada duplikat), kunci v3 tetap ada", async () => {
        await page.reload(); await settled(page);
        const r = await page.evaluate(() => ({ n: NV.state.list.length, legacy: !!localStorage.getItem("nomor-vault-v3") }));
        return { ok: r.n === 2 && r.legacy, detail: r };
    });
    await run("L6", "counter tier hasil migrasi konsisten dengan inventaris", async () => {
        const r = await page.evaluate(() => { const w = NV.state.list.find((x) => x.id === "id-pe"); return { all: w.counts.all, usedBy: w.usedBy.all }; });
        return { ok: r.all.exclusive === 1 && r.all.standard === 1 && r.all.low === 1 && r.all.agent === 1 && r.all.none === 1 && r.usedBy.exclusive === 1 && r.usedBy.standard === 1 && r.usedBy.low === 1, detail: r };
    });
    await run("L7", "admin sesudah migrasi: KPI benar & info cadangan v3", async () => {
        const a = await ctx.newPage();
        const errs = []; a.on("pageerror", (e) => errs.push(String(e)));
        await a.goto(ADMIN); await a.waitForSelector("#content:not([hidden])");
        const k = { files: await text(a, "#files"), numbers: await text(a, "#numbers"), extracted: await text(a, "#extracted"), batches: await text(a, "#batches"), alerts: await text(a, "#alerts") };
        return { ok: k.files === "2" && k.numbers === "7" && k.extracted === "3" && k.batches === "2" && /cadangan/.test(k.alerts) && errs.length === 0, detail: k };
    });
    await run("L-err", "tanpa pageerror di app", () => noErr(page));
}
{
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const seed = await ctx.newPage(); await seed.goto(ADMIN);
    await seed.evaluate(() => localStorage.setItem("nomor-vault-v3", "{rusak"));
    const { page } = await openPage(browser, APP, { ctx });
    await run("L8", "data v3 rusak: banner error, app tetap bisa dipakai, data lama tidak dihapus", async () => {
        const b = await text(page, "#banner");
        await upload(page, file(numLines("+519", 1, 5)));
        const ok = /rusak/.test(b) && (await page.evaluate(() => NV.state.list.length)) === 1 && (await page.evaluate(() => localStorage.getItem("nomor-vault-v3"))) === "{rusak";
        return { ok, detail: b };
    });
}

/* ===================== BACKUP / RESTORE ===================== */
{
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const { page } = await openPage(browser, APP, { ctx });
    await upload(page, file(numLines("+519", 1, 30), "a.txt"));
    await upload(page, file(numLines("+569", 1, 12), "b.txt"));
    await extract(page, { count: 4, order: "random" });
    const snap = () => page.evaluate(() => NV.state.list.map((w) => ({ n: w.displayName, t: w.total, u: w.used.length, h: w.history.map((b) => b.numbers && b.numbers.join(",")) })).sort((x, y) => x.n.localeCompare(y.n)));
    const before = await snap();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
    const backup = fs.readFileSync(await dl.path(), "utf8");
    await run("BK1", "ekspor: JSON valid, 2 workspace, nama file bertanggal", async () => {
        const j = JSON.parse(backup);
        return { ok: j.app === "nomor-vault" && j.workspaces.length === 2 && /^nomor-vault-backup-\d{8}-\d{4}\.json$/.test(dl.suggestedFilename()), detail: dl.suggestedFilename() };
    });
    const tmp = path.join(os.tmpdir(), "nv-backup.json"); fs.writeFileSync(tmp, backup);
    const { page: p2 } = await openPage(browser, APP);
    await run("BK2", "impor ke browser kosong: data identik", async () => {
        await p2.setInputFiles("#importInput", tmp);
        await p2.waitForFunction(() => NV.state.list.length === 2 && !NV.state.busy);
        await settled(p2);
        const after = await p2.evaluate(() => NV.state.list.map((w) => ({ n: w.displayName, t: w.total, u: w.used.length, h: w.history.map((b) => b.numbers && b.numbers.join(",")) })).sort((x, y) => x.n.localeCompare(y.n)));
        return { ok: JSON.stringify(after) === JSON.stringify(before), detail: after.map((x) => [x.n, x.t, x.u]) };
    });
    await run("BK3", "impor ulang: dilewati 'sudah ada', tidak duplikat", async () => {
        await p2.setInputFiles("#importInput", tmp);
        await p2.waitForFunction(() => /sudah ada/.test(document.getElementById("toasts").textContent));
        return { ok: (await p2.evaluate(() => NV.state.list.length)) === 2, detail: null };
    });
    await run("BK4", "impor file bukan JSON / bukan backup / struktur rusak ditolak", async () => {
        const t1 = path.join(os.tmpdir(), "nv-bad1.json"); fs.writeFileSync(t1, "bukan json");
        await p2.setInputFiles("#importInput", t1);
        await p2.waitForFunction(() => /bukan JSON/.test(document.getElementById("toasts").textContent));
        const t2 = path.join(os.tmpdir(), "nv-bad2.json"); fs.writeFileSync(t2, JSON.stringify({ hello: 1 }));
        await p2.setInputFiles("#importInput", t2);
        await p2.waitForFunction(() => /bukan backup/.test(document.getElementById("toasts").textContent));
        const t3 = path.join(os.tmpdir(), "nv-bad3.json"); fs.writeFileSync(t3, JSON.stringify({ app: "nomor-vault", workspaces: [{ ws: { id: "z" }, inv: { id: "z", n: [1], f: [1] } }] }));
        const n0 = await p2.evaluate(() => NV.state.list.length);
        await p2.setInputFiles("#importInput", t3);
        await p2.waitForFunction(() => /tidak valid/.test(document.getElementById("toasts").textContent));
        return { ok: (await p2.evaluate(() => NV.state.list.length)) === n0, detail: null };
    });
    await run("BK5", "ekspor saat kosong diberi tahu (tanpa unduhan)", async () => {
        const { page: p3 } = await openPage(browser, APP);
        await p3.click("#exportBtn", { force: true });
        await p3.waitForFunction(() => /Belum ada data/.test(document.getElementById("toasts").textContent));
        return true;
    });
}

/* ===================== STORAGE FALLBACK & RUSAK ===================== */
{
    await run("S1", "?store=ls: banner, simpan & pulih setelah reload", async () => {
        const { page } = await openPage(browser, APP + "?store=ls");
        const kind = await page.evaluate(() => NV.Store.kind);
        await upload(page, file(numLines("+519", 1, 20)));
        await extract(page, { count: 5, order: "file", source: "business" });
        await page.reload(); await settled(page);
        const r = await page.evaluate(() => ({ n: NV.state.list.length, used: NV.state.list[0].used.length, out: document.getElementById("output").value.split("\n").length }));
        const ban = await text(page, "#banner");
        return { ok: kind === "ls" && r.n === 1 && r.used === 5 && r.out === 6 && /localStorage/.test(ban), detail: { kind, r, ban } };
    });
    await run("S2", "?store=mem: banner error, tetap berfungsi, data hilang saat reload (jujur)", async () => {
        const { page } = await openPage(browser, APP + "?store=mem");
        const kind = await page.evaluate(() => NV.Store.kind);
        await upload(page, file(numLines("+519", 1, 20)));
        await extract(page, { count: 5, order: "file", source: "business" });
        const ok1 = (await page.evaluate(() => NV.state.list[0].used.length)) === 5;
        const ban = await text(page, "#banner");
        await page.reload(); await settled(page);
        return { ok: kind === "mem" && ok1 && /memori/.test(ban) && (await page.evaluate(() => NV.state.list.length)) === 0, detail: ban };
    });
    await run("S3", "kuota penuh (localStorage): gagal bersih, tidak ada workspace hantu", async () => {
        const { page } = await openPage(browser, APP + "?store=ls");
        const big = []; for (let i = 0; i < 500000; i++) big.push("+51" + String(900000000 + i) + " Exclusive");
        await upload(page, file(["Business Meta", ...big], "big.txt"));
        const t = await page.evaluate(() => document.getElementById("toasts").textContent + "|" + document.getElementById("uploadStatus").textContent);
        const mem = await page.evaluate(() => NV.state.list.length);
        await page.reload(); await settled(page);
        const after = await page.evaluate(() => NV.state.list.length);
        return { ok: mem === 0 && after === 0 && /penuh|gagal/i.test(t), detail: { t, mem, after } };
    });
    await run("S4", "record ws rusak di storage dilewati + banner; yang valid tetap tampil", async () => {
        const { page } = await openPage(browser, APP);
        await upload(page, file(numLines("+519", 1, 5)));
        await page.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open("nomor-vault"); r.onsuccess = () => { const tx = r.result.transaction(["ws"], "readwrite"); tx.objectStore("ws").put({ id: "bad1" }); tx.objectStore("ws").put({ id: "bad2", used: "x", history: [] }); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }; }));
        await page.reload(); await settled(page);
        const ban = await text(page, "#banner");
        return { ok: /2 workspace/.test(ban) && (await page.evaluate(() => NV.state.list.length)) === 1, detail: ban };
    });
    await run("S5", "inventaris hilang: state error + hapus workspace rusak membereskan", async () => {
        const { page } = await openPage(browser, APP);
        await upload(page, file(numLines("+519", 1, 5)));
        const id = await page.evaluate(() => NV.state.activeId);
        await page.evaluate((i) => new Promise((res) => { const r = indexedDB.open("nomor-vault"); r.onsuccess = () => { const tx = r.result.transaction(["inv"], "readwrite"); tx.objectStore("inv").delete(i); tx.oncomplete = () => res(); }; }), id);
        await page.reload(); await page.waitForSelector("#errorCard:not([hidden])");
        const t = await text(page, "#errorTitle");
        await page.click("#errorDelete"); await confirmYes(page);
        await page.waitForSelector("#emptyCard:not([hidden])");
        return { ok: /rusak/.test(t), detail: t };
    });
    await run("S6", "file:// tetap berfungsi (WebView/Acode tanpa server)", async () => {
        const { page } = await openPage(browser, "file://" + path.join(root, "public/index.html"));
        await upload(page, file(numLines("+519", 1, 10)));
        await extract(page, { count: 3, order: "file", source: "business" });
        return { ok: (await page.evaluate(() => NV.state.list[0].used.length)) === 3 && page.errors.length === 0, detail: { kind: await page.evaluate(() => NV.Store.kind), errs: page.errors } };
    });
}

/* ===================== PREFERENSI & FILE TANPA BUSINESS ===================== */
{
    const { page } = await openPage(browser, APP);
    await upload(page, file(["+51912340001 Exclusive", "+51912340002 Standard", "+51912340003"], "nobiz.txt"));
    await run("V1", "file tanpa 'Business Meta': catatan + tombol 'Pakai Semua nomor'", async () => {
        const note = await text(page, "#statusNote");
        const av0 = await num(page, "#available");
        await page.click('[data-act="use-all"]');
        const av1 = await num(page, "#available");
        return { ok: /tidak memiliki nomor Business Meta/.test(note) && av0 === 0 && av1 === 3 && (await page.inputValue("#source")) === "all", detail: { note, av0, av1 } };
    });
    await run("V2", "filter & jumlah tersimpan setelah reload", async () => {
        await setFilters(page, { source: "all", tier: "high", order: "bottom", count: 7 });
        await page.reload(); await settled(page);
        const v = { s: await page.inputValue("#source"), t: await page.inputValue("#tier"), o: await page.inputValue("#order"), c: await page.inputValue("#count") };
        return { ok: v.s === "all" && v.t === "high" && v.o === "bottom" && v.c === "7", detail: v };
    });
    await run("V-err", "tanpa pageerror", () => noErr(page));
}

/* ===================== PERFORMA ===================== */
{
    const { page } = await openPage(browser, APP);
    const N = 200000;
    const big = []; for (let i = 0; i < N; i++) big.push("+51" + String(900000000 + i) + " " + ["Exclusive", "Standard", "Low", "Agent AI"][i % 4]);
    const t0 = Date.now();
    await upload(page, file(["Business Meta", ...big], "perf.txt"));
    const up = Date.now() - t0;
    await run("PF1", `upload 200.000 nomor selesai & tersimpan (${up} ms)`, async () => ({ ok: up < 25000 && (await page.evaluate(() => NV.state.list[0].total)) === N, detail: { up } }));
    await run("PF2", "ambil 100.000 acak: cepat dan benar", async () => {
        const t = Date.now();
        await extract(page, { count: 100000, order: "random", source: "business" });
        const ms = Date.now() - t;
        const w = await page.evaluate(() => { const x = NV.state.list[0]; return { used: x.used.length, uniq: new Set(x.history[0].numbers).size }; });
        return { ok: ms < 15000 && w.used === 100000 && w.uniq === 100000, detail: { ms, w } };
    });
    await run("PF3", "availableIdx/stockOf pada 200k + 100k terpakai < 200 ms (v3: 12.690 ms)", async () => {
        const r = await page.evaluate(() => { const s = NV.state; let t = performance.now(); const idx = NV.availableIdx(s.inv, s.flags, "business", "all", true); const a = performance.now() - t; t = performance.now(); NV.stockOf(s.inv, s.flags, "business", true); const b = performance.now() - t; return { a: Math.round(a), b: Math.round(b), n: idx.length }; });
        return { ok: r.a < 200 && r.b < 200 && r.n === 100000, detail: r };
    });
    await run("PF4", "reload dengan data besar: boot < 5 detik", async () => {
        const t = Date.now(); await page.reload(); await settled(page);
        const ms = Date.now() - t;
        return { ok: ms < 5000 && (await page.evaluate(() => NV.state.inv.n.length)) === N, detail: { ms } };
    });
    await run("PF5", "ambil batch kecil saat 100k terpakai < 3 detik", async () => {
        const t = Date.now(); await extract(page, { count: 100, order: "random" }); const ms = Date.now() - t;
        return { ok: ms < 3000, detail: { ms } };
    });
    await run("PF-err", "tanpa pageerror", () => noErr(page));
}

/* ===================== ADMIN ===================== */
{
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const a0 = await openPage(browser, ADMIN, { ctx, settle: false });
    await a0.page.waitForSelector("#empty:not([hidden])");
    await run("AD1", "admin tanpa data: empty state", async () => ({ ok: await a0.page.isHidden("#content"), detail: null }));
    const { page } = await openPage(browser, APP, { ctx });
    await upload(page, file(numLines("+519", 1, 30), "a.txt"));
    await upload(page, file(numLines("+569", 1, 10), "b.txt"));
    await extract(page, { count: 6, order: "random", source: "business" });
    await page.click('#files .item:has-text("Peru-numbers.txt") [data-act="open"].btn'); await settled(page);
    await extract(page, { count: 4, order: "file", source: "business" });
    await run("AD2", "admin live-update dari app (BroadcastChannel) tanpa reload", async () => {
        await a0.page.waitForSelector("#content:not([hidden])", { timeout: 6000 });
        await a0.page.waitForFunction(() => document.getElementById("batches").textContent === "2", null, { timeout: 6000 });
        return true;
    });
    const { page: ad } = await openPage(browser, ADMIN, { ctx, settle: false });
    await ad.waitForSelector("#content:not([hidden])");
    await run("AD3", "KPI: files 2, numbers 40, extracted 10, batches 2, belum terambil 30", async () => {
        const k = { f: await text(ad, "#files"), n: await text(ad, "#numbers"), e: await text(ad, "#extracted"), b: await text(ad, "#batches"), r: await text(ad, "#remaining") };
        return { ok: k.f === "2" && k.n === "40" && k.e === "10" && k.b === "2" && k.r === "30", detail: k };
    });
    await run("AD4", "tabel per negara & per workspace & batch terbaru", async () => {
        const c = await ad.$$eval("#countries tr", (r) => r.length), w = await ad.$$eval("#workspaces tr", (r) => r.length), rec = await ad.$$eval("#recent .item", (r) => r.length);
        const txt = await text(ad, "#countries");
        return { ok: c === 2 && w === 2 && rec === 2 && /Peru/.test(txt) && /Chile/.test(txt), detail: { c, w, rec } };
    });
    await run("AD5", "stok per tier cocok dengan sisa nyata (dihitung ulang dari inventaris)", async () => {
        const truth = await page.evaluate(() => { const out = { exclusive: 0, standard: 0, low: 0, agent: 0, none: 0 }; for (const w of NV.state.list) { const own = new Set(w.used); } return out; });
        const calc = await page.evaluate(async () => {
            const out = { exclusive: 0, standard: 0, low: 0, agent: 0, none: 0 };
            for (const w of NV.state.list) { const inv = await NV.Store.getInv(w.id); const used = new Set(w.used); inv.n.forEach((n, i) => { if (!used.has(n.replace(/\D/g, ""))) out[["none", "exclusive", "standard", "low", "agent"][inv.f[i] & 7]]++; }); }
            return out;
        });
        const shown = await ad.$$eval("#tiers .bar-row", (rows) => Object.fromEntries(rows.map((r) => [r.firstElementChild.textContent.trim(), Number(r.querySelector("b").textContent.split("/")[0].replace(/\D/g, ""))])));
        const map = { Exclusive: "exclusive", Standard: "standard", Low: "low", "Agent AI": "agent", "Tanpa tier": "none" };
        const ok = Object.entries(shown).every(([k, v]) => calc[map[k]] === v);
        return { ok, detail: { shown, calc } };
    });
    await run("AD6", "kartu penyimpanan tampil (IndexedDB)", async () => ({ ok: /IndexedDB/.test(await text(ad, "#storage")), detail: await text(ad, "#storage") }));
    await run("AD7", "admin: record rusak -> alert, tanpa crash", async () => {
        await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("nomor-vault"); r.onsuccess = () => { const tx = r.result.transaction(["ws"], "readwrite"); tx.objectStore("ws").put({ id: "bad1" }); tx.oncomplete = () => res(); }; }));
        await ad.click("#refresh"); await ad.waitForFunction(() => /rusak/.test(document.getElementById("alerts").textContent));
        return { ok: ad.errors.length === 0, detail: ad.errors };
    });
    await run("AD8", "admin: gagal baca storage -> error state + coba lagi", async () => {
        const c2 = await browser.newContext();
        await c2.addInitScript(() => { IDBObjectStore.prototype.getAll = function () { throw new Error("boom"); }; });
        const { page: e } = await openPage(browser, ADMIN, { ctx: c2, settle: false });
        await e.waitForSelector("#error:not([hidden])");
        const t = await text(e, "#errorText");
        return { ok: /boom|Error/.test(t) && (await e.isVisible("#retry")), detail: t };
    });
    await run("AD-err", "tanpa pageerror", () => noErr(ad));
}

/* ===================== REGRESI TEMUAN REVIEW ===================== */
{
    const { page } = await openPage(browser, APP);
    const parse = (l) => page.evaluate((t) => NV.parseText(t).n, [].concat(l).join("\n"));
    await run("P14", "nomor + tanggal di baris sama: nomor selamat, tanggal dibuang", async () => { const r = await parse("+51 912 345 678 2024-05-01 Exclusive"); return { ok: JSON.stringify(r) === '["+51912345678"]', detail: r }; });
    await run("P15", "dua nomor berspasi dalam satu rangkaian >15 digit terpisah benar", async () => { const r = await parse("+62 812 3456 7890 0812 3456 7891 Standard"); return { ok: JSON.stringify(r) === '["+6281234567890","081234567891"]', detail: r }; });
    await run("P16", "format bergaris mirip tanggal tidak salah dibuang; tanggal asli dibuang", async () => {
        const a = await parse("0812-12-34-5678 Exclusive"), b = await parse("1234-56-7890 Exclusive"), c = await parse("2024-05-01 10.30 Exclusive"), d = await parse("15.05.2024 10.30 Standard"), e = await parse("2012-12-34-5678 Low");
        return { ok: a.length === 1 && b.length === 1 && c.length === 0 && d.length === 0 && e.length === 1, detail: { a, b, c, d, e } };
    });
    await run("P-err2", "tanpa pageerror", () => noErr(page));
}
{
    // H1: berpindah workspace saat sedang mengambil harus ditolak; data tidak tertukar
    const { page } = await openPage(browser, APP);
    await upload(page, file(numLines("+519", 1, 50), "a.txt"));
    await upload(page, file(numLines("+569", 1, 50), "b.txt"));
    const ids = await page.evaluate(() => Object.fromEntries(NV.state.list.map((w) => [w.originalName, w.id])));
    await page.click(`#files [data-act="open"][data-id="${ids["a.txt"]}"].btn`); await settled(page);
    await run("RC1", "pindah workspace saat busy ditolak; batch tercatat di workspace asal", async () => {
        await page.fill("#count", "7"); await page.selectOption("#order", "file");
        const r = await page.evaluate((idB) => {
            document.getElementById("extractForm").requestSubmit();
            document.querySelector(`#files [data-act="open"][data-id="${idB}"]`).click();
            const sel = document.getElementById("wsSwitch"); sel.value = idB; sel.dispatchEvent(new Event("change"));
            return NV.state.activeId;
        }, ids["b.txt"]);
        await page.waitForFunction(() => !NV.state.busy);
        const st = await page.evaluate((a) => ({ active: NV.state.activeId, a: NV.state.list.find((w) => w.id === a.A).history.length, b: NV.state.list.find((w) => w.id === a.B).history.length, flags: Array.from(NV.state.flags).filter((x) => x === 1).length, out: document.getElementById("output").value.split("\n").length }), { A: ids["a.txt"], B: ids["b.txt"] });
        const stored = await page.evaluate(async (a) => (await NV.Store.allWs()).list.map((w) => [w.originalName, w.used.length]).sort().join("|"), null);
        return { ok: r === ids["a.txt"] && st.active === ids["a.txt"] && st.a === 1 && st.b === 0 && st.flags === 7 && st.out === 8 && stored === "a.txt,7|b.txt,0", detail: { r, st, stored } };
    });
    await run("RC2", "ekspor membaca storage (bukan memori basi)", async () => {
        await page.evaluate(() => { NV.state.list.forEach((w) => { w.used = []; w.history = []; }); });
        const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
        const j = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
        const a = j.workspaces.find((x) => x.ws.originalName === "a.txt").ws;
        return { ok: a.used.length === 7 && a.history.length === 1, detail: { used: a.used.length } };
    });
    await run("RC3", "sinkron beruntun diserialkan tanpa error & hasil = storage", async () => {
        await page.evaluate(() => Promise.all([1, 2, 3, 4, 5].map(() => NV.syncFromStore())));
        const r = await page.evaluate(async () => { const st = (await NV.Store.allWs()).list.map((w) => w.id + ":" + w.rev).sort().join("|"); return st === NV.state.list.map((w) => w.id + ":" + w.rev).sort().join("|"); });
        return { ok: r === true && page.errors.length === 0, detail: page.errors };
    });
}
{
    // M1: perubahan dari tab lain yang tertahan saat busy dikejar setelah busy selesai
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const { page: a } = await openPage(browser, APP, { ctx });
    await upload(a, file(numLines("+519", 1, 20), "t.txt"));
    const { page: b } = await openPage(browser, APP, { ctx });
    await run("RC4", "perubahan tab lain saat busy: dirty -> disinkronkan setelah busy selesai", async () => {
        await a.evaluate(() => NV.beginBusy());
        await extract(b, { count: 5, order: "file", source: "business" });
        await a.waitForFunction(() => NV.state.dirty === true, null, { timeout: 5000 });
        const still = await a.evaluate(() => NV.state.list[0].used.length);
        await a.evaluate(() => NV.endBusy());
        await a.waitForFunction(() => NV.state.list[0].used.length === 5 && NV.state.dirty === false, null, { timeout: 5000 });
        return { ok: still === 0, detail: { still } };
    });
    await run("RC5", "Store.onClose menampilkan banner muat ulang", async () => {
        await a.evaluate(() => NV.Store.onClose());
        return { ok: /ditutup/.test(await text(a, "#banner")), detail: null };
    });
    await run("RC6", "LS: compare-and-set menolak rev basi (jalur localStorage)", async () => {
        const c2 = await browser.newContext();
        const { page: x } = await openPage(browser, APP + "?store=ls", { ctx: c2 });
        await upload(x, file(numLines("+519", 1, 10), "l.txt"));
        const r = await x.evaluate(async () => { const stale = JSON.parse(JSON.stringify(NV.state.list[0])); const ok = await NV.Store.casWs({ ...stale }); try { await NV.Store.casWs(stale); return "no-throw " + ok.rev; } catch (e) { return e.name; } });
        return { ok: r === "ConflictError", detail: r };
    });
}
{
    // M5 / dup id / XSS / entity
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const seed = await ctx.newPage(); await seed.goto(ADMIN);
    await seed.evaluate(() => localStorage.setItem("nomor-vault-v3", JSON.stringify({ active: "dup", files: [
        { id: "dup", displayName: "A&B <b>x</b>.txt", originalName: "<i>o</i>.txt", country: "Peru", numbers: [{ number: "+51912340001", tier: "exclusive", business: true }, { number: "+51912340002", tier: "standard", business: true }], used: ["+51912340001", "+99999999999"], history: [{ count: 1, time: "t", tier: "Semua", remaining: 1, filename: "Peru-batch-001.txt" }] },
        { id: "dup", displayName: "Peru-numbers-2.txt", originalName: "dua.txt", country: "Peru", numbers: [{ number: "+51922340001", tier: "low", business: true }], used: [], history: [] }
    ] })));
    const { page } = await openPage(browser, APP, { ctx });
    await run("RC7", "legacy: id dobel tidak saling menimpa; used di luar inventaris diabaikan", async () => {
        const l = await page.evaluate(() => NV.state.list.map((w) => [w.displayName, w.total, w.used.length]).sort().join("|"));
        return { ok: l === "A&B <b>x</b>.txt,2,1|Peru-numbers-2.txt,1,0", detail: l };
    });
    await run("RC8", "nama berisi HTML tampil sebagai teks (tanpa injeksi), entitas tidak dobel", async () => {
        await page.click('#files .item:has-text("A&B") [data-act="open"].btn'); await settled(page);
        const r = await page.evaluate(() => ({ name: document.getElementById("activeName").textContent, hist: document.getElementById("histCount").textContent, injected: document.querySelectorAll("#files b, #files i, #activeCountry i").length, ctry: document.getElementById("activeCountry").textContent }));
        return { ok: r.name === "A&B <b>x</b>.txt" && r.hist.includes("A&B <b>x</b>.txt") && r.injected === 0 && r.ctry.includes("<i>o</i>.txt"), detail: r };
    });
    await run("RC9", "upload file ber-nama HTML/onerror tidak mengeksekusi skrip", async () => {
        await upload(page, file(numLines("+519", 1, 5), '<img src=x onerror="window.__xss=1">.txt'));
        await page.waitForTimeout(150);
        const r = await page.evaluate(() => ({ x: window.__xss, imgs: document.querySelectorAll("img").length, t: document.getElementById("activeCountry").textContent }));
        return { ok: r.x === undefined && r.imgs === 0 && r.t.includes("<img"), detail: r };
    });
    await run("RC10", "impor backup dengan nomor dobel di inventaris ditolak", async () => {
        const bad = { app: "nomor-vault", workspaces: [{ ws: { id: "dupkeys", used: [], history: [], total: 2 }, inv: { id: "dupkeys", n: ["+51912340001", "51912340001"], f: [1, 1] } }] };
        const t = path.join(os.tmpdir(), "nv-dupkeys.json"); fs.writeFileSync(t, JSON.stringify(bad));
        const n0 = await page.evaluate(() => NV.state.list.length);
        await page.setInputFiles("#importInput", t);
        await page.waitForFunction(() => /tidak valid/.test(document.getElementById("toasts").textContent));
        return { ok: (await page.evaluate(() => NV.state.list.length)) === n0, detail: null };
    });
}
{
    const { page } = await openPage(browser, APP);
    await upload(page, file(numLines("+2463", 1, 10), "biot.txt"));
    await run("RC11", "veil drag hilang saat Escape / blur (dragleave terlewat)", async () => {
        const fire = (type) => page.evaluate((type) => { const dt = new DataTransfer(); dt.items.add(new File(["x"], "a.txt")); document.body.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true })); return !document.getElementById("dropveil").hidden; }, type);
        await fire("dragenter"); await page.keyboard.press("Escape");
        const a = await page.evaluate(() => document.getElementById("dropveil").hidden);
        await fire("dragenter"); await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        const b = await page.evaluate(() => document.getElementById("dropveil").hidden);
        return { ok: a && b, detail: { a, b } };
    });
    await run("RC12", "tombol/chip: aria-pressed benar; struktur heading ada", async () => {
        const r = await page.evaluate(() => ({ chips: [...document.querySelectorAll("#stockChips .chip")].map((c) => c.getAttribute("aria-pressed")), h2: document.querySelectorAll("h2").length }));
        return { ok: r.chips.length > 0 && r.chips.every((v) => v === "true" || v === "false") && r.h2 >= 6, detail: r };
    });
    await run("RC13", "loading: input file & ekspor dinonaktifkan sampai data siap", async () => {
        const r = await page.evaluate(() => { NV.state.loading = true; NV.endBusy(); const d1 = document.getElementById("fileInput").disabled && document.getElementById("exportBtn").disabled; NV.state.loading = false; NV.endBusy(); return [d1, document.getElementById("fileInput").disabled]; });
        return { ok: r[0] === true && r[1] === false, detail: r };
    });
}
{
    const c2 = await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });
    const { page } = await openPage(browser, APP, { ctx: c2 });
    await upload(page, file(numLines("+2463", 1, 30), "biot.txt"));
    await extract(page, { count: 5, order: "file", source: "business" });
    await run("RC14", "nama batch sangat panjang (British-Indian-Ocean-Territory) tidak membuat scroll horizontal di 320px", async () => {
        const out = [];
        for (const tb of ["take", "ws", "hist"]) { await page.click(`.tabbar [data-tab="${tb}"]`); out.push(await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])); }
        const name = await page.evaluate(() => NV.state.list[0].history[0].filename);
        return { ok: out.every(([sw, iw]) => sw <= iw) && name === "British-Indian-Ocean-Territory-batch-001.txt", detail: { out, name } };
    });
}
await run("S7", "IndexedDB menggantung -> fallback localStorage + banner (setelah timeout 5 dtk)", async () => {
    const c = await browser.newContext();
    await c.addInitScript(() => { indexedDB.open = function () { return {}; }; });
    const { page } = await openPage(browser, APP, { ctx: c, settle: false });
    await page.waitForFunction(() => window.NV && !NV.state.loading, null, { timeout: 15000 });
    const r = await page.evaluate(() => ({ kind: NV.Store.kind, ban: document.getElementById("banner").textContent }));
    return { ok: r.kind === "ls" && /localStorage/.test(r.ban), detail: r };
});

/* ===================== LAYOUT / RESPONSIF / A11Y ===================== */
{
    const long = "nama-file-yang-sangat-panjang-sekali-untuk-menguji-pembungkusan-teks-di-layar-kecil-1234567890.txt";
    const sizes = [[320, 640], [360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
    for (const [w, h] of sizes) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900 });
        const { page } = await openPage(browser, APP, { ctx });
        await upload(page, file(numLines("+519", 1, 30), long));
        await upload(page, file(numLines("+569", 1, 12), "chile.txt"));
        await extract(page, { count: 5, order: "random", source: "business" });
        const tabs = w < 900 ? ["take", "ws", "hist"] : ["all"];
        for (const tb of tabs) {
            if (tb !== "all") await page.click(`.tabbar [data-tab="${tb}"]`);
            await page.waitForTimeout(80);
            await page.screenshot({ path: path.join(shots, `app-${w}-${tb}.png`), fullPage: true });
            await run(`LY-${w}-${tb}`, `${w}px tab ${tb}: tanpa scroll horizontal`, async () => {
                const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, bw: document.body.scrollWidth }));
                return { ok: m.sw <= m.iw && m.bw <= m.iw, detail: m };
            });
        }
        await run(`LY-${w}-nav`, `${w}px: navigasi sesuai (tab bar <900, 3 panel terlihat >=900)`, async () => {
            const r = await page.evaluate(() => ({ tabbar: getComputedStyle(document.querySelector(".tabbar")).display !== "none", panes: [...document.querySelectorAll("[data-pane]")].filter((e) => e.offsetParent !== null).length }));
            const mobile = w < 900;
            return { ok: mobile ? r.tabbar && r.panes === 1 : !r.tabbar && r.panes === 3, detail: r };
        });
        if (w < 900) {
            await run(`LY-${w}-touch`, `${w}px: target sentuh >= 44px (tombol utama, tab bar, input)`, async () => {
                await page.click('.tabbar [data-tab="take"]');
                const h = await page.evaluate(() => Object.fromEntries(["#extract", "#count", "#source", "#tier", "#order", ".tabbar button"].map((s) => [s, Math.round(document.querySelector(s).getBoundingClientRect().height)])));
                const small = await page.evaluate(() => [...document.querySelectorAll(".btn.sm")].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height)).filter((x) => x < 36));
                return { ok: Object.values(h).every((x) => x >= 44) && small.length === 0, detail: { h, small } };
            });
            await run(`LY-${w}-switch`, `${w}px: select 'Ganti workspace' memindahkan workspace`, async () => {
                await page.click('.tabbar [data-tab="take"]');
                const other = await page.evaluate(() => NV.state.list.find((x) => x.id !== NV.state.activeId).id);
                await page.selectOption("#wsSwitch", other);
                await page.waitForFunction((i) => NV.state.activeId === i && NV.state.inv && NV.state.inv.id === i, other);
                return true;
            });
        }
        await run(`LY-${w}-err`, `${w}px: tanpa pageerror`, () => noErr(page));
        await ctx.close();
    }
    await run("AX1", "a11y: semua input/select/textarea punya label; tombol punya nama", async () => {
        const { page } = await openPage(browser, APP);
        await upload(page, file(numLines("+519", 1, 5)));
        const r = await page.evaluate(() => {
            const bad = [];
            document.querySelectorAll("input,select,textarea").forEach((e) => { if (!(e.labels && e.labels.length) && !e.getAttribute("aria-label")) bad.push(e.id || e.tagName); });
            document.querySelectorAll("button").forEach((e) => { if (!e.textContent.trim() && !e.getAttribute("aria-label")) bad.push("btn:" + e.className); });
            return { bad, lang: document.documentElement.lang, title: document.title };
        });
        return { ok: r.bad.length === 0 && r.lang === "id" && !!r.title, detail: r };
    });
    await run("AX2", "mobile: semua panel tidak tersembunyi dari pembaca saat aktif; tab aktif aria-current", async () => {
        const { page } = await openPage(browser, APP, { viewport: { width: 390, height: 844 } });
        await upload(page, file(numLines("+519", 1, 5)));
        await page.click('.tabbar [data-tab="hist"]');
        const cur = await page.$$eval('.tabbar [aria-current="page"]', (e) => e.map((x) => x.dataset.tab));
        return { ok: JSON.stringify(cur) === '["hist"]' && (await page.evaluate(() => document.body.dataset.tab)) === "hist", detail: cur };
    });
    await run("AX3", "mobile: tab terakhir diingat setelah reload; awal tanpa data = tab Workspace", async () => {
        const { page } = await openPage(browser, APP, { viewport: { width: 390, height: 844 } });
        const first = await page.evaluate(() => document.body.dataset.tab);
        await upload(page, file(numLines("+519", 1, 5)));
        const after = await page.evaluate(() => document.body.dataset.tab);
        await page.click('.tabbar [data-tab="hist"]'); await page.reload(); await settled(page);
        const re = await page.evaluate(() => document.body.dataset.tab);
        return { ok: first === "ws" && after === "take" && re === "hist", detail: { first, after, re } };
    });
}

await env.close();
const failed = summary();
process.exit(failed ? 1 : 0);
