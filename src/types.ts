export type CoCCharacteristics = {
  str: number;
  con: number;
  siz: number;
  int: number;
  pow: number;
  dex: number;
  app: number;
  edu: number;
};

export type CoCSkillEntry = {
  base: number;
  occupation: number;
  interest: number;
  growth: number;
  other: number;
};

export type CoCSkillMap = Record<string, CoCSkillEntry>;

export type CharacterMemoEntry = {
  id: string;
  title: string;
  body: string;
};

export type CoCBackground = {
  description: string;
  ideology: string;
  significantPeople: string;
  meaningfulLocations: string;
  treasuredPossessions: string;
  traits: string;
  injuries: string;
  phobias: string;
  tomes: string;
  encounters: string;
  customMemos: CharacterMemoEntry[];
};

export type Character = {
  id: string;
  name: string;
  ownerId: string | null;
  player: string;
  archetype: string;
  color: string;
  memo: string;
  occupation: string;
  age: string;
  gender: string;
  height: string;
  weight: string;
  hairColor: string;
  eyeColor: string;
  skinColor: string;
  residence: string;
  birthplace: string;
  imagePath: string;
  imageUrl: string;
  tags: string[];
  characteristics: CoCCharacteristics;
  skills: CoCSkillMap;
  weapons: string;
  possessions: string;
  background: CoCBackground;
  sanityCurrent: number;
  hitPointsCurrent: number;
  magicPointsCurrent: number;
  isArchived: boolean;
};

export type Room = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  createdBy: string | null;
};

export type Scene = {
  id: string;
  roomId: string | null;
  createdBy: string | null;
  title: string;
  status: 'active' | 'paused' | 'archived';
  summary: string;
  locationName: string;
  timeLabel: string;
  mapX: number | null;
  mapY: number | null;
  tags: string[];
  createdAt: string | null;
};

export type RpMessage = {
  id: string;
  characterId: string | null;
  authorId: string | null;
  author: string;
  body: string;
  mode: 'ic' | 'ooc';
  createdAt: string;
};

export type Profile = {
  id: string;
  display_name: string;
  email: string;
};
