import OpenPGP from 'react-native-fast-openpgp';

import { getSecret, saveSecret } from './secrets';
import { getServerUrl } from './server';

export async function generateAndSaveKeys(OpenPGPOptions: any) {
  const generated = await OpenPGP.generate(OpenPGPOptions);
  await saveSecret('publicKey', generated.publicKey);
  await saveSecret('privateKey', generated.privateKey);
  return generated.publicKey;
}

export async function sendKeyToServer() {
  const pubkey = await getSecret("publicKey");
  const serverUrl = getServerUrl();
  const response = await fetch(`${serverUrl}/api/signUp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pubkey }),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data;
}
