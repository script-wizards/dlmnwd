// Inline the bundled JS and CSS into one self-contained HTML file, so the
// generator can be shared as a single .html that still parses PDFs offline
// (pdf.js runs on the main thread; see web/main.ts). Run after `bun build`.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
const out = join(dist, "dlmnwd.html");

let html = readFileSync(join(dist, "index.html"), "utf8");

// Inline the stylesheet, failing if any font url() is still external (Bun
// normally folds them to data URIs).
html = html.replace(
  /<link\b[^>]*rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/g,
  (_m, file: string) => {
    const css = readFileSync(join(dist, file), "utf8");
    const external = css.match(/url\(\s*["']?(?!data:)[^)]+\)/g);
    if (external) throw new Error(`CSS references external assets: ${external.join(", ")}`);
    return `<style>\n${css}\n</style>`;
  },
);

// Inline the module script; escape "</script>" so it can't close the tag early.
html = html.replace(
  /<script\b[^>]*src="\.?\/?([^"]+\.js)"[^>]*><\/script>/g,
  (_m, file: string) => {
    const js = readFileSync(join(dist, file), "utf8").replaceAll("</script>", "<\\/script>");
    return `<script type="module">\n${js}\n</script>`;
  },
);

if (/<link\b[^>]*rel="stylesheet"|<script\b[^>]*\bsrc=/.test(html)) {
  throw new Error("single-file build still links an external script or stylesheet");
}

writeFileSync(out, html);
console.log(`wrote ${out} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
