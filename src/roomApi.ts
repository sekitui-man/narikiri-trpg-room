import { apiRequest } from './characterApi';
import type { Room, RpMessage, Scene } from './types';

export async function createRoomApi(room: Pick<Room, 'title' | 'summary' | 'tags'>) {
  const response = await apiRequest('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ room }),
  });
  return response.room as RoomRow;
}

export async function updateRoomApi(room: Room) {
  const response = await apiRequest(`/api/rooms/${encodeURIComponent(room.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ room }),
  });
  return response.room as RoomRow;
}

export async function createSceneApi(scene: Scene) {
  const response = await apiRequest('/api/scenes', {
    method: 'POST',
    body: JSON.stringify({ scene }),
  });
  return response.scene as SceneRow;
}

export async function updateSceneApi(scene: Scene) {
  const response = await apiRequest(`/api/scenes/${encodeURIComponent(scene.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ scene }),
  });
  return response.scene as SceneRow;
}

export async function deleteSceneApi(sceneId: string) {
  await apiRequest(`/api/scenes/${encodeURIComponent(sceneId)}`, { method: 'DELETE' });
}

export async function createMessageApi(message: {
  roomId: string;
  sceneId: string | null;
  characterId: string | null;
  mode: RpMessage['mode'];
  body: string;
}) {
  const response = await apiRequest('/api/messages', {
    method: 'POST',
    body: JSON.stringify(message),
  });
  return response.message as MessageRow;
}

export async function updateMessageApi(messageId: string, body: string) {
  const response = await apiRequest(`/api/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
  return response.message as MessageRow;
}

export async function deleteMessageApi(messageId: string) {
  await apiRequest(`/api/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
}

export type RoomRow = {
  id: string;
  title: string;
  summary: string | null;
  tags: string[] | null;
  created_by: string | null;
};

export type SceneRow = {
  id: string;
  room_id: string | null;
  created_by: string | null;
  title: string;
  status: string | null;
  summary: string | null;
  location_name: string | null;
  time_label: string | null;
  map_x: number | null;
  map_y: number | null;
  tags: string[] | null;
  created_at: string | null;
};

export type MessageRow = {
  id: string;
  character_id: string | null;
  author_id: string | null;
  mode: RpMessage['mode'];
  body: string;
  created_at: string;
  characters?: { name?: string | null } | Array<{ name?: string | null }> | null;
  profiles?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
};
