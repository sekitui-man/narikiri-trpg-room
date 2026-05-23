import {
  cocSkillDefinitions,
  createSkillMap,
  getSkillTotal,
  normalizeSkillEntry,
  resolveSkillBase,
} from './cocSkills';
import type { Character, CoCBackground, CoCCharacteristics, CoCSkillMap } from './types';

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

export const backgroundFields: Array<{ key: keyof CoCBackground; label: string }> = [
  { key: 'description', label: '外見・描写' },
  { key: 'ideology', label: '思想・信条' },
  { key: 'significantPeople', label: '重要な人物' },
  { key: 'meaningfulLocations', label: '意味のある場所' },
  { key: 'treasuredPossessions', label: '秘蔵品' },
  { key: 'traits', label: '特徴' },
  { key: 'injuries', label: '負傷・傷跡' },
  { key: 'phobias', label: '恐怖症・マニア' },
  { key: 'tomes', label: '魔導書・呪文' },
  { key: 'encounters', label: '遭遇した神話存在' },
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
    residence: character.residence ?? '',
    birthplace: character.birthplace ?? '',
    characteristics,
    skills,
    weapons: character.weapons ?? '',
    possessions: character.possessions ?? '',
    background: { ...defaultBackground, ...backgroundInput },
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
