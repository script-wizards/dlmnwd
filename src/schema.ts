// Data shapes for the game content under ./data (user-supplied, gitignored)
// and ./data.sample (invented, non-canon, committed so the tool runs).

export interface Kindred {
  id: string;
  name: string;
  nativeLanguages: string[];
  names?: {
    first?: string[];
    surname?: string[];
    [field: string]: string[] | undefined;
  };
  /** Persona tables: field name -> options to roll on (demeanour, face, dress, ...) */
  persona?: Record<string, string[]>;
}

export interface Monster {
  id: string;
  name: string;
  description?: string; // the flavour subtitle between the name and the stat block
  parent?: string; // for a secondary stat block (e.g. a mount/spawn/variant), the primary entry it belongs to
  level?: number;
  category?: string; // size and type
  intelligence?: string; // intelligence category
  page?: number; // source PDF page, for `dw mon --open`
  ac?: number;
  hd?: string;
  attacks?: string;
  movement?: string;
  saves?: string;
  morale?: number;
  alignment?: string;
  xp?: number;
  numberAppearing?: string;
  treasure?: string;
  special?: string[];
  notes?: string;
}

export interface Hex {
  id: string;
  name?: string;
  page?: number; // source PDF page, for `dw hex --open`
  region?: string;
  terrain?: string;
  lostEncounters?: string;
  foraging?: string;
  entry: string;
  links?: string[];
}

export interface EncounterRow {
  /** A single number ("5") or inclusive range ("1-2") matched against the die roll. */
  roll: string;
  monster: string;
  note?: string;
}

export interface EncounterTable {
  region: string;
  /** Dice expression to roll on this table, e.g. "1d6". */
  die: string;
  results: EncounterRow[];
}

export interface Spell {
  name: string;
  tradition?: "Arcane" | "Holy" | "Fairy";
  rank?: number;
  prayerName?: string; // some Holy spells carry a named prayer
  duration?: string;
  range?: string;
  body: string;
  source: { book: string; page: number };
}

export interface Data {
  dir: string;
  kindreds: Map<string, Kindred>;
  monsters: Map<string, Monster>;
  hexes: Map<string, Hex>;
  encounters: Map<string, EncounterTable>;
}
