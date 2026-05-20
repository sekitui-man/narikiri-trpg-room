import type { CoCCharacteristics, CoCSkillEntry, CoCSkillMap } from './types';

export type SkillBaseFormula = number | 'dex2' | 'edu5';

export type CoCSkillDefinition = {
  name: string;
  category: string;
  base: SkillBaseFormula;
};

export const cocSkillDefinitions: CoCSkillDefinition[] = [
  { name: '会計', category: '探索・知識', base: 10 },
  { name: '人類学', category: '探索・知識', base: 1 },
  { name: '考古学', category: '探索・知識', base: 1 },
  { name: '芸術', category: '探索・知識', base: 5 },
  { name: '天文学', category: '探索・知識', base: 1 },
  { name: '生物学', category: '探索・知識', base: 1 },
  { name: '化学', category: '探索・知識', base: 1 },
  { name: 'コンピューター', category: '探索・知識', base: 1 },
  { name: 'クトゥルフ神話', category: '探索・知識', base: 0 },
  { name: '電子工学', category: '探索・知識', base: 1 },
  { name: '地質学', category: '探索・知識', base: 1 },
  { name: '歴史', category: '探索・知識', base: 20 },
  { name: '法律', category: '探索・知識', base: 5 },
  { name: '図書館', category: '探索・知識', base: 25 },
  { name: '医学', category: '探索・知識', base: 5 },
  { name: '博物学', category: '探索・知識', base: 10 },
  { name: 'オカルト', category: '探索・知識', base: 5 },
  { name: '薬学', category: '探索・知識', base: 1 },
  { name: '物理学', category: '探索・知識', base: 1 },
  { name: '心理学', category: '探索・知識', base: 5 },
  { name: '精神分析', category: '探索・知識', base: 1 },
  { name: '専門技能', category: '探索・知識', base: 1 },
  { name: '目星', category: '探索・知覚', base: 25 },
  { name: '聞き耳', category: '探索・知覚', base: 25 },
  { name: '応急手当', category: '探索・知覚', base: 30 },
  { name: '隠す', category: '探索・知覚', base: 15 },
  { name: '隠れる', category: '探索・知覚', base: 10 },
  { name: '鍵開け', category: '探索・知覚', base: 1 },
  { name: '追跡', category: '探索・知覚', base: 10 },
  { name: '変装', category: '探索・知覚', base: 1 },
  { name: '写真術', category: '探索・知覚', base: 10 },
  { name: '忍び歩き', category: '探索・知覚', base: 10 },
  { name: '言いくるめ', category: '対人', base: 5 },
  { name: '信用', category: '対人', base: 15 },
  { name: '説得', category: '対人', base: 15 },
  { name: '値切り', category: '対人', base: 5 },
  { name: '母国語', category: '対人', base: 'edu5' },
  { name: 'ほかの言語', category: '対人', base: 1 },
  { name: '回避', category: '運動・行動', base: 'dex2' },
  { name: '登攀', category: '運動・行動', base: 40 },
  { name: '跳躍', category: '運動・行動', base: 25 },
  { name: '投擲', category: '運動・行動', base: 25 },
  { name: '水泳', category: '運動・行動', base: 25 },
  { name: '乗馬', category: '運動・行動', base: 5 },
  { name: 'ナビゲート', category: '運動・行動', base: 10 },
  { name: '運転', category: '運動・行動', base: 20 },
  { name: '操縦', category: '運動・行動', base: 1 },
  { name: '重機械操作', category: '運動・行動', base: 1 },
  { name: '機械修理', category: '運動・行動', base: 20 },
  { name: '電気修理', category: '運動・行動', base: 10 },
  { name: '製作', category: '運動・行動', base: 5 },
  { name: 'こぶし', category: '戦闘', base: 50 },
  { name: 'キック', category: '戦闘', base: 25 },
  { name: '組み付き', category: '戦闘', base: 25 },
  { name: '頭突き', category: '戦闘', base: 10 },
  { name: 'マーシャルアーツ', category: '戦闘', base: 1 },
  { name: '拳銃', category: '戦闘', base: 20 },
  { name: 'サブマシンガン', category: '戦闘', base: 15 },
  { name: 'ショットガン', category: '戦闘', base: 30 },
  { name: 'ライフル', category: '戦闘', base: 25 },
  { name: 'マシンガン', category: '戦闘', base: 15 },
];

export function resolveSkillBase(base: SkillBaseFormula, characteristics: CoCCharacteristics) {
  if (base === 'dex2') return characteristics.dex * 2;
  if (base === 'edu5') return characteristics.edu * 5;
  return base;
}

export function createSkillMap(characteristics: CoCCharacteristics, totals: Record<string, number> = {}): CoCSkillMap {
  return Object.fromEntries(
    cocSkillDefinitions.map((definition) => {
      const base = resolveSkillBase(definition.base, characteristics);
      const total = totals[definition.name];
      return [
        definition.name,
        normalizeSkillEntry(total === undefined ? undefined : total, base),
      ];
    }),
  );
}

export function normalizeSkillEntry(value: unknown, base: number): CoCSkillEntry {
  if (typeof value === 'number') {
    return createEntry(base, 0, 0, 0, Math.max(0, value - base));
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEntry(base, 0, 0, 0, 0);
  }

  const input = value as Partial<Record<keyof CoCSkillEntry, unknown>>;
  return createEntry(
    base,
    toSkillPoint(input.occupation),
    toSkillPoint(input.interest),
    toSkillPoint(input.growth),
    toSkillPoint(input.other),
  );
}

export function getSkillTotal(entry: CoCSkillEntry | undefined) {
  if (!entry) return 0;
  return entry.base + entry.occupation + entry.interest + entry.growth + entry.other;
}

export function getSkillCategories() {
  return [...new Set(cocSkillDefinitions.map((definition) => definition.category))];
}

function createEntry(base: number, occupation: number, interest: number, growth: number, other: number): CoCSkillEntry {
  return {
    base: toSkillPoint(base),
    occupation,
    interest,
    growth,
    other,
  };
}

function toSkillPoint(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(999, Math.max(0, Math.trunc(parsed)));
}
