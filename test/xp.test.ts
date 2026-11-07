import { expect, test } from "bun:test";
import { kindredXpBonus, kindredXpBonuses, parsePrimeXpModifiers } from "../src/parse/xp.ts";

test("parses the prime-ability XP modifier rows beside another column", () => {
  const page = [
    "               ABILITY MODIFIERS                                   Some prose here",
    "        Score                    Modifier",
    "             16–17                          +2                          PRIME ABILITY XP MODIFIERS",
    "               18                           +3                         Prime Ability Score     XP Modifier",
    "                                                                                3–6                -15%",
    "                                                                               15–18                +7%",
  ].join("\n");
  expect(parsePrimeXpModifiers([page])).toEqual([
    { min: 3, max: 6, percent: -15 },
    { min: 15, max: 18, percent: 7 },
  ]);
});

test("reads a kindred XP bonus from traits or from prose", () => {
  expect(
    kindredXpBonus([{ text: "They gain a +5% bonus to all\nExperience Points earned." }]),
  ).toBe(5);
  expect(kindredXpBonus([{ text: "Nothing here." }])).toBe(0);
  const prose =
    "Quickening\nWisps learn fast and gain a +15% bonus to all Experience Points earned.";
  expect(
    kindredXpBonuses(
      [prose],
      [
        { id: "wisp", name: "Wisp" },
        { id: "troll", name: "Troll" },
      ],
    ),
  ).toEqual({ wisp: 15 });
});
