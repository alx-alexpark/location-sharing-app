import * as SecureStore from 'expo-secure-store';

export async function saveSecret(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}

export async function getSecret(key: string) {
  return await SecureStore.getItemAsync(key);
}