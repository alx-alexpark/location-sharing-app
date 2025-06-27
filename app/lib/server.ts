import { getSecret, saveSecret } from "./secrets";

export async function saveServerUrl(serverUrl: string) {
  if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
    return { success: false, error: 'URL must start with http:// or https://' };
  }
  await saveSecret('serverUrl', serverUrl);
  return { success: true };
}

export async function getServerUrl() {
  return await getSecret("serverUrl");
}