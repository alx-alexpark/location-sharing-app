import OpenPGP from 'react-native-fast-openpgp';

import { getSecret, saveSecret } from "./secrets";
import { getServerUrl } from './server';

export async function requestAndVerifyToken() {
  const pubkey = await getSecret('publicKey');
  const privkey = await getSecret('privateKey');
  if (!pubkey || !privkey) {
    throw new Error('No keys found. Please generate keys first.');
  }
  const metadata = await OpenPGP.getPublicKeyMetadata(pubkey);
  const keyId = metadata.keyID;
  const serverUrl = await getServerUrl();
  const tokenResponse = await fetch(`${serverUrl}/api/requestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyid: keyId }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Token request failed: ${tokenResponse.status}`);
  }
  const { challenge } = await tokenResponse.json();
  const signedMessage = `-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\n${challenge}\n${await OpenPGP.sign(challenge, privkey, '')}`;
  const attestationResponse = await fetch(`${serverUrl}/api/submitAttestation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedChallenge: signedMessage }),
  });
  if (!attestationResponse.ok) {
    throw new Error(`Attestation failed: ${attestationResponse.status}`);
  }
  const { tokenCipherText } = await attestationResponse.json();
  const decryptedToken = await OpenPGP.decrypt(tokenCipherText, privkey, '');
  const tokenData = JSON.parse(decryptedToken);
  await saveSecret('token', tokenData.token);
  return tokenData.token;
}