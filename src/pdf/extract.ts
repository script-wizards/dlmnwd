import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR = join(homedir(), ".cache", "dw");

/**
 * Extract every page of a PDF as plain text (column layout preserved), one
 * string per page. Cached locally by file size + mtime so repeat runs are
 * instant. The cache is derived from the user's own PDF and never committed.
 */
export function extractPages(pdfPath: string): string[] {
  const st = statSync(pdfPath);
  const cacheFile = join(CACHE_DIR, `${hashKey(`${pdfPath}:${st.size}:${st.mtimeMs}`)}.json`);
  if (existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, "utf8")) as string[];
  }

  const out = spawnSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (out.error) {
    throw new Error(`Could not run pdftotext (install poppler?): ${out.error.message}`);
  }
  if (out.status !== 0) {
    throw new Error(`pdftotext failed: ${out.stderr}`);
  }

  const pages = out.stdout.split("\f");
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(pages));
  return pages;
}

// Small stable FNV-1a hash for cache filenames.
function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
