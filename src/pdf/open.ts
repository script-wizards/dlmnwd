import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * First available image opener. Honors $DW_OPEN, then prefers a native viewer
 * over an X server (fast) to a generic opener. On WSL `xdg-open` is typically
 * `wslview`, which cold-starts a Windows app and is slow; set $DW_OPEN (e.g.
 * `feh`, `display`) to force a faster native viewer over your X server.
 */
function imageOpener(): string | null {
  const hasDisplay = Boolean(process.env.DISPLAY);
  const candidates = [
    process.env.DW_OPEN,
    process.platform === "darwin" ? "open" : null,
    hasDisplay ? "feh" : null,
    hasDisplay ? "imv" : null,
    hasDisplay ? "nsxiv" : null,
    hasDisplay ? "sxiv" : null,
    hasDisplay ? "display" : null,
    "xdg-open",
    "wslview",
  ].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    if (Bun.which(c)) return c;
  }
  return null;
}

/**
 * Render a single PDF page to a PNG and open it in a detached viewer. Shows the
 * exact page (full art and text) independent of the user's PDF viewer. Returns
 * false if no opener was found or rendering failed (e.g. poppler missing), so
 * the caller can fall back to text.
 */
export function openPdfPage(pdfPath: string, page: number): boolean {
  const opener = imageOpener();
  if (!opener) return false;

  const prefix = join(tmpdir(), `dw-${page}`);
  const render = spawnSync(
    "pdftoppm",
    ["-png", "-singlefile", "-r", "160", "-f", String(page), "-l", String(page), pdfPath, prefix],
    { stderr: "inherit" },
  );
  if (render.status !== 0) return false;

  // Launch detached and don't wait: a native viewer (feh/display) would
  // otherwise block the CLI until its window closed.
  try {
    Bun.spawn([opener, `${prefix}.png`], { stdout: "ignore", stderr: "ignore" }).unref();
  } catch {
    return false;
  }
  return true;
}
