// Read the filled-in values of a fillable PDF form (e.g. a character sheet) via
// pdf.js. Bytes in, field name → value out, so it runs the same in Bun and in
// the browser.

export async function readFormFields(bytes: Uint8Array): Promise<Record<string, string>> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  const objects = (await doc.getFieldObjects()) as Record<string, { value?: unknown }[]> | null;
  await task.destroy();
  const out: Record<string, string> = {};
  for (const [name, widgets] of Object.entries(objects ?? {})) {
    const v = widgets.find((w) => w.value !== undefined && w.value !== "")?.value;
    if (v !== undefined && v !== null) out[name] = String(v);
  }
  return out;
}
