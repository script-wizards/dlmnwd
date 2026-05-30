import type { Character } from "../src/gen/character.ts";
import type { ParsedClass } from "../src/parse/class.ts";
import type { ParsedKindred } from "../src/parse/kindred.ts";

// Invented, non-canon character for demoing the sheet without a PDF.
const kindred = {
  id: "thornling",
  name: "Thornling",
  kindredType: "Mortal",
  nativeLanguages: ["Marchtongue", "Thorncant"],
  nameColumns: [],
  nameRows: [],
  persona: {},
  backgrounds: ["Fungal forager", "Hedge witch", "Charcoal burner"],
  traits: [
    {
      name: "Bramble Skin",
      text: "Thorns lie flat along the arms and back, worth +1 AC to a thornling who wears nothing heavier than leather.",
    },
    {
      name: "Rootspeech",
      text: "Once per day a thornling may parley with a tree or hedge for a single honest answer about what has passed nearby.",
    },
    {
      name: "Sapblood",
      text: "Immune to natural poisons. Mundane disease passes after a single day's rest.",
    },
  ],
  trinkets: [
    "A tiny dried mushroom that glows faintly in moonlight",
    "A thorn twisted into the shape of a tiny horn",
    "A pouch of fragrant moss that never dries",
  ],
  magicResistance: 2,
  furArmourBonus: 1,
} as ParsedKindred;

const klass = {
  id: "hedgewise",
  name: "Hedgewise",
  hitDie: "1d6",
  armour: "Light, no shields",
  weapons: "Sickle, sling, staff, dagger",
  primeAbilities: ["wis", "dex"],
  attack: 0,
  nextLevelXp: 2200,
  saves: { doom: 12, ray: 13, hold: 11, blast: 15, spell: 14 },
  skills: { Foraging: 5, Tracking: 5, Stealth: 6, "Folk Lore": 5 },
  languages: [],
  traits: [
    {
      name: "Hedge Magic",
      text: "The hedgewise coaxes charms from the green host.\nCharms per day: A table sets how many charms may be held at a time.\nVerdant Sense\nThe hedgewise senses the mood of nearby plants.\nRequirements: Bare feet upon open soil.\nTime: One Turn of stillness.\nGathering (Once a Day)\n▶ Bramble ward: Thorns turn aside the first blow struck.\n▶ Green whisper: A hedge answers one honest question about who has passed.",
    },
    {
      name: "Green Tongue",
      text: "May speak with a woodland beast once per day, asking a simple favour or question.\nSummoned ally: The beast may aid the hedgewise for a single scene.\nMedium Beast—Animal Intelligence—Neutral Level 2 AC 11 HP 2d8 (11) Saves D3 R2 H4 B6 S5 Att Bite (+1, 1d6) Speed 45 Morale 8 XP 25",
    },
    {
      name: "Wayfinding",
      text: "If the party becomes lost, there is a 2-in-6 chance the hedgewise finds the path again.",
    },
  ],
} as ParsedClass;

export const demoCharacter: Character = {
  name: "Pomella Quill",
  gender: "",
  player: "Sam",
  kindred,
  klass,
  scores: { str: 9, int: 11, wis: 14, dex: 13, con: 12, cha: 10 },
  scoresAdjusted: true,
  hp: 6,
  loadout: { armour: "Leather", ac: 13, baseAc: 12, shield: false },
  magicResistance: 2,
  languages: ["Marchtongue", "Thorncant"],
  extraLanguages: 0,
  skills: { Listen: 6, Search: 6, Survival: 5, Foraging: 5, Tracking: 5, Stealth: 6 },
  persona: {
    demeanour: "Watchful",
    dress: "Woven bark and leaf",
    head: "Knotted, mossy brow",
    face: "Wide amber eyes",
    speech: "Slow, deliberate",
    desires: "To map every hidden hollow",
    beliefs: "The wood remembers all",
  },
  alignment: "Neutral",
  background: "Hedge witch",
  gold: 11,
  generalItems: ["Common clothes", "Backpack with rations, waterskin, and tinder box"],
  adventuringItems: ["Rope (50')", "Torches (3)", "Crowbar", "Lantern (hooded)"],
  physique: { age: "23 years", height: "4′7″ (Small)", weight: "82 lbs", lifespan: "60 years" },
  trinket: "A tiny dried mushroom that glows faintly in moonlight",
  weapons: ["Sickle", "Sling"],
  classItems: ["Hedge shears"],
  spellBook: { name: "Pomella's Commonplace Book", spells: ["Kindle Ember", "Nettle Ward"] },
  magic: {
    // Invented, non-canon charms and glamours — enough to show the Magic
    // section's hierarchy (summary line, tagged spells, plain glamours).
    spells: [
      {
        name: "Kindle Ember",
        tradition: "Hedge",
        rank: 1,
        duration: "1 Turn per Level",
        range: "Touch",
        body: "A whispered word wakes a coal in cupped hands, enough to light a pipe, a candle, or dry tinder. The ember gives warmth but no true flame and cannot be thrown.",
        page: 0,
      },
      {
        name: "Nettle Ward",
        tradition: "Hedge",
        rank: 1,
        duration: "1 hour",
        range: "The caster",
        body: "Brambles at the caster's feet bristle toward the nearest ill-wisher. The first creature to strike the caster in melee takes 1d4 damage from the thorns.",
        page: 0,
      },
    ],
    glamours: [
      {
        name: "Dwindle",
        duration: "Concentration",
        range: "The caster",
        body: "The caster seems smaller and less worthy of notice, easily mistaken for a child or a stray animal at a glance.",
      },
    ],
    knacks: [],
  },
  speed: 40,
};
