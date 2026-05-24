import { supabase } from './supabase';
import type { Character } from './types';

export type CharacterRow = {
  id: string;
  name: string;
  player_name: string | null;
  archetype: string | null;
  color: string | null;
  memo: string | null;
  owner_id: string | null;
  occupation: string | null;
  age: string | null;
  gender: string | null;
  height: string | null;
  weight: string | null;
  hair_color: string | null;
  eye_color: string | null;
  skin_color: string | null;
  residence: string | null;
  birthplace: string | null;
  image_path: string | null;
  tags: unknown;
  characteristics: unknown;
  skills: unknown;
  weapons: string | null;
  possessions: string | null;
  background: unknown;
  sanity_current: number | null;
  hit_points_current: number | null;
  magic_points_current: number | null;
  is_archived: boolean | null;
};

export async function fetchCharactersApi(roomId: string) {
  const response = await apiRequest(`/api/characters?roomId=${encodeURIComponent(roomId)}`);
  return (response.characters ?? []) as CharacterRow[];
}

export async function createCharacterApi(roomId: string, character: Character) {
  const response = await apiRequest('/api/characters', {
    method: 'POST',
    body: JSON.stringify({ roomId, character }),
  });
  return response.character as CharacterRow;
}

export async function updateCharacterApi(roomId: string, character: Character) {
  const response = await apiRequest(`/api/characters/${encodeURIComponent(character.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ roomId, character }),
  });
  return response.character as CharacterRow;
}

export async function archiveCharacterApi(roomId: string, characterId: string) {
  await apiRequest(`/api/characters/${encodeURIComponent(characterId)}/archive`, {
    method: 'POST',
    body: JSON.stringify({ roomId }),
  });
}

export async function apiRequest(path: string, init: RequestInit = {}) {
  if (!supabase) throw new Error('Supabase is not configured');
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error('ログインセッションを確認できませんでした。');

  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token}`,
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'API request failed');
  }
  return payload;
}
