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

/**
 * Generates a new key pair and saves it. Returns the public key ID.
 */
export async function handleGenerateKeys(options: any, setPublicKey: (key: string) => void, getSecret: (key: string) => Promise<string | null>) {
  const generatedPublicKey = await generateAndSaveKeys(options);
  setPublicKey(generatedPublicKey);
  const pubkey = await getSecret("publicKey");
  const metadata = await OpenPGP.getPublicKeyMetadata(pubkey!);
  setPublicKey(metadata.keyID);
  return metadata.keyID;
}

/**
 * Sends the public key to the server.
 */
export async function handleSendKey(getSecret: (key: string) => Promise<string | null>, sendKeyToServer: (pubkey: string, serverUrl: string) => Promise<any>, serverUrl: string) {
  const pubkey = await getSecret("publicKey");
  if (pubkey) {
    await sendKeyToServer(pubkey, serverUrl);
    return { success: true };
  } else {
    return { success: false, error: 'No public key found. Please generate keys first.' };
  }
}

/**
 * Requests a token from the server and verifies it.
 */
export async function handleRequestToken(requestAndVerifyToken: any, OpenPGP: any, getSecret: any, saveSecret: any, serverUrl: string) {
  try {
    await requestAndVerifyToken(OpenPGP, getSecret, saveSecret, serverUrl);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to complete token request flow', details: error };
  }
}

/**
 * Creates a new group on the server.
 */
export async function handleCreateGroup({ groupName, memberKeyIds, getSecret, serverUrl, setShowGroupDialog, setGroupName, setMemberKeyIds }: {
  groupName: string,
  memberKeyIds: string,
  getSecret: (key: string) => Promise<string | null>,
  serverUrl: string,
  setShowGroupDialog: (show: boolean) => void,
  setGroupName: (name: string) => void,
  setMemberKeyIds: (ids: string) => void,
}) {
  try {
    const token = await getSecret('token');
    if (!token) {
      return { success: false, error: 'No token found. Please request a token first.' };
    }
    const response = await fetch(`${serverUrl}/api/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: groupName,
        memberKeyIds: memberKeyIds.split(',').map(id => id.trim())
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: `Failed to create group: ${errorData.error}` };
    }
    setShowGroupDialog(false);
    setGroupName('');
    setMemberKeyIds('');
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to create group', details: error };
  }
}

/**
 * Sends a location update to all groups, encrypting for each group member and caching public keys.
 * Takes a Location.LocationObject directly instead of getting current location.
 */
export async function handleLocationUpdate({
  location,
}: {
  location: Location.LocationObject
}) {
  try {
    const serverUrl = await SecureStore.getItemAsync('serverUrl');
    if (!serverUrl) throw new Error('Server URL not set. Please set it first.');
    
    const token = await getSecret('token');
    const privkey = await getSecret('privateKey');
    if (!token || !privkey) {
      return { success: false, error: 'Missing token or private key.' };
    }

    const groupsRes = await fetch(`${serverUrl}/api/groups`, {
      headers: { 'authorization': `Bearer ${token}` }
    });
    if (!groupsRes.ok) throw new Error('Failed to fetch groups');
    const groups = await groupsRes.json();

    for (const group of groups) {
      const otherMembers = group.members.filter((m: any) => m.keyid !== group.myKeyId);
      if (otherMembers.length === 0) continue;

      const pubkeyArr = [];
      for (const member of otherMembers) {
        let pubkey = await SecureStore.getItemAsync(`pubkey-${member.keyid}`);
        if (!pubkey) {
          const res = await fetch(`${serverUrl}/api/keys?keyId=${encodeURIComponent(member.keyid)}`, {
            headers: { 'authorization': `Bearer ${token}` }
          });
          if (!res.ok) throw new Error('Failed to fetch public key for ' + member.keyid);
          const data = await res.json();
          if (data.publicKey) {
            const metadata = await OpenPGP.getPublicKeyMetadata(data.publicKey);
            if (metadata.keyID === member.keyid) {
              await SecureStore.setItemAsync(`pubkey-${member.keyid}`, data.publicKey);
              pubkey = data.publicKey;
            }
          }
        }
        if (pubkey) pubkeyArr.push(pubkey);
      }

      if (pubkeyArr.length === 0) continue;

      const locationData = {
        groupId: group.id,
        timestamp: new Date().toISOString(),
        coords: location.coords
      };

      const plaintext = JSON.stringify(locationData);
      const publicKeys = pubkeyArr.join('\n');
      const ciphertext = await OpenPGP.encrypt(plaintext, publicKeys);

      const postRes = await fetch(`${serverUrl}/api/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${token}` },
        body: JSON.stringify({ groupIds: [group.id], cipherText: ciphertext })
      });
      if (!postRes.ok) throw new Error('Failed to post location');
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to send location update', details: e };
  }
}

/**
 * Sets the server URL in SecureStore and updates state.
 */
export async function handleSaveServerUrl(serverUrlInput: string, setServerUrl: (url: string) => void, setShowServerModal: (show: boolean) => void) {
  if (!serverUrlInput.startsWith('http://') && !serverUrlInput.startsWith('https://')) {
    return { success: false, error: 'URL must start with http:// or https://' };
  }
  await SecureStore.setItemAsync('serverUrl', serverUrlInput);
  setServerUrl(serverUrlInput);
  setShowServerModal(false);
  return { success: true };
}

/**
 * Prepares to show the server URL modal.
 */
export function handleSetServerUrl(serverUrl: string, setServerUrlInput: (url: string) => void, setShowServerModal: (show: boolean) => void) {
  setServerUrlInput(serverUrl);
  setShowServerModal(true);
} 
