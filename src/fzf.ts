/** True when an interactive fzf picker can run (fzf installed, output is a TTY). */
export function canPick(): boolean {
  return Boolean(process.stdout.isTTY) && Bun.which("fzf") !== null;
}

/**
 * Run fzf over the given lines with a live preview, returning the selected line
 * (or null if cancelled). `previewCmd` is an fzf preview template, e.g.
 * "dw mon {}" or "dw hex {1}". `extraArgs` passes extra fzf flags (e.g. a
 * "--delimiter" for tab-separated rows whose first field is the real value).
 */
export function pickWithFzf(
  lines: string[],
  previewCmd: string,
  extraArgs: string[] = [],
): string | null {
  const res = Bun.spawnSync(
    [
      "fzf",
      "--reverse",
      "--height=90%",
      ...extraArgs,
      "--preview",
      previewCmd,
      "--preview-window=right:62%:wrap",
    ],
    {
      stdin: Buffer.from(`${lines.join("\n")}\n`),
      stdout: "pipe",
      stderr: "inherit",
      // Clear the user's FZF_DEFAULT_OPTS so a personal "--preview-window=hidden"
      // (or a custom --preview) can't suppress our live preview.
      env: { ...process.env, FZF_DEFAULT_OPTS: "" },
    },
  );
  const out = res.stdout.toString().trim();
  return out.length > 0 ? out : null;
}
