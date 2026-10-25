// World state must stay plain JSON: it is saved to IndexedDB and, later, to Durable Object storage.
export type Job =
  | 'swordsman'
  | 'mage'
  | 'merchant'
  | 'farmer'
  | 'thief'
  | 'soldier'
  | 'blacksmith'
  | 'innkeeper'
  | 'courtesan'
  | 'priest'
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
}

export const AWAY = -1; // `inside` value for NPCs off the edge of the map (escort trips)

// Every action happens at a place: the NPC walks there first, then acts.
export type PlanKind = 'idle' | 'work' | 'adventure' | 'delve' | 'return' | 'steal' | 'flee' | 'arrive' | 'buy' | 'ritual';

export interface Plan {
  kind: PlanKind;
  x: number;
  y: number;
  days: number; // stay length once there, or time left before giving up
  target?: number; // npc id (steal) or dungeon id (adventure, delve)
}

export interface Dungeon {
  id: number;
  name: string;
  x: number;
  y: number;
  power: number; // grows when ignored; stampede past threshold
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

export type Good = 'grain' | 'loot' | 'gear';

export interface Market {
  stock: Record<Good, number>;
  price: Record<Good, number>; // whole gold, follows stock
  till: number; // the merchants' float: pays sellers, collects from buyers, pays stall wages
  history: Record<Good, number[]>; // price every few days, oldest first
  alert: Record<Good, -1 | 0 | 1>; // last swing the chronicle reported: glut, normal, dear
  lastImport?: number; // day grain was last shipped in
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
  chronicle: ChronicleEntry[];
  chronicleSeq: number;
  nextId: number;
}

export type Command =
  | { type: 'bless'; npcId: number }
  | { type: 'curse'; npcId: number }
  | { type: 'dream'; npcId: number; job: Job }
  | { type: 'divineQuest' }
  | { type: 'reveal' };
