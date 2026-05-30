// A standalone mock page for iterating on the sheet UI without loading a PDF.
// The demo character data lives in demo.ts, shared with the main app.
import { renderSheet } from "./sheet.ts";
import { demoCharacter } from "./demo.ts";

renderSheet(document.getElementById("sheet") as HTMLElement, demoCharacter);
