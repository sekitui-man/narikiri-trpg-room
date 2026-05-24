import {
  cocSkillDefinitions,
  createSkillMap,
  getSkillTotal,
  normalizeSkillEntry,
  resolveSkillBase,
} from './cocSkills';
import type { Character, CharacterMemoEntry, CoCBackground, CoCCharacteristics, CoCSkillMap } from './types';

export type CharacterLike = Omit<Partial<Character>, 'characteristics' | 'skills' | 'background'> & {
  id: string;
  name?: string;
  characteristics?: unknown;
  skills?: unknown;
  background?: unknown;
};

export const characteristicKeys: Array<keyof CoCCharacteristics> = [
  'str',
  'con',
  'siz',
  'int',
  'pow',
  'dex',
  'app',
  'edu',
];

const defaultCharacteristics: CoCCharacteristics = {
  str: 10,
  con: 10,
  siz: 10,
  int: 10,
  pow: 10,
  dex: 10,
  app: 10,
  edu: 10,
};

const defaultBackground: CoCBackground = {
  description: '',
  ideology: '',
  significantPeople: '',
  meaningfulLocations: '',
  treasuredPossessions: '',
  traits: '',
  injuries: '',
  phobias: '',
  tomes: '',
  encounters: '',
  customMemos: [],
};

export function normalizeCharacter(character: CharacterLike): Character {
  const characteristicsInput =
    character.characteristics && typeof character.characteristics === 'object' && !Array.isArray(character.characteristics)
      ? (character.characteristics as Partial<CoCCharacteristics>)
      : {};
  const backgroundInput =
    character.background && typeof character.background === 'object' && !Array.isArray(character.background)
      ? (character.background as Partial<CoCBackground>)
      : {};
  const characteristics = { ...defaultCharacteristics, ...characteristicsInput };
  const skills = normalizeSkills(character.skills, characteristics);
  const sanityDefault = characteristics.pow * 5;
  const hitPointDefault = Math.ceil((characteristics.con + characteristics.siz) / 2);

  return {
    id: character.id,
    name: character.name ?? '新規探索者',
    ownerId: character.ownerId ?? null,
    player: character.player ?? '',
    archetype: character.archetype ?? character.occupation ?? '',
    color: character.color ?? '#090909',
    memo: character.memo ?? '',
    occupation: character.occupation ?? character.archetype ?? '',
    age: character.age ?? '',
    gender: character.gender ?? '',
    height: character.height ?? '',
    weight: character.weight ?? '',
    hairColor: character.hairColor ?? '',
    eyeColor: character.eyeColor ?? '',
    skinColor: character.skinColor ?? '',
    residence: character.residence ?? '',
    birthplace: character.birthplace ?? '',
    imagePath: character.imagePath ?? '',
    imageUrl: character.imageUrl ?? '',
    tags: normalizeTags(character.tags),
    characteristics,
    skills,
    weapons: character.weapons ?? '',
    possessions: character.possessions ?? '',
    background: {
      ...defaultBackground,
      ...backgroundInput,
      customMemos: normalizeCustomMemos((backgroundInput as { customMemos?: unknown }).customMemos),
    },
    sanityCurrent: Number(character.sanityCurrent ?? sanityDefault),
    hitPointsCurrent: Number(character.hitPointsCurrent ?? hitPointDefault),
    magicPointsCurrent: Number(character.magicPointsCurrent ?? characteristics.pow),
    isArchived: Boolean(character.isArchived),
  };
}

export function createDefaultCharacter(ownerId: string | null): Character {
  const id = crypto.randomUUID();
  const characteristics = { ...defaultCharacteristics };
  return normalizeCharacter({
    id,
    ownerId,
    name: '新規探索者',
    player: '',
    archetype: '探索者',
    color: '#090909',
    occupation: '',
    characteristics,
    skills: createSkillMap(characteristics),
  });
}

export function deriveCoCValues(character: Character) {
  const { con, siz, int, pow, edu } = character.characteristics;
  const cthulhuMythos = getSkillTotal(character.skills['クトゥルフ神話']);

  return {
    idea: int * 5,
    luck: pow * 5,
    know: edu * 5,
    sanityMax: Math.max(0, 99 - cthulhuMythos),
    hitPointsMax: Math.ceil((con + siz) / 2),
    magicPointsMax: pow,
  };
}

export type DerivedCoCValues = ReturnType<typeof deriveCoCValues>;

export function normalizeSkills(skills: unknown, characteristics: CoCCharacteristics): CoCSkillMap {
  const input = skills && typeof skills === 'object' && !Array.isArray(skills) ? (skills as Record<string, unknown>) : {};
  return Object.fromEntries(
    cocSkillDefinitions.map((definition) => {
      const base = resolveSkillBase(definition.base, characteristics);
      return [definition.name, normalizeSkillEntry(input[definition.name], base)];
    }),
  );
}

export function clampSkillPoint(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(999, Math.max(0, Math.trunc(value)));
}

function normalizeTags(tags: unknown) {
  if (!Array.isArray(tags)) return [];
  return Array.from(
    new Set(
      tags
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter(Boolean)
        .slice(0, 20),
    ),
  );
}

function normalizeCustomMemos(value: unknown): CharacterMemoEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const input = entry as Partial<Record<keyof CharacterMemoEntry, unknown>>;
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const body = typeof input.body === 'string' ? input.body : '';
      if (!title && !body.trim()) return null;
      return {
        id: typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID(),
        title: title || 'メモ',
        body,
      };
    })
    .filter((entry): entry is CharacterMemoEntry => Boolean(entry))
    .slice(0, 20);
}
