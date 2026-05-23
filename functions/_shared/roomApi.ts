import {
  ApiError,
  createAuthenticatedSupabase,
  getParam,
  handleApiError,
  json,
  numberOrNull,
  optionalUuid,
  readJsonObject,
  requireUuid,
  requiredText,
  tags,
  text,
} from './authApi';
import type { PagesContext } from './authApi';

const roomColumns = 'id, title, summary, tags, created_by';
const sceneColumns = 'id, room_id, created_by, title, status, summary, location_name, time_label, map_x, map_y, tags, created_at';
const messageColumns = 'id, character_id, author_id, mode, body, created_at, profiles(display_name), characters(name)';
const sceneStatuses = new Set(['active', 'paused', 'archived']);
const messageModes = new Set(['ic', 'ooc']);

export { handleApiError };

export async function createRoom(context: PagesContext) {
  const { supabase, userId } = await createAuthenticatedSupabase(context);
  const body = await readJsonObject(context.request);
  const input = object(body.room ?? body, 'room');
  const payload = sanitizeRoomPayload(input);

  const { data: room, error } = await supabase
    .from('rooms')
    .insert({ ...payload, created_by: userId })
    .select(roomColumns)
    .single();

  if (error) throw new ApiError(400, error.message);

  const { error: memberError } = await supabase.from('room_members').insert({
    room_id: room.id,
    user_id: userId,
    role: 'owner',
  });
  if (memberError) throw new ApiError(400, memberError.message);

  return json({ room }, 201);
}

export async function updateRoom(context: PagesContext) {
  const { supabase } = await createAuthenticatedSupabase(context);
  const id = requireUuid(getParam(context, 'id'), 'id');
  const body = await readJsonObject(context.request);
  const input = object(body.room ?? body, 'room');

  const { data, error } = await supabase
    .from('rooms')
    .update(sanitizeRoomPayload(input))
    .eq('id', id)
    .select(roomColumns)
    .single();

  if (error) throw new ApiError(400, error.message);
  return json({ room: data });
}

export async function deleteRoom(context: PagesContext) {
  const { supabase, userId } = await createAuthenticatedSupabase(context);
  const id = requireUuid(getParam(context, 'id'), 'id');

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('created_by')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (roomError) throw new ApiError(400, roomError.message);
  if (!room) throw new ApiError(404, 'Room not found');

  const isCreator = room.created_by === userId;

  if (!isCreator) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle();

    const discordUserId = profile?.email?.startsWith('discord:')
      ? profile.email.slice('discord:'.length)
      : null;

    if (!discordUserId) throw new ApiError(403, 'ルームを削除する権限がありません。');

    const { data: account } = await supabase
      .from('allowed_discord_accounts')
      .select('role')
      .eq('discord_user_id', discordUserId)
      .eq('is_active', true)
      .maybeSingle();

    if (account?.role !== 'owner') throw new ApiError(403, 'ルームを削除する権限がありません。');
  }

  const { error } = await supabase
    .from('rooms')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new ApiError(400, error.message);
  return json({ deleted: true, id });
}

export async function createScene(context: PagesContext) {
  const { supabase, userId } = await createAuthenticatedSupabase(context);
  const body = await readJsonObject(context.request);
  const input = object(body.scene ?? body, 'scene');
  const payload = sanitizeScenePayload(input);

  const { data, error } = await supabase
    .from('scenes')
    .insert({ ...payload, created_by: userId })
    .select(sceneColumns)
    .single();

  if (error) throw new ApiError(400, error.message);
  return json({ scene: data }, 201);
}

export async function updateScene(context: PagesContext) {
  const { supabase } = await createAuthenticatedSupabase(context);
  const id = requireUuid(getParam(context, 'id'), 'id');
  const body = await readJsonObject(context.request);
  const input = object(body.scene ?? body, 'scene');

  const { data, error } = await supabase
    .from('scenes')
    .update(sanitizeScenePayload(input, false))
    .eq('id', id)
    .select(sceneColumns)
    .single();

  if (error) throw new ApiError(400, error.message);
  return json({ scene: data });
}

export async function deleteScene(context: PagesContext) {
  const { supabase } = await createAuthenticatedSupabase(context);
  const id = requireUuid(getParam(context, 'id'), 'id');

  const { error } = await supabase.from('scenes').delete().eq('id', id);
  if (error) throw new ApiError(400, error.message);
  return json({ deleted: true, id });
}

export async function createMessage(context: PagesContext) {
  const { supabase, userId } = await createAuthenticatedSupabase(context);
  const body = await readJsonObject(context.request);
  const roomId = requireUuid(body.roomId, 'roomId');
  const sceneId = optionalUuid(body.sceneId);
  const characterId = optionalUuid(body.characterId);
  const mode = text(body.mode, 10);
  if (!messageModes.has(mode)) throw new ApiError(400, 'mode is invalid');

  const { data, error } = await supabase
    .from('rp_messages')
    .insert({
      room_id: roomId,
      scene_id: sceneId,
      character_id: characterId,
      author_id: userId,
      mode,
      body: requiredText(body.body, 4000, 'body'),
    })
    .select(messageColumns)
    .single();

  if (error) throw new ApiError(400, error.message);
  return json({ message: data }, 201);
}

export async function updateMessage(context: PagesContext) {
  const { supabase } = await createAuthenticatedSupabase(context);
  const id = requireUuid(getParam(context, 'id'), 'id');
  const body = await readJsonObject(context.request);

  const { data, error } = await supabase
    .from('rp_messages')
    .update({ body: requiredText(body.body, 4000, 'body') })
    .eq('id', id)
    .select(messageColumns)
    .single();

  if (error) throw new ApiError(400, error.message);
  return json({ message: data });
}

export async function deleteMessage(context: PagesContext) {
  const { supabase } = await createAuthenticatedSupabase(context);
  const id = requireUuid(getParam(context, 'id'), 'id');

  const { error } = await supabase.from('rp_messages').delete().eq('id', id);
  if (error) throw new ApiError(400, error.message);
  return json({ deleted: true, id });
}

function sanitizeRoomPayload(input: Record<string, unknown>) {
  return {
    title: requiredText(input.title, 120, 'title'),
    summary: text(input.summary, 2000).trim(),
    tags: tags(input.tags),
  };
}

function sanitizeScenePayload(input: Record<string, unknown>, requireRoom = true) {
  const status = text(input.status, 20) || 'active';
  if (!sceneStatuses.has(status)) throw new ApiError(400, 'status is invalid');
  const payload: Record<string, unknown> = {
    title: requiredText(input.title, 120, 'title'),
    summary: text(input.summary, 4000).trim(),
    status,
    location_name: text(input.locationName ?? input.location_name, 160).trim(),
    time_label: text(input.timeLabel ?? input.time_label, 120).trim(),
    map_x: numberOrNull(input.mapX ?? input.map_x, 0, 100),
    map_y: numberOrNull(input.mapY ?? input.map_y, 0, 100),
    tags: tags(input.tags),
  };
  if (requireRoom) payload.room_id = requireUuid(input.roomId ?? input.room_id, 'roomId');
  return payload;
}

function object(value: unknown, fieldName: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, `${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}
