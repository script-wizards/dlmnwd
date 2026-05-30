import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Data, EncounterTable, Hex, Kindred, Monster } from "./schema.ts";

// Repo root, derived from this module's location, so the data directory resolves
// regardless of the current working directory.
const REPO_ROOT = join(import.meta.dir, "..");

/**
 * Resolve the active data directory. Real (book-derived) content lives in
 * ./data (gitignored). ./data.sample is the committed, invented fallback so
 * the tool runs with no copyrighted material present.
 */
function resolveDir(): string {
  const candidates = [
    process.env.DW_DATA,
    "data",
    join(REPO_ROOT, "data"),
    join(REPO_ROOT, "data.sample"),
  ].filter((d): d is string => Boolean(d));
  for (const dir of candidates) if (existsSync(dir)) return dir;
  throw new Error("No data directory found. Set DW_DATA, or create ./data (see README).");
}

function loadCategory<T>(dir: string, category: string, key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  const path = join(dir, category);
  if (!existsSync(path)) return map;
  for (const file of readdirSync(path)) {
    if (!file.endsWith(".json")) continue;
    const item = JSON.parse(readFileSync(join(path, file), "utf8")) as T;
    map.set(key(item), item);
  }
  return map;
}

export function loadData(): Data {
  const dir = resolveDir();
  return {
    dir,
    kindreds: loadCategory<Kindred>(dir, "kindreds", (k) => k.id),
    monsters: loadCategory<Monster>(dir, "monsters", (m) => m.id),
    hexes: loadCategory<Hex>(dir, "hexes", (h) => h.id),
    encounters: loadCategory<EncounterTable>(dir, "encounters", (e) => e.region),
  };
}
