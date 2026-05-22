import { createClient } from '@supabase/supabase-js';

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

export type PagesContext = {
  env: Env;
  request: Request;
  params?: Record<string, string | string[]>;
};

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function createAuthenticatedSupabase(context: PagesContext) {
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

export async function readJsonObject(request: Request) {
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

export function requireUuid(value: unknown, fieldName: string) {
  const next = typeof value === 'string' ? value : '';
  if (!uuidPattern.test(next)) throw new ApiError(400, `${fieldName} must be a UUID`);
  return next;
}

export function optionalUuid(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  return requireUuid(value, 'uuid');
}

export function getParam(context: PagesContext, name: string) {
  const value = context.params?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export function text(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return '';
  return String(value).slice(0, maxLength);
}

export function requiredText(value: unknown, maxLength: number, fieldName: string) {
  const next = text(value, maxLength).trim();
  if (!next) throw new ApiError(400, `${fieldName} is required`);
  return next;
}

export function tags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => text(tag, 40).trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function numberOrNull(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  return json({ error: 'Internal server error' }, 500);
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
