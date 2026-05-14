export type Character = {
  id: string;
  name: string;
  player: string;
  archetype: string;
  color: string;
  memo: string;
};

export type Scene = {
  id: string;
  title: string;
  status: 'active' | 'paused' | 'archived';
  summary: string;
};

export type RpMessage = {
  id: string;
  characterId: string | null;
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
