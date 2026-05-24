import { cocSkillDefinitions, normalizeSkillEntry, resolveSkillBase } from './cocSkills';
import { normalizeCharacter } from './characterModel';
import type { Character, CoCCharacteristics, CoCSkillEntry } from './types';

const characteristicMap: Record<string, keyof CoCCharacteristics> = {
  STR: 'str',
  CON: 'con',
  POW: 'pow',
  DEX: 'dex',
  APP: 'app',
  SIZ: 'siz',
  INT: 'int',
  EDU: 'edu',
};

const skillAliases: Record<string, string> = {
  'こぶし（パンチ）': 'こぶし',
  経理: '会計',
};

type SkillColumns = Pick<CoCSkillEntry, 'occupation' | 'interest' | 'growth' | 'other'>;

export function parseIaCharacterText(text: string, ownerId: string | null): Character {
  if (!text.includes('いあきゃらテキスト') && !text.includes('【基本情報】')) {
    throw new Error('いあきゃらのテキスト形式を確認できませんでした。');
  }

  const normalizedText = text.replace(/\r\n/g, '\n');
  const characteristics = parseCharacteristics(normalizedText);
  const skillColumns = parseSkills(normalizedText, characteristics);
  const basicInfo = parseBasicInfo(normalizedText);
  const memo = extractSection(normalizedText, 'メモ').trim();
  const iconUrl = parseIconUrl(normalizedText);
  const currentSan = parseCurrentSan(normalizedText);

  return normalizeCharacter({
    id: crypto.randomUUID(),
    ownerId,
    name: basicInfo.name,
    player: '',
    archetype: basicInfo.occupation || '探索者',
    color: '#090909',
    occupation: basicInfo.occupation,
    age: basicInfo.age,
    gender: basicInfo.gender,
    height: basicInfo.height,
    weight: basicInfo.weight,
    hairColor: basicInfo.hairColor,
    eyeColor: basicInfo.eyeColor,
    skinColor: basicInfo.skinColor,
    birthplace: basicInfo.birthplace,
    residence: '',
    imagePath: '',
    imageUrl: iconUrl,
    tags: basicInfo.occupation ? [basicInfo.occupation] : [],
    memo,
    characteristics,
    skills: skillColumns,
    weapons: extractSection(normalizedText, '戦闘・武器・防具').trim(),
    possessions: extractSection(normalizedText, '所持品').trim(),
    background: {
      description: basicInfo.appearance,
      traits: memo,
      tomes: extractBracketedSubsection(normalizedText, '魔導書、呪文、アーティファクト'),
      encounters: extractBracketedSubsection(normalizedText, '遭遇した超自然の存在'),
    },
    sanityCurrent: currentSan ?? undefined,
    hitPointsCurrent: parseStatusValue(normalizedText, 'HP') ?? undefined,
    magicPointsCurrent: parseStatusValue(normalizedText, 'MP') ?? undefined,
  });
}

function parseBasicInfo(text: string) {
  const section = extractSection(text, '基本情報');
  const name = matchText(section, /^名前:\s*(.+)$/m) || 'インポート探索者';
  const occupation = matchText(section, /^職業:\s*(.+)$/m);
  const ageGenderLine = matchText(section, /^年齢:\s*(.+)$/m);
  const ageMatch = ageGenderLine.match(/^(.+?)\s*\/\s*性別:\s*(.+?)(?:\s*\/|$)/);
  const birthplace = matchText(section, /出身:\s*([^\n]+)/);
  const height = matchText(section, /身長:\s*([^\n/]+)/);
  const weight = matchText(section, /^体重:\s*([^\n/]+)/m);
  const hairColor = matchText(section, /^髪の色:\s*([^\n/]+)/m);
  const eyeColor = matchText(section, /瞳の色:\s*([^\n/]+)/);
  const skinColor = matchText(section, /肌の色:\s*([^\n/]+)/);
  const appearance = [
    height ? `身長: ${height}` : '',
    weight ? `体重: ${weight}` : '',
    hairColor ? `髪の色: ${hairColor}` : '',
    eyeColor ? `瞳の色: ${eyeColor}` : '',
    skinColor ? `肌の色: ${skinColor}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    name,
    occupation,
    age: ageMatch?.[1]?.trim() ?? '',
    gender: ageMatch?.[2]?.trim() ?? '',
    birthplace: birthplace.trim(),
    height: height.trim(),
    weight: weight.trim(),
    hairColor: hairColor.trim(),
    eyeColor: eyeColor.trim(),
    skinColor: skinColor.trim(),
    appearance,
  };
}

function parseCharacteristics(text: string): CoCCharacteristics {
  const input: Partial<CoCCharacteristics> = {};
  for (const [sourceKey, targetKey] of Object.entries(characteristicMap)) {
    const value = parseStatusValue(text, sourceKey);
    if (value !== null) input[targetKey] = value;
  }
  return {
    str: input.str ?? 10,
    con: input.con ?? 10,
    siz: input.siz ?? 10,
    int: input.int ?? 10,
    pow: input.pow ?? 10,
    dex: input.dex ?? 10,
    app: input.app ?? 10,
    edu: input.edu ?? 10,
  };
}

function parseSkills(text: string, characteristics: CoCCharacteristics) {
  const entries: Record<string, SkillColumns> = {};
  const knownNames = new Set(cocSkillDefinitions.map((definition) => definition.name));

  for (const line of text.split('\n')) {
    const match = line.match(/^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/);
    if (!match) continue;
    const rawName = match[1].trim();
    const name = skillAliases[rawName] ?? rawName;
    if (!knownNames.has(name)) continue;
    entries[name] = {
      occupation: Number(match[4]),
      interest: Number(match[5]),
      growth: Number(match[6]),
      other: Number(match[7]),
    };
  }

  return Object.fromEntries(
    cocSkillDefinitions.map((definition) => {
      const base = resolveSkillBase(definition.base, characteristics);
      return [definition.name, normalizeSkillEntry(entries[definition.name], base)];
    }),
  );
}

function parseCurrentSan(text: string) {
  const match = text.match(/現在SAN値\s+(\d+)\s*\//);
  return match ? Number(match[1]) : null;
}

function parseStatusValue(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^${escaped}\\s+(\\d+)\\s+\\d+\\s+\\d+\\s+\\d+`, 'm'));
  return match ? Number(match[1]) : null;
}

function parseIconUrl(text: string) {
  return matchText(extractSection(text, 'アイコン'), /https?:\/\/\S+/);
}

function extractSection(text: string, sectionName: string) {
  const start = text.indexOf(`【${sectionName}】`);
  if (start < 0) return '';
  const bodyStart = start + `【${sectionName}】`.length;
  const next = text.slice(bodyStart).search(/\n【[^】]+】/);
  return next < 0 ? text.slice(bodyStart) : text.slice(bodyStart, bodyStart + next);
}

function extractBracketedSubsection(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`〈${escaped}〉\\n([\\s\\S]*?)(?=\\n\\n〈|\\n【|$)`));
  return match?.[1]?.trim() ?? '';
}

function matchText(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim() ?? '';
}
