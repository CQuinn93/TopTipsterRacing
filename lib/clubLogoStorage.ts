import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const BUCKET = 'club-logos';
const MAX_BYTES = 2 * 1024 * 1024;

function extFromMime(mime: string | undefined): string {
  if (!mime) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

export async function pickClubLogoImage(): Promise<{
  uri: string;
  mimeType: string;
  fileName: string;
} | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo library permission is required to upload a logo.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.82,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const ext = extFromMime(mimeType);
  return {
    uri: asset.uri,
    mimeType,
    fileName: asset.fileName ?? `logo.${ext}`,
  };
}

/** Upload a picked image into club-logos/{ownerOrTargetUserId}/logo-{ts}.{ext} */
export async function uploadClubLogo(params: {
  /** Folder owner — usually the gamemaster user id (Owner can upload into any folder). */
  userId: string;
  uri: string;
  mimeType?: string;
  fileName?: string;
}): Promise<string> {
  const mime = params.mimeType ?? 'image/jpeg';
  const ext = extFromMime(mime);
  const path = `${params.userId}/logo-${Date.now()}.${ext}`;

  const response = await fetch(params.uri);
  const blob = await response.blob();
  if (blob.size > MAX_BYTES) {
    throw new Error('Logo must be under 2 MB. Try a smaller image.');
  }

  // RN/web: ArrayBuffer upload is most reliable with supabase-js
  const buffer = await blob.arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = data.publicUrl;
  if (!url) throw new Error('Could not resolve logo URL');
  // Cache-bust for immediate hub refresh
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

export function isDesktopWebForOwnerTools(width: number, minWidth = 900): boolean {
  return Platform.OS === 'web' && width >= minWidth;
}
