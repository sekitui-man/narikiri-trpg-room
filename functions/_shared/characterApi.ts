import { createClient } from '@supabase/supabase-js';

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

type PagesContext = {
  env: Env;
  request: Request;
  params?: Record<string, string | string[]>;
};

type CharacteristicKey = 'str' | 'con' | 'siz' | 'int' | 'pow' | 'dex' | 'app' | 'edu';
type BackgroundKey =
  | 'description'
  | 'ideology'
  | 'significantPeople'
  | 'meaningfulLocations'
  | 'treasuredPossessions'
  | 'traits'
  | 'injuries'
  | 'phobias'
  | 'tomes'
  | 'encounters';

const characterColumns =
  'id, name, player_name, archetype, color, memo, owner_id, occupation, age, gender, residence, birthplace, characteristics, skills, weapons, possessions, background, sanity_current, hit_points_current, magic_points_current, is_archived';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const colorPattern = /^#[0-9a-fA-F]{6}$/;
const characteristicKeys: CharacteristicKey[] = ['str', 'con', 'siz', 'int', 'pow', 'dex', 'app', 'edu'];
const backgroundKeys: BackgroundKey[] = [
  'description',
  'ideology',
  'significantPeople',
  'meaningfulLocations',
  'treasuredPossessions',
  'traits',
  'injuries',
  'phobias',
  'tomes',
  'encounters',
];

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function listCharacters(context: PagesContext) {
  const { supabase } = await createAuthenticatedSupabase(context);
  const roomId = requireUuid(new URL(context.request.url).searchParams.get('roomId'), 'roomId');

  const { data, error } = await supabase
    .from('characters')
    .select(characterColumns)
    .eq('room_id', roomId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) throw new ApiError(400, error.message);
  return json({ characters: data ?? [] });
}

export async function createCharacter(context: PagesContext) {
  const { supabase, userId } = await createAuthenticatedSupabase(context);
  const body = await readJsonObject(context.request);
  const roomId = requireUuid(body.roomId, 'roomId');
  const payload = sanitizeCharacterPayload(body.character ?? body);

  const { data, error } = await supabase
    .from('characters')
    .insert({
      ...payload,
      room_id: roomId,
      owner_id: userId,
      is_archived: false,
    })
    .select(characterColumns)
    .single();

  if (error) throw new ApiError(400, error.message);
  return json({ character: data }, 201);
}

export async function updateCharacter(context: PagesContext) {
  const { supabase } = await createAuthenticatedSupabase(context);
  const id = requireUuid(getParam(context, 'id'), 'id');
  const body = await readJsonObject(context.request);
  const roomId = requireUuid(body.roomId, 'roomId');
  const payload = sanitizeCharacterPayload(body.character ?? body);

  const { data, error } = await supabase
    .from('characters')
    .update(payload)
    .eq('id', id)
    .eq('room_id', roomId)
    .select(characterColumns)
    .single();

  if (error) throw new ApiError(400, error.message);
  return json({ character: data });
}

export async function archiveCharacter(context: PagesContext) {
  const { supabase } = await createAuthenticatedSupabase(context);
  const id = requireUuid(getParam(context, 'id'), 'id');
  const body = await readJsonObject(context.request);
  const roomId = requireUuid(body.roomId, 'roomId');

  const { data, error } = await supabase
    .from('characters')
    .update({ is_archived: true })
    .eq('id', id)
    .eq('room_id', roomId)
    .select('id')
    .single();

  if (error) throw new ApiError(400, error.message);
  return json({ archived: true, id: data.id });
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  return json({ error: 'Internal server error' }, 500);
}

function sanitizeCharacterPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'character must be an object');
  }
  const input = value as Record<string, unknown>;
  const characteristics = sanitizeCharacteristics(input.characteristics);
  const occupation = text(input.occupation, 80);

  return {
    name: requiredText(input.name, 80, 'name'),
    player_name: text(input.player ?? input.player_name, 80),
    archetype: text(input.archetype ?? occupation, 80),
    color: color(input.color),
    memo: text(input.memo, 2000),
    occupation,
    age: text(input.age, 40),
    gender: text(input.gender, 40),
    residence: text(input.residence, 120),
    birthplace: text(input.birthplace, 120),
    characteristics,
    skills: sanitizeSkills(input.skills),
    weapons: text(input.weapons, 2000),
    possessions: text(input.possessions, 2000),
    background: sanitizeBackground(input.background),
    sanity_current: int(input.sanityCurrent ?? input.sanity_current, 0, 999, characteristics.pow * 5),
    hit_points_current: int(input.hitPointsCurrent ?? input.hit_points_current, 0, 999, Math.ceil((characteristics.con + characteristics.siz) / 2)),
    magic_points_current: int(input.magicPointsCurrent ?? input.magic_points_current, 0, 999, characteristics.pow),
  };
}

async function createAuthenticatedSupabase(context: PagesContext) {
  const supabaseUrl = context.env.SUPABASE_URL ?? context.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = context.env.SUPABASE_ANON_KEY ?? context.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new ApiError(500, 'Supabase environment is not configured');

  const authorization = context.request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new ApiError(401, 'Missing bearer token');
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw new ApiError(401, 'Missing bearer token');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'Invalid session');
  return { supabase, userId: data.user.id };
}

async function readJsonObject(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON body');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'JSON body must be an object');
  }
  return value as Record<string, unknown>;
}

function sanitizeCharacteristics(value: unknown) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(characteristicKeys.map((key) => [key, int(input[key], 0, 99, 10)]));
}

function sanitizeSkills(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, number | Record<string, number>> = {};
  for (const [rawName, rawSkill] of Object.entries(value as Record<string, unknown>)) {
    const name = rawName.trim();
    if (!name || name.length > 60) continue;
    if (rawSkill && typeof rawSkill === 'object' && !Array.isArray(rawSkill)) {
      const entry = rawSkill as Record<string, unknown>;
      output[name] = {
        base: int(entry.base, 0, 999, 0),
        occupation: int(entry.occupation, 0, 999, 0),
        interest: int(entry.interest, 0, 999, 0),
        growth: int(entry.growth, 0, 999, 0),
        other: int(entry.other, 0, 999, 0),
      };
      continue;
    }
    output[name] = int(rawSkill, 0, 999, 0);
  }
  return output;
}

function sanitizeBackground(value: unknown) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(backgroundKeys.map((key) => [key, text(input[key], 2000)]));
}

function requiredText(value: unknown, maxLength: number, fieldName: string) {
  const next = text(value, maxLength).trim();
  if (!next) throw new ApiError(400, `${fieldName} is required`);
  return next;
}

function text(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return '';
  return String(value).slice(0, maxLength);
}

function color(value: unknown) {
  const next = text(value, 7);
  return colorPattern.test(next) ? next : '#090909';
}

function int(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function requireUuid(value: unknown, fieldName: string) {
  const next = typeof value === 'string' ? value : '';
  if (!uuidPattern.test(next)) throw new ApiError(400, `${fieldName} must be a UUID`);
  return next;
}

function getParam(context: PagesContext, name: string) {
  const value = context.params?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
