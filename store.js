/* ===== STORE: dipakai bersama aplikasi & admin (disisipkan oleh dev/build.mjs, jangan diubah di hasil build) ===== */
const NV_DB = "nomor-vault";
const NV_LS = "nvault:";
const TIER_KEYS = ["exclusive", "standard", "low", "agent", "none"];
const CODE_TIER = ["none", "exclusive", "standard", "low", "agent"];

const toInt = (x, d = 0) => { x = Number(x); return Number.isFinite(x) ? Math.trunc(x) : d; };
const isQuota = (e) => !!e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014);

function zeroTiers() { return { exclusive: 0, standard: 0, low: 0, agent: 0, none: 0 }; }
function cleanTiers(c) {
    const o = zeroTiers();
    if (c && typeof c === "object") for (const k of TIER_KEYS) o[k] = Math.max(0, toInt(c[k]));
    return o;
}

/* Validasi satu batch riwayat. Data rusak dinormalkan, bukan menyebabkan crash. */
function cleanBatch(b) {
    if (!b || typeof b !== "object") return null;
    const str = (v) => (typeof v === "string" ? v : null);
    return {
        n: Math.max(1, toInt(b.n, 1)),
        ts: str(b.ts),
        time: str(b.time),
        count: Math.max(0, toInt(b.count)),
        source: str(b.source),
        tier: str(b.tier),
        tierLabel: str(b.tierLabel),
        order: str(b.order),
        remaining: b.remaining == null ? null : toInt(b.remaining),
        remainingTotal: b.remainingTotal == null ? null : toInt(b.remainingTotal),
        filename: str(b.filename) || "batch.txt",
        numbers: Array.isArray(b.numbers) ? b.numbers.filter((x) => typeof x === "string") : null
    };
}

/* Validasi record workspace. Return null jika tidak bisa dipakai. */
function sanitizeWs(r) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id) return null;
    if (!Array.isArray(r.used) || !Array.isArray(r.history)) return null;
    const history = r.history.map(cleanBatch).filter(Boolean);
    const countries = {};
    if (r.countries && typeof r.countries === "object") {
        for (const k of Object.keys(r.countries)) countries[k] = Math.max(0, toInt(r.countries[k]));
    }
    const strOr = (v, d) => (typeof v === "string" && v ? v : d);
    return {
        id: r.id,
        displayName: strOr(r.displayName, "Workspace"),
        batchBase: strOr(r.batchBase, "Unknown"),
        originalName: strOr(r.originalName, "-"),
        country: strOr(r.country, "Unknown"),
        countries,
        created: typeof r.created === "string" ? r.created : null,
        createdText: typeof r.createdText === "string" ? r.createdText : null,
        updated: typeof r.updated === "string" ? r.updated : null,
        rev: Math.max(1, toInt(r.rev, 1)),
        total: Math.max(0, toInt(r.total)),
        stats: r.stats && typeof r.stats === "object" ? r.stats : null,
        counts: { all: cleanTiers(r.counts && r.counts.all), biz: cleanTiers(r.counts && r.counts.biz) },
        usedBy: { all: cleanTiers(r.usedBy && r.usedBy.all), biz: cleanTiers(r.usedBy && r.usedBy.biz) },
        used: r.used.filter((x) => typeof x === "string"),
        nextBatch: Math.max(history.length + 1, toInt(r.nextBatch, 1)),
        history
    };
}

/*
 * Lapisan penyimpanan.
 * Prioritas: IndexedDB -> localStorage -> memori.
 * Kolom `rev` dipakai sebagai compare-and-set agar dua tab tidak saling menimpa.
 */
const Store = (() => {
    let kind = "mem";
    let idb = null;
    const mem = { ws: new Map(), inv: new Map(), kv: new Map() };
    const ls = () => window.localStorage;
    const conflict = () => Object.assign(new Error("conflict"), { name: "ConflictError" });
    /* Kunci lintas tab (jika browser mendukung) agar read-check-write di localStorage tidak berpacu. */
    const withLock = (name, fn) => (typeof navigator !== "undefined" && navigator.locks && navigator.locks.request
        ? navigator.locks.request("nomor-vault:" + name, fn)
        : fn());
    const api = { onClose: null };
    const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const keyOf = (store, rec) => (store === "kv" ? rec.k : rec.id);

    function idbRun(stores, mode, fn) {
        return new Promise((resolve, reject) => {
            let out;
            const tx = idb.transaction(stores, mode);
            tx.oncomplete = () => resolve(out);
            tx.onabort = () => reject(tx.error || new Error("transaksi dibatalkan"));
            try { out = fn(tx); } catch (e) { try { tx.abort(); } catch (_) { /* sudah selesai */ } reject(e); }
        });
    }

    async function open(force) {
        const want = force || new URLSearchParams(location.search).get("store");
        if (want === "mem") { kind = "mem"; return kind; }
        if (want !== "ls" && typeof indexedDB !== "undefined" && indexedDB) {
            let timer;
            const opening = new Promise((res, rej) => {
                const r = indexedDB.open(NV_DB, 1);
                r.onupgradeneeded = () => {
                    const d = r.result;
                    d.createObjectStore("ws", { keyPath: "id" });
                    d.createObjectStore("inv", { keyPath: "id" });
                    d.createObjectStore("kv", { keyPath: "k" });
                };
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
                r.onblocked = () => rej(new Error("IndexedDB diblokir"));
            });
            try {
                idb = await Promise.race([
                    opening,
                    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("IndexedDB timeout")), 5000); })
                ]);
                clearTimeout(timer);
                const closed = () => { try { idb.close(); } catch (_) { /* sudah tertutup */ } if (api.onClose) api.onClose(); };
                idb.onversionchange = closed;
                idb.onclose = closed;
                kind = "idb";
                return kind;
            } catch (e) {
                clearTimeout(timer);
                // koneksi yang terlambat jadi harus ditutup supaya tidak menggantung
                opening.then((d) => { try { d.close(); } catch (_) { /* abaikan */ } }, () => { /* sudah ditangani */ });
                console.warn("IndexedDB tidak tersedia, pakai localStorage:", e);
                idb = null;
            }
        }
        try {
            ls().setItem(NV_LS + "probe", "1");
            ls().removeItem(NV_LS + "probe");
            kind = "ls";
        } catch (_) { kind = "mem"; }
        return kind;
    }

    async function rawAll(store) {
        if (kind === "idb") {
            const st = idb.transaction([store], "readonly").objectStore(store);
            if (st.getAll) return reqP(st.getAll());
            return new Promise((res, rej) => {
                const out = [];
                const c = st.openCursor();
                c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } else res(out); };
                c.onerror = () => rej(c.error);
            });
        }
        if (kind === "ls") {
            const out = [];
            const pre = NV_LS + store + ":";
            for (let i = 0; i < ls().length; i++) {
                const k = ls().key(i);
                if (k && k.startsWith(pre)) { try { out.push(JSON.parse(ls().getItem(k))); } catch (_) { out.push(null); } }
            }
            return out;
        }
        return [...mem[store].values()].map((v) => JSON.parse(JSON.stringify(v)));
    }

    async function rawGet(store, key) {
        if (kind === "idb") return reqP(idb.transaction([store], "readonly").objectStore(store).get(key));
        if (kind === "ls") { const s = ls().getItem(NV_LS + store + ":" + key); return s == null ? undefined : JSON.parse(s); }
        const v = mem[store].get(key);
        return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    }

    async function rawPutMany(items) {
        if (kind === "idb") {
            const stores = [...new Set(items.map((x) => x[0]))];
            return idbRun(stores, "readwrite", (tx) => { for (const [s, r] of items) tx.objectStore(s).put(r); });
        }
        if (kind === "ls") {
            const done = [];
            try {
                for (const [s, r] of items) {
                    const k = NV_LS + s + ":" + keyOf(s, r);
                    const prev = ls().getItem(k);
                    ls().setItem(k, JSON.stringify(r));
                    done.push([k, prev]);
                }
            } catch (e) {
                for (const [k, prev] of done.reverse()) { try { prev == null ? ls().removeItem(k) : ls().setItem(k, prev); } catch (_) { /* best effort */ } }
                throw e;
            }
            return;
        }
        for (const [s, r] of items) mem[s].set(keyOf(s, r), JSON.parse(JSON.stringify(r)));
    }

    async function allWs() {
        const raw = await rawAll("ws");
        const list = [];
        let bad = 0;
        for (const r of raw) { const w = sanitizeWs(r); if (w) list.push(w); else bad++; }
        return { list, bad };
    }

    async function getInv(id) {
        const r = await rawGet("inv", id);
        if (!r || !Array.isArray(r.n) || !Array.isArray(r.f) || r.n.length !== r.f.length) return null;
        for (let i = 0; i < r.n.length; i++) {
            if (typeof r.n[i] !== "string" || !Number.isInteger(r.f[i]) || r.f[i] < 0 || r.f[i] > 12) return null;
        }
        return { id, n: r.n, f: r.f };
    }

    /* Simpan workspace baru + inventarisnya secara atomik. */
    function putNew(ws, inv) { return rawPutMany([["inv", inv], ["ws", ws]]); }

    /* Compare-and-set: ws.rev harus sama dengan rev di storage. Return record baru (rev+1). */
    async function casWs(ws) {
        const expect = ws.rev;
        const next = { ...ws, rev: expect + 1 };
        if (kind === "idb") {
            return new Promise((resolve, reject) => {
                const tx = idb.transaction(["ws"], "readwrite");
                const st = tx.objectStore("ws");
                let bad = false;
                tx.oncomplete = () => resolve(next);
                tx.onabort = () => reject(bad ? conflict() : tx.error || new Error("transaksi dibatalkan"));
                const g = st.get(ws.id);
                g.onsuccess = () => {
                    const cur = g.result;
                    if (!cur || toInt(cur.rev, 1) !== expect) { bad = true; tx.abort(); } else st.put(next);
                };
            });
        }
        return withLock("cas", async () => {
            const cur = await rawGet("ws", ws.id);
            if (!cur || toInt(cur.rev, 1) !== expect) throw conflict();
            await rawPutMany([["ws", next]]);
            return next;
        });
    }

    async function remove(id) {
        if (kind === "idb") return idbRun(["ws", "inv"], "readwrite", (tx) => { tx.objectStore("ws").delete(id); tx.objectStore("inv").delete(id); });
        if (kind === "ls") { ls().removeItem(NV_LS + "ws:" + id); ls().removeItem(NV_LS + "inv:" + id); return; }
        mem.ws.delete(id); mem.inv.delete(id);
    }

    async function getKv(k) { const r = await rawGet("kv", k); return r ? r.v : undefined; }
    function setKv(k, v) { return rawPutMany([["kv", { k, v }]]); }

    async function estimate() {
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const e = await navigator.storage.estimate();
                return { usage: e.usage || 0, quota: e.quota || 0 };
            }
        } catch (_) { /* tidak didukung */ }
        return null;
    }
    async function persist() {
        try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (_) { /* abaikan */ }
        return false;
    }
    async function persisted() {
        try { if (navigator.storage && navigator.storage.persisted) return await navigator.storage.persisted(); } catch (_) { /* abaikan */ }
        return false;
    }

    Object.assign(api, { open, allWs, getInv, putNew, casWs, remove, getKv, setKv, estimate, persist, persisted, lock: withLock });
    Object.defineProperty(api, "kind", { get: () => kind });
    return api;
})();
/* ===== END STORE ===== */
