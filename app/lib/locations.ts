import OpenPGP from 'react-native-fast-openpgp';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { getSecret, saveSecret } from './secrets';

export async function getCurrentLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is required.');
  }
  return await Location.getCurrentPositionAsync({});
}

export async function sendLocationUpdate({
  location,
}: {
  location: Location.LocationObject
}) {
  try {
    const serverUrl = await getSecret('serverUrl');
    if (!serverUrl) throw new Error('Server URL not set. Please set it first.');
    
    const token = await getSecret('token');
    const privkey = await getSecret('privateKey');
    if (!token || !privkey) {
      return { success: false, error: 'Missing token or private key.' };
    }

    console.log("SENDING API REQ NOW")

    const groupsRes = await fetch(`${serverUrl}/api/groups`, {
      headers: { 'authorization': `Bearer ${token}` }
    });
    if (!groupsRes.ok) throw new Error('Failed to fetch groups');
    const groups = await groupsRes.json();

    console.log("FETCHED GROUPS")

    for (const group of groups) {
      const otherMembers = group.members.filter((m: any) => m.keyid !== group.myKeyId);
      if (otherMembers.length === 0) continue;

      const pubkeyArr = [];
      for (const member of otherMembers) {
        let pubkey = await getSecret(`pubkey-${member.keyid}`);
        if (!pubkey) {
          const res = await fetch(`${serverUrl}/api/keys?keyId=${encodeURIComponent(member.keyid)}`, {
            headers: { 'authorization': `Bearer ${token}` }
          });
          if (!res.ok) throw new Error('Failed to fetch public key for ' + member.keyid);
          const data = await res.json();
          if (data.publicKey) {
            const metadata = await OpenPGP.getPublicKeyMetadata(data.publicKey);
            if (metadata.keyID === member.keyid) {
              await saveSecret(`pubkey-${member.keyid}`, data.publicKey);
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
    console.error('Location update error:', e);
    return { success: false, error: e.message || 'Failed to send location update', details: e };
  }
}

export async function checkBackgroundLocationStatus() {
  try {
    const foregroundStatus = await Location.getForegroundPermissionsAsync();
    const backgroundStatus = await Location.getBackgroundPermissionsAsync();
    
    console.log('=== Background Location Status ===');
    console.log('Foreground permission:', foregroundStatus.status);
    console.log('Background permission:', backgroundStatus.status);
    console.log('Can ask again (foreground):', foregroundStatus.canAskAgain);
    console.log('Can ask again (background):', backgroundStatus.canAskAgain);
    
    const taskStatus = await TaskManager.isTaskRegisteredAsync('background-location-task');
    console.log('Task registered:', taskStatus);
    
    if (taskStatus) {
      const taskInfo = await TaskManager.getTaskOptionsAsync('background-location-task');
      console.log('Task options:', taskInfo);
    }
    
    return {
      foregroundStatus: foregroundStatus.status,
      backgroundStatus: backgroundStatus.status,
      taskRegistered: taskStatus,
      canAskForeground: foregroundStatus.canAskAgain,
      canAskBackground: backgroundStatus.canAskAgain
    };
  } catch (error) {
    console.error('Error checking background location status:', error);
    return null;
  }
}
