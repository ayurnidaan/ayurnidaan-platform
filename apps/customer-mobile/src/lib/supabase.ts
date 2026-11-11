import 'react-native-url-polyfill/auto';

import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from '../config/env';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const secureStoreChunkSize = 1800;
type SecureStoreManifest = { chunked: true; id: string; count: number };
const parseManifest = (value: string | null): SecureStoreManifest | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SecureStoreManifest>;
    return parsed.chunked === true && typeof parsed.id === 'string' && /^[a-z0-9-]{6,40}$/.test(parsed.id) && Number.isInteger(parsed.count) && Number(parsed.count) > 0 && Number(parsed.count) <= 64
      ? { chunked: true, id: parsed.id, count: Number(parsed.count) }
      : null;
  } catch { return null; }
};
const chunkKey = (key: string, manifest: SecureStoreManifest, index: number) => `${key}.${manifest.id}.${index}`;
const removeChunks = async (key: string, manifest: SecureStoreManifest | null) => {
  if (!manifest) return;
  await Promise.all(Array.from({ length: manifest.count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, manifest, index))));
};
const secureSessionStorage = {
  async getItem(key: string) {
    const stored = await SecureStore.getItemAsync(key);
    const manifest = parseManifest(stored);
    if (!manifest) return stored;
    const chunks = await Promise.all(Array.from({ length: manifest.count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, manifest, index))));
    return chunks.every((chunk): chunk is string => typeof chunk === 'string') ? chunks.join('') : null;
  },
  async setItem(key: string, value: string) {
    const previousManifest = parseManifest(await SecureStore.getItemAsync(key));
    const manifest: SecureStoreManifest = { chunked: true, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, count: Math.max(1, Math.ceil(value.length / secureStoreChunkSize)) };
    await Promise.all(Array.from({ length: manifest.count }, (_, index) => SecureStore.setItemAsync(chunkKey(key, manifest, index), value.slice(index * secureStoreChunkSize, (index + 1) * secureStoreChunkSize), secureStoreOptions)));
    await SecureStore.setItemAsync(key, JSON.stringify(manifest), secureStoreOptions);
    await removeChunks(key, previousManifest);
  },
  async removeItem(key: string) {
    const manifest = parseManifest(await SecureStore.getItemAsync(key));
    await SecureStore.deleteItemAsync(key);
    await removeChunks(key, manifest);
  },
};

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    ...(Platform.OS === 'web' ? {} : { storage: secureSessionStorage }),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
