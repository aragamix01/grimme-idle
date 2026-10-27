// World state must stay plain JSON: it is saved to IndexedDB and, later, to Durable Object storage.
export type Job =
  | 'swordsman'
  | 'mage'
  | 'merchant'
  | 'farmer'
  | 'herder'
  | 'hunter'
  | 'thief'
  | 'soldier'
  | 'blacksmith'
  | 'innkeeper'
  | 'courtesan'
  | 'priest'
  | 'scholar'
  | 'alchemist'
  | 'engineer'
  | 'builder'
  | 'doctor'
  | 'noble'
  | 'king';
export type Trait = 'greedy' | 'brave' | 'coward' | 'loyal' | 'vengeful' | 'kind';

export interface Npc {
  id: number;
  name: string;
  age: number;
  job: Job;
  level: number;
  gold: number;
  morality: number; // -100..100
  traits: Trait[];
  x: number;
  y: number;
  alive: boolean;
  blessed: boolean;
  plan?: Plan; // what the NPC is walking towards or doing right now
  inside?: number; // dungeon id being explored, or AWAY while travelling off the map; hidden either way
  rank?: number; // guild rank index into RANKS (F..S); only adventurers have one
  renown?: number; // earned from finished quests; drives rank-ups
  questId?: number; // quest this NPC is signed up for
  guildId?: number; // guild this NPC belongs to
  spouseId?: number; // kept after the spouse dies, so the card can remember them
  parentIds?: number[]; // set for NPCs born in town
  retired?: boolean; // elders who have hung up their sword
  gear?: number; // 0..MAX_GEAR, bought at the market; adds strength
  hunger?: number; // meals missed in a row
  left?: boolean; // gave up on the town (alive is false, but they didn't die)
  unpaid?: number; // soldiers: paydays missed in a row
  ales?: number; // innkeepers: mugs sold since they last bought grain to brew
  loyalty?: number; // 0..100 to the throne; missing means 50
  knight?: boolean; // sworn to the crown, paid each payday
  cultist?: boolean; // a secret member of the demon cult
  trip?: number; // merchants: days left on the road with a caravan
  blessUntil?: number; // day the blessing fades (heroes keep theirs)
  cursedUntil?: number; // day the curse lifts
  relic?: string; // taken from a slain dungeon boss; adds strength
  hero?: boolean; // awakened by the god to face the demon lord; keeps the title for life
  formerJob?: Job; // whoever holds elected office: the trade they go back to when voted out
  schooling?: number; // children: days of lessons, at school or from a parent who can read
  lettered?: boolean; // can read and write; missing means whatever their trade implies (see literate)
}

export const AWAY = -1; // `inside` value for NPCs off the edge of the map (escort trips)

// Every action happens at a place: the NPC walks there first, then acts.
export type PlanKind = 'idle' | 'work' | 'adventure' | 'delve' | 'return' | 'steal' | 'flee' | 'arrive' | 'buy' | 'ritual' | 'caravan' | 'haul' | 'crusade';

export interface Plan {
  kind: PlanKind;
  x: number;
  y: number;
  days: number; // stay length once there, or time left before giving up
  target?: number; // npc id (steal) or dungeon id (adventure, delve)
}

export type Decree = 'labour' | 'subsidy' | 'bounty' | 'curfew' | 'taxfree' | 'levy';

// The town's constitution (see charter.ts).
export interface Charter {
  termYears: number; // years between elections; 0 where nobody is elected
  termLimit: number | null; // consecutive terms a leader may serve; null for no limit
  franchise: 'none' | 'all' | 'propertied' | 'lettered'; // who may vote
  councilVeto: boolean; // whether the council can block decrees
  taxCap: Tax | null; // the highest tax the ruler may set
  stateFaith: boolean; // the god's faith is the state's: more prayer, less free inquiry
  emergency?: boolean; // the ruler holds emergency powers; no elections
  written: number; // day this charter was written
  amendments: { day: number; text: string }[];
}
export type Regime = 'monarchy' | 'republic' | 'theocracy' | 'oligarchy' | 'junta';
export type Tech = 'plough' | 'medicine' | 'metallurgy' | 'architecture' | 'navigation' | 'arcana' | 'printing' | 'steam' | 'chemistry' | 'railway' | 'irrigation' | 'levee' | 'ironframe';
export type Field = 'agronomy' | 'physick' | 'commerce' | 'engineering';
export type Work = 'granary' | 'watchtowers' | 'yard' | 'cathedral' | 'market' | 'palace' | 'school' | 'clocktower' | 'press' | 'monument' | 'factory' | 'station';

export interface Dragon {
  name: string;
  hp: number;
  maxHp: number;
  came: number; // day it arrived
  nextStrike: number; // day of its next raid on the town
  hoard: number; // gold it has carried off; the slayers' reward
}

export type DungeonKind = 'cave' | 'den' | 'fort' | 'crypt';

export interface Boss {
  name: string;
  hp: number;
  maxHp: number;
  relic: string; // what the one who strikes it down carries home
  slainDay?: number;
  generation?: number;
}

export interface Dungeon {
  id: number;
  name: string;
  x: number;
  y: number;
  power: number; // grows when ignored; stampede past threshold
  kind?: DungeonKind; // missing in old saves: a cave
  boss?: Boss;
  calmUntil?: number; // quiet after its boss falls
  found?: number; // day an adventurer discovered it
}

export type QuestKind = 'hunt' | 'explore' | 'escort' | 'pest' | 'bounty';
export type QuestStage = 'recruiting' | 'travelling' | 'inside' | 'done' | 'failed' | 'expired';

export interface Quest {
  id: number;
  kind: QuestKind;
  title: string;
  rank: number; // index into RANKS
  reward: number; // gold, split across the party
  difficulty: number;
  stage: QuestStage;
  stageDay: number; // day the current stage began
  partyIds: number[]; // adventurers who signed up
  minParty: number;
  dungeonId?: number; // hunt, explore
  clientId?: number; // escort: the merchant being protected
  targetId?: number; // bounty: the thief to bring in
  spot?: { x: number; y: number }; // pest: the field being raided
  daysLeft?: number; // while inside / on site
  postedDay: number;
  // Who pays. The reward is taken from them when the quest is posted and refunded if nobody takes it.
  patronId?: number; // an NPC (farmer, merchant, theft victim)
  patronGuildId?: number; // a guild funding its own expedition
  crown?: boolean; // the town treasury
  divine?: boolean; // the player's god; pays double renown
  boss?: boolean; // a hunt for the dungeon's boss itself
  guildId?: number; // claimed by a guild: only its members (and their friends) may join
}

export type GuildKind = 'adventurers' | 'thieves' | 'merchants';

export interface Guild {
  id: number;
  name: string;
  kind: GuildKind;
  leaderId: number;
  founded: number; // day
  renown: number;
  treasury: number;
}

export type Good = 'grain' | 'meat' | 'wool' | 'loot' | 'gear';

export interface Market {
  stock: Record<Good, number>;
  price: Record<Good, number>; // whole gold, follows stock
  till: number; // the merchants' float: pays sellers, collects from buyers, pays stall wages
  history: Record<Good, number[]>; // price every few days, oldest first
  alert: Record<Good, -1 | 0 | 1>; // last swing the chronicle reported: glut, normal, dear
  lastImport?: number; // day grain was last shipped in
  caravan?: { merchantId: number; grain: number; gold: number; gear?: number; realmId?: number; days?: number }; // the trip on the road: what it brings back, where to, how long
}

export type Tax = 'low' | 'normal' | 'high';

export interface Crown {
  since: number; // day the current king took the throne
  tax: Tax;
  lastFestival?: number;
  unrest: number; // months in a row the people have been this unhappy
}

export interface Cult {
  name: string;
  founded: number;
  leaderId: number;
  rituals: number;
}

// The hero the god awakened, and the march on the demon lord.
export interface HeroQuest {
  id: number;
  since: number; // day of the awakening
  stage: 'training' | 'march';
  companions: number[];
  entered?: number; // day the hero passed into the demon's keep
}

export interface DemonLord {
  name: string;
  risen: number; // day
  power: number; // grows by the day and on tribute; the hero must outmatch it
  stage: 'risen' | 'occupied';
  sieges: number; // raids the town failed to hold; at SIEGES_TO_FALL the town is taken
  lastRaid: number;
  fell?: number; // day the town was occupied
  governorId?: number; // the cult leader set over the town
  heroLost?: number; // day the last hero fell
  resistance?: number; // 0..100: the townsfolk's secret resistance, growing through the occupation
  hero?: HeroQuest;
}

export type Terrain = 'mountain' | 'coast' | 'desert' | 'forest';

// A neighbouring kingdom on the world map, simulated in broad strokes.
export interface Realm {
  id: number;
  name: string;
  terrain: Terrain;
  color: string; // palette char for its banner
  x: number; // tile on the world map
  y: number;
  ruler: { name: string; age: number; traits: Trait[] };
  regime?: Regime; // how they are governed; missing in old saves means a king
  age?: number; // how far their learning has come (see ages.ts); missing in old saves
  gold: number;
  army: number;
  people: number;
  relation: number; // -100 (enemy) .. 100 (ally), how they feel about us
  pact?: 'alliance';
  wed?: string; // our royal child married into their court
  trades?: number; // caravans that came back from them
  war?: boolean; // at war with us
  truceUntil?: number; // no new war with us before this day
  plagueUntil?: number;
  tutored?: boolean; // our scholars are teaching there: their next age comes sooner
  disaster?: { kind: 'drought' | 'flood' | 'quake'; until: number }; // nature's blow, and the day they've recovered
  fallen?: boolean; // taken by the demon lord
  miracleAt?: number; // day the god last worked a miracle on them
}

export type RealmMiracle = 'bless' | 'blight';

export type WarAct = 'bless' | 'storm' | 'peace';

export interface War {
  realmId: number;
  since: number;
  attacker: 'us' | 'them';
  nextBattle: number; // day of the next clash
  score: number; // our victories minus theirs
  battles: number;
  boost?: number; // the god's blessing on our next battle
  storm?: number; // the god's storm on theirs
}

export type DreamKind = 'repent' | 'love' | 'nightmare' | 'vision' | 'ambition';
export type MiracleKind = 'rain' | 'goldrain' | 'festival' | 'wanderers' | 'blight' | 'plague' | 'cult' | 'surge' | 'eclipse' | 'aegis' | 'revive' | 'wonder' | 'bounty' | 'uprising' | 'quake' | 'flood' | 'drought' | 'tyranny' | 'doom';

export type Perk = 'faith' | 'grace' | 'valor' | 'harvest' | 'ward' | 'lore';

// One closed era, as the next ones remember it.
export interface EraRecord {
  era: number;
  title: string;
  years: number;
  stars: number;
  demons: number;
  heroes: string[]; // who slew its demon lords
  king?: string; // the last king of the era
  balance: number;
}

// What the god keeps from one era to the next.
export interface Legacy {
  era: number;
  stars: number; // unspent legend stars
  perks: Partial<Record<Perk, number>>;
  past: EraRecord[];
}

export interface Legend {
  day: number;
  text: string;
  npcId?: number;
}

export type EventKind =
  | 'world'
  | 'battle'
  | 'death'
  | 'disaster'
  | 'theft'
  | 'bless'
  | 'curse'
  | 'dream'
  | 'quest'
  | 'rank'
  | 'bond'
  | 'guild'
  | 'trade'
  | 'politics'
  | 'cult';

// One year of the annals: its name, its picture, how the town fared month by month, and what mattered.
export interface YearRecord {
  year: number;
  title: string;
  art: string; // sprite path under assets/sprites, without .png
  pop: number[]; // townsfolk, sampled monthly
  gold: number[]; // treasury, sampled monthly
  born: number;
  died: number;
  arrived: number;
  left: number;
  king?: string; // who reigned at the year's end
  ruler?: string; // their title under the regime of the day; missing in years before regimes
  highlights: { day: number; kind: EventKind; text: string; npcId?: number }[];
}

export interface ChronicleEntry {
  seq: number;
  day: number;
  kind: EventKind;
  text: string;
  npcId?: number;
}

export interface WorldState {
  version: 1;
  seed: number;
  rng: number;
  day: number;
  faith: number;
  width: number;
  height: number;
  npcs: Npc[];
  dungeons: Dungeon[];
  quests: Quest[];
  legends: Legend[];
  guilds: Guild[];
  ties: Record<string, number>; // "lowId-highId" -> affinity -100..100; missing means strangers
  treasury: number; // town gold that funds crown quests
  market?: Market; // missing in saves from before the economy
  kingId?: number; // the reigning king, or the last one if the throne is empty
  crown?: Crown; // missing in saves from before politics
  balance?: number; // -100 (darkness) .. 100 (light); missing means 0
  omen?: number; // the last tipping point the chronicle announced, -2..1
  cult?: Cult;
  dread?: number; // 0..100: dark pressure building toward the demon lord's awakening
  portent?: number; // the last portent of the gathering dread the chronicle announced (see portents.ts)
  demon?: DemonLord;
  demonsSlain?: number;
  slayers?: string[]; // heroes who slew a demon lord this era
  weather?: { kind: 'rain' | 'blight' | 'drought' | 'deluge'; until: number }; // a miracle's weather over the fields, or nature's
  flood?: number; // day the floodwaters go down
  ruins?: { x: number; y: number; until: number }[]; // homes brought down, by tile, and the day each is rebuilt
  disasterAt?: number; // day of nature's last blow
  aegis?: boolean; // the god's shield: the next disaster passes the town by
  miracleAt?: Partial<Record<MiracleKind, number>>; // day each miracle was last worked
  miracleRush?: Partial<Record<MiracleKind, number>>; // times each was worked again before its wait was up
  legacy?: Legacy;
  dragon?: Dragon; // drawn by a rich treasury; roosts outside town until slain or sated
  dragonsSlain?: number;
  works?: Partial<Record<Work, number>>; // the crown's finished buildings, by the day each was done
  building?: { kind: Work; done: number }; // the work under way, and the day it will stand
  decrees?: { kind: Decree; since: number; until: number }[]; // the king's decrees in force
  decreeAt?: Partial<Record<Decree, number>>; // day each was last issued
  labour?: number; // hired workers still on the road to town
  annals?: YearRecord[]; // the last few years, one page each
  yearSamples?: { pop: number[]; gold: number[] }; // this year's monthly samples so far
  golden?: number; // months in a row of peace and plenty; long golden ages breed trouble
  herd?: number; // beasts in the pasture; missing in saves from before herders
  regime?: Regime; // how the town is governed; missing means a king
  charter?: Charter; // missing in saves from before constitutions: written from the regime
  strike?: number; // day a workers' strike ends
  republic?: { since: number; elections: number; nextVote: number; streak?: number; inOffice?: number; last?: { day: number; results: { id: number; name: string; votes: number }[] } };
  council?: { vetoes: number; overrides: number; deadlock?: number; last?: { decree: Decree; day: number; ayes: number; nays: number; result: 'passed' | 'vetoed' | 'overridden' } };
  techs?: Partial<Record<Tech, number>>; // what the scholars have found, by the day each was found
  research?: Tech; // the question the crown has set them
  mastery?: Partial<Record<Field, number>>; // levels of the endless advanced studies, once every discovery is made
  study?: Field; // the advanced study under way
  knowledge?: number;
  monument?: number; // tiers of the kingdom's monument raised so far
  alms?: number; // gold in the church's larder for feeding the hungry // what the scholars have worked out, for research to spend; missing before scholars
  game?: number; // deer left in the forest
  realms?: Realm[];
  war?: War; // the neighbours; missing in saves from before the world map // missing in the first era of old saves
  chronicle: ChronicleEntry[];
  chronicleSeq: number;
  nextId: number;
}

export type Command =
  | { type: 'bless'; npcId: number }
  | { type: 'curse'; npcId: number }
  | { type: 'dream'; npcId: number; job?: Job; kind?: DreamKind }
  | { type: 'divineQuest' }
  | { type: 'reveal' }
  | { type: 'hero'; npcId?: number }
  | { type: 'perk'; perk: Perk }
  | { type: 'miracle'; kind: MiracleKind }
  | { type: 'war'; act: WarAct }
  | { type: 'realm'; realmId: number; kind: RealmMiracle };
