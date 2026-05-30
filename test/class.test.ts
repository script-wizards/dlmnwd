import { expect, test } from "bun:test";
import { parseClasses } from "../src/parse/class.ts";

// Place text at fixed column offsets to mimic pdftotext -layout output.
function at(cols: [number, string][]): string {
  let line = "";
  for (const [x, text] of cols) {
    if (line.length < x) line += " ".repeat(x - line.length);
    line += text;
  }
  return line;
}

const thiefPage = [
  "Thief",
  "",
  "Prime Abilities        Dexterity",
  "Hit Points             1d4 per Level, +2 after Level 9",
  "Combat Aptitude        Semi-martial",
  "Armour                 Light, no shields",
  "Weapons                Small and Medium",
  "",
  "Level     XP      Hit Points    Attack    Doom    Ray    Hold    Blast    Spell",
  "1         0       1d4           +0        11      17     12      19       16",
  "2         1,450   +1d4          +0        11      17     12      19       16",
  "",
  "                    THIEF SKILL TARGETS",
  "Level     Stalking    Tracking    Stealth",
  "1         6           5           5            The Skill Targets table lists...",
  "2         6           5           4",
].join("\n");

test("parses a class stat block and level-1 advancement row", () => {
  const classes = parseClasses([thiefPage]);
  expect(classes.length).toBe(1);
  const c = classes[0];

  expect(c.id).toBe("thief");
  expect(c.hitDie).toBe("1d4");
  expect(c.armour).toBe("Light, no shields");
  expect(c.weapons).toBe("Small and Medium");
  expect(c.primeAbilities).toEqual(["dex"]);
  expect(c.attack).toBe(0);
  expect(c.saves).toEqual({ doom: 11, ray: 17, hold: 12, blast: 19, spell: 16 });
  // Trailing prose after the values is ignored (stops at the first non-number).
  expect(c.skills).toEqual({ Stalking: 6, Tracking: 5, Stealth: 5 });
});

test("reads a 2-up skill table, keeping only the levels 1-5 block", () => {
  // Levels 1-5 and 6-10 sit side by side; only the left block holds level 1.
  // Class name is a structural lookup key; the skill table is invented.
  const twoUpPage = [
    "Enchanter",
    "Prime Abilities        Wisdom",
    "Hit Points             1d6 per Level",
    "Armour                 Any",
    "Weapons                Any",
    "Level   XP   Hit Points   Attack   Doom   Ray   Hold   Blast   Spell",
    "1       0    1d6          +0       10     18     9     20      15",
    "",
    "               ENCHANTER SKILL TARGETS",
    "         Level     Sensing      Level     Sensing",
    "            1          5           6          4",
    "            2          5           7          3",
  ].join("\n");
  const c = parseClasses([twoUpPage])[0];
  expect(c.skills).toEqual({ Sensing: 5 });
});

test("rebuilds wrapped and side-by-side skill labels from header geometry", () => {
  // "Read Runes" wraps across two header lines; "Deep Lore" is two words on one.
  const wrappedPage = [
    "Bard",
    "Prime Abilities        Intelligence",
    "Hit Points             1d4 per Level",
    "Armour                 None",
    "Weapons                Staff",
    "Level   XP   Hit Points   Attack   Doom   Ray   Hold   Blast   Spell",
    "1       0    1d4          +0       11     17    12     19      16",
    "",
    "             BARD SKILL TARGETS",
    "  Level      Read                 Deep Lore",
    "             Runes",
    "     1         4                      6",
  ].join("\n");
  const c = parseClasses([wrappedPage])[0];
  expect(c.skills).toEqual({ "Read Runes": 4, "Deep Lore": 6 });
});

test("recovers a skill table whose data row is glued to facing prose", () => {
  // A class with the skill table in the right column; left-column body text bleeds
  // onto the same lines, so the table is only readable after a column split.
  const bleedPage = [
    "Hunter",
    at([[0, "Prime Abilities        Dexterity"]]),
    at([[0, "Hit Points             1d6 per Level"]]),
    at([[0, "Armour                 Light"]]),
    at([[0, "Weapons                Any"]]),
    at([[0, "Level   XP   Hit Points   Attack   Doom   Ray   Hold   Blast   Spell"]]),
    at([[0, "1       0    1d6          +0       10     18     9     20      15"]]),
    "",
    at([[50, "HUNTER SKILL TARGETS"]]),
    at([[50, "Level    Foraging    Climbing"]]),
    at([
      [0, "Class items: a coil of rope and a tin whistle."],
      [50, "1           5           4"],
    ]),
  ].join("\n");
  const c = parseClasses([bleedPage])[0];
  expect(c.skills).toEqual({ Foraging: 5, Climbing: 4 });
});

test("parses class trait names and descriptions from all-caps run-in headers", () => {
  const traitPage = [
    "Knight",
    "Prime Abilities  Wisdom",
    "Hit Points  1d6 per Level",
    "Armour  Any",
    "Weapons  Any",
    "Level  XP  Attack  Doom  Ray  Hold  Blast  Spell",
    "1  0  +0  10  18   9  20  15",
    "",
    at([
      [0, "Wardens patrol the woods,"],
      [55, "WATCHFUL EYE"],
    ]),
    at([
      [0, "watching the old paths."],
      [55, "A warden cannot be surprised in a"],
    ]),
    at([[55, "woodland setting."]]),
    at([[55, "STARTING EQUIPMENT"]]),
    at([[55, "Roll 1d6 for a starting trinket."]]),
    at([[55, "GREEN TONGUE"]]),
    at([[55, "A warden may speak with woodland beasts."]]),
  ].join("\n");
  const c = parseClasses([traitPage])[0];
  expect(c.traits.map((t) => t.name)).toEqual(["Watchful Eye", "Green Tongue"]);
  // A section title (STARTING EQUIPMENT) closes the trait; its prose does not bleed in.
  expect(c.traits[0].text).toBe("A warden cannot be surprised in a woodland setting.");
  expect(c.traits.map((t) => t.name)).not.toContain("Starting Equipment");
});

test("maps saves by header even when an extra column is present", () => {
  // Friars insert an "AC Bonus" column between Attack and Doom.
  const friar = [
    "Friar",
    "Prime Abilities        Intelligence and Wisdom",
    "Hit Points             1d4 per Level",
    "Armour                 None",
    "Weapons                Club, dagger, sling, staff",
    "Level   XP   Hit Points   Attack   AC Bonus   Doom   Ray   Hold   Blast   Spell",
    "1       0    1d4          +0       +2         19     14    17     10      13",
  ].join("\n");
  const c = parseClasses([friar])[0];
  expect(c.saves).toEqual({ doom: 19, ray: 14, hold: 17, blast: 10, spell: 13 });
  expect(c.primeAbilities).toEqual(["int", "wis"]); // "Intelligence and Wisdom"
});

// A class page with a Starting Equipment section in the right column.
const equipPage = [
  "Fighter",
  "Prime Abilities        Strength",
  "Hit Points             1d8 per Level",
  "Armour                 Any",
  "Weapons                Any",
  "Level   XP   Hit Points   Attack   Doom   Ray   Hold   Blast   Spell",
  "1       0    1d8          +1       10     18     9     20      15",
  "2       2,350   +1d8     +1       10     18     9     20      15",
  "",
  at([[50, "Starting Equipment"]]),
  at([[50, "Armour (roll 1d6): 1. Quilted. 2. Quilted + shield. 3. Ringmail."]]),
  at([[50, "4. Ringmail + shield. 5. Scale. 6. Scale + shield."]]),
  at([[50, "Weapons (roll 1d6 twice): 1. Sword. 2. Dagger. 3. Mace."]]),
  at([[50, "4. Spear. 5. Bow. 6. Axe."]]),
  at([[50, "Class items: Shield."]]),
].join("\n");

test("parses starting equipment with armour, weapons, and class items", () => {
  const c = parseClasses([equipPage])[0];
  expect(c.startingEquipment).not.toBeNull();
  const se = c.startingEquipment!;
  expect(se.armour.length).toBe(6);
  expect(se.armour[0]).toEqual({ roll: "1", item: "Quilted" });
  expect(se.armour[2]).toEqual({ roll: "3", item: "Ringmail" });
  expect(se.weapons.length).toBe(6);
  expect(se.weapons[0]).toEqual({ roll: "1", item: "Sword" });
  expect(se.classItems).toEqual(["Shield"]);
});

// A magician page with Starting Spell Books in the right column.
const magicianPage = [
  "Magician",
  "Prime Abilities        Intelligence",
  "Hit Points             1d4 per Level",
  "Armour                 None",
  "Weapons                Dagger, staff",
  "Level   XP   Hit Points   Attack   Doom   Ray   Hold   Blast   Spell",
  "1       0    1d4          +0       16     15    18     11      20",
  "2       1,750   +1d4     +0       16     15    18     11      20",
  "",
  at([[50, "Starting Spell Books"]]),
  at([[50, "A magician possesses a single spell book."]]),
  "",
  at([[50, "1. Tome of Sparks: Contains the following Rank 1 spells: Light, Glow, Flash."]]),
  at([[50, "2. Ice Folio: Contains the following Rank 1 spells: Frost, Shield."]]),
  at([[50, "3. Wind Grimoire: Contains the following spells: Gust, Calm."]]),
].join("\n");

test("parses magician starting spell books with their spells", () => {
  const c = parseClasses([magicianPage])[0];
  expect(c.spellBooks.length).toBe(3);
  expect(c.spellBooks[0].name).toBe("Tome of Sparks");
  expect(c.spellBooks[0].spells).toEqual(["Light", "Glow", "Flash"]);
  expect(c.spellBooks[1].name).toBe("Ice Folio");
  expect(c.spellBooks[1].spells).toEqual(["Frost", "Shield"]);
  expect(c.spellBooks[2].name).toBe("Wind Grimoire");
  expect(c.spellBooks[2].spells).toEqual(["Gust", "Calm"]);
});
