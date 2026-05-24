import { supabase } from './supabase';

const characterImageBucket = 'character-images';
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function uploadCharacterImage(file: File, userId: string, previousPath?: string) {
  if (!imageMimeTypes.has(file.type)) throw new Error('画像はJPEG、PNG、WebP、GIFを選択してください。');
  if (file.size > 5 * 1024 * 1024) throw new Error('画像は5MB以下にしてください。');

  const extension = getImageExtension(file);
  return uploadCharacterImageBlob(file, userId, extension, file.type, previousPath);
}

export async function uploadCharacterImageFromUrl(url: string, userId: string, previousPath?: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('いあキャラの画像を取得できませんでした。');
  const blob = await response.blob();
  if (!imageMimeTypes.has(blob.type)) throw new Error('いあキャラの画像形式を確認できませんでした。');
  if (blob.size > 5 * 1024 * 1024) throw new Error('いあキャラの画像が5MBを超えています。');

  return uploadCharacterImageBlob(blob, userId, getImageExtensionFromMime(blob.type), blob.type, previousPath);
}

async function uploadCharacterImageBlob(
  body: Blob,
  userId: string,
  extension: string,
  contentType: string,
  previousPath?: string,
) {
  if (!supabase) throw new Error('Supabase is not configured');
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(characterImageBucket).upload(path, body, {
    cacheControl: '3600',
    contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  if (previousPath && previousPath !== path) {
    await supabase.storage.from(characterImageBucket).remove([previousPath]);
  }

  return {
    path,
    url: getCharacterImagePublicUrl(path),
  };
}

export function getCharacterImagePublicUrl(path: string) {
  if (!supabase || !path) return '';
  return supabase.storage.from(characterImageBucket).getPublicUrl(path).data.publicUrl;
}

function getImageExtension(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'jpg';
}

function getImageExtensionFromMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
}
