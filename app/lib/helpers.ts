// Helper functions for location sharing app
import * as SecureStore from 'expo-secure-store';
import OpenPGP from 'react-native-fast-openpgp';
import * as Location from 'expo-location';

export async function saveSecret(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}

export async function getSecret(key: string) {
  return await SecureStore.getItemAsync(key);
}

export async function generateAndSaveKeys(OpenPGPOptions: any) {
  const generated = await OpenPGP.generate(OpenPGPOptions);
  await saveSecret('publicKey', generated.publicKey);
  await saveSecret('privateKey', generated.privateKey);
  return generated.publicKey;
}

export async function sendKeyToServer(pubkey: string, serverUrl: string) {
  try {
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
  } catch (error) {
    throw error;
  }
}

export async function requestAndVerifyToken(OpenPGP: any, getSecret: any, saveSecret: any, serverUrl: string) {
  try {
    const pubkey = await getSecret('publicKey');
    const privkey = await getSecret('privateKey');
    if (!pubkey || !privkey) {
      throw new Error('No keys found. Please generate keys first.');
    }
    const metadata = await OpenPGP.getPublicKeyMetadata(pubkey);
    const keyId = metadata.keyID;
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
  } catch (error) {
    throw error;
  }
}

export async function getCurrentLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is required.');
  }
  return await Location.getCurrentPositionAsync({});
} 