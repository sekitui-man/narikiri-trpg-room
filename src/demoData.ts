import type { Character, RpMessage, Scene } from './types';

export const demoCharacters: Character[] = [
  {
    id: 'ren',
    name: '蓮',
    player: 'Hinata',
    archetype: '情報屋',
    color: '#000000',
    memo: '表向きは酒場の常連。相手の嘘に気づいても、すぐには指摘しない。',
  },
  {
    id: 'mira',
    name: 'ミラ',
    player: 'Guest',
    archetype: '星詠み',
    color: '#0057FF',
    memo: '古い予言を追っている。丁寧語だが、核心では強く踏み込む。',
  },
  {
    id: 'gm',
    name: '語り手',
    player: 'GM',
    archetype: '進行',
    color: '#666666',
    memo: '場面描写、NPC、判定結果を担当する。',
  },
];

export const demoScenes: Scene[] = [
  {
    id: 'tavern',
    title: '夜明け前の酒場',
    status: 'active',
    summary: '雨音が屋根を打つ。閉店後の酒場に、まだ灯りがひとつ残っている。',
  },
  {
    id: 'archive',
    title: '港の倉庫街',
    status: 'paused',
    summary: '前回、黒い封蝋の手紙が発見された。',
  },
];

export const demoMessages: RpMessage[] = [
  {
    id: 'm1',
    characterId: 'gm',
    author: '語り手',
    mode: 'ic',
    body: '雨は弱まらない。窓の外で馬車の車輪が軋み、店主は無言で奥の扉を指した。',
    createdAt: '23:41',
  },
  {
    id: 'm2',
    characterId: 'ren',
    author: '蓮',
    mode: 'ic',
    body: '「こんな時間に客を残す店じゃない。奥にいるのは、俺たちを待ってた奴か？」',
    createdAt: '23:43',
  },
  {
    id: 'm3',
    characterId: 'mira',
    author: 'ミラ',
    mode: 'ic',
    body: '「星の位置が変です。ここで会うべき相手は、たぶん一人ではありません」',
    createdAt: '23:44',
  },
  {
    id: 'm4',
    characterId: null,
    author: 'Hinata',
    mode: 'ooc',
    body: '次の返答で奥の扉を開ける流れにして大丈夫です。',
    createdAt: '23:45',
  },
];
