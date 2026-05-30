import { spawnSync } from "node:child_process";

export interface Bookmark {
  id: string;
  name: string;
}

/**
 * Hex bookmarks ("NNNN Name") from the PDF outline, via mutool. These are the
 * authoritative list of hexes (every one is bookmarked, with a clean name).
 * Returns [] if mutool is unavailable, so callers fall back to text parsing.
 */
export function hexBookmarks(pdfPath: string): Bookmark[] {
  const out = spawnSync("mutool", ["show", pdfPath, "outline"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (out.status !== 0 || !out.stdout) return [];

  const marks: Bookmark[] = [];
  for (const m of out.stdout.matchAll(/"(\d{4})\s+([^"]+)"/g)) {
    marks.push({ id: m[1], name: m[2].trim() });
  }
  return marks;
}
