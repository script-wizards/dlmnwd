// Prototype: does the pdf.js layout emulator reproduce `pdftotext -layout` well
// enough that the existing parsers produce the SAME structured output?
//
// Ground truth = pdftotext on the real Player's Book. Candidate = emulate.ts.
// We run parseClasses + parseKindreds on both and diff. Parser-output equality
// is the real success metric; per-page text similarity is reported for context.
//
//   bun run proto/layout-check.ts

import { readFileSync } from "node:fs";
import { pdfPath } from "../src/pdf/config.ts";
import { extractPagesEmulated } from "../src/pdf/emulate.ts";
import { extractPages } from "../src/pdf/extract.ts";
import { parseClasses } from "../src/parse/class.ts";
import { discoverKindreds, parseKindreds } from "../src/parse/kindred.ts";

const PDF = pdfPath("players");

function diff(label: string, a: unknown, b: unknown): boolean {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa === sb) {
    console.log(`  ✓ ${label}`);
    return true;
  }
  console.log(`  ✗ ${label}`);
  console.log(`      pdftotext: ${sa}`);
  console.log(`      emulated : ${sb}`);
  return false;
}

const ground = extractPages(PDF); // pdftotext -layout, the reference renderer
const emulated = await extractPagesEmulated(new Uint8Array(readFileSync(PDF)));

console.log(`pages: pdftotext=${ground.length} emulated=${emulated.length}\n`);

console.log("=== CLASSES ===");
const gClasses = parseClasses(ground);
const eClasses = parseClasses(emulated);
console.log(`count: pdftotext=${gClasses.length} emulated=${eClasses.length}`);
let classPass = 0;
for (const gc of gClasses) {
  const ec = eClasses.find((c) => c.id === gc.id);
  if (diff(gc.name, gc, ec)) classPass++;
}

console.log("\n=== KINDREDS ===");
// Both sides run against the same rules, discovered from the ground-truth text
// the way the real pipeline discovers them, so the diff isolates the renderer.
const RULES = discoverKindreds(ground);
const gKin = parseKindreds(ground, RULES);
const eKin = parseKindreds(emulated, RULES);
console.log(`count: pdftotext=${gKin.length} emulated=${eKin.length}`);
let kinPass = 0;
for (const gk of gKin) {
  const ek = eKin.find((k) => k.id === gk.id);
  if (diff(gk.name, gk, ek)) kinPass++;
}

console.log(
  `\n=== SUMMARY ===\nclasses: ${classPass}/${gClasses.length}   kindreds: ${kinPass}/${gKin.length}`,
);
