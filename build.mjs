// Merakit public/index.html dan admin/index.html dari src/*.html + src/store.js.
// Hasil build berdiri sendiri (tanpa file lain) supaya aman dibuka dari Acode/WebView.
// Jalankan: node dev/build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = fs.readFileSync(path.join(root, "src/store.js"), "utf8").trimEnd();
const MARK = "/*@@STORE@@*/";

for (const [src, out] of [["src/app.html", "public/index.html"], ["src/admin.html", "admin/index.html"]]) {
    const tpl = fs.readFileSync(path.join(root, src), "utf8");
    if (!tpl.includes(MARK)) throw new Error(`${src}: penanda ${MARK} tidak ditemukan`);
    const html = tpl.replace(MARK, () => store);
    fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
    fs.writeFileSync(path.join(root, out), html);
    console.log(`${out}  ${(html.length / 1024).toFixed(1)} KB`);
}
