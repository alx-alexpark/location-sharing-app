import { Image, StyleSheet, Platform, Button, View, Alert, TextInput, Modal, Switch } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useState, useEffect } from 'react';
import OpenPGP, { Curve, KeyPair, Options, PublicKeyMetadata} from "react-native-fast-openpgp";
import React from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { saveSecret, getSecret, generateAndSaveKeys, sendKeyToServer, requestAndVerifyToken, getCurrentLocation, handleGenerateKeys, handleSendKey, handleRequestToken, handleCreateGroup, handleSendLocationUpdate, handleSaveServerUrl, handleSetServerUrl } from '../lib/helpers';

// const LOCATION_TASK_NAME = 'location-updates-task-name';

// interface LocationTaskData {
//   locations: Location.LocationObject[];
// }

// TaskManager.defineTask(LOCATION_TASK_NAME, async (body: TaskManager.TaskManagerTaskBody<LocationTaskData | null>) => {
//   console.log('Background location task fired', body);
//   if (body.error) {
//     console.error('Background location task error:', body.error);
//     return;
//   }
//   if (body.data) {
//     const { locations } = body.data;
//     const location = locations[0];
//     if (location) {
//       try {
//         const serverUrl = await SecureStore.getItemAsync('serverUrl');
//         const token = await SecureStore.getItemAsync('token');
//         const privkey = await SecureStore.getItemAsync('privateKey');
//         if (!serverUrl || !token || !privkey) {
//           console.error('Missing server URL, token, or private key for background update');
//           return;
//         }
//         const groupsRes = await fetch(`${serverUrl}/api/groups`, {
//           headers: { 'authorization': `Bearer ${token}` }
//         });
//         if (!groupsRes.ok) throw new Error('Failed to fetch groups');
//         const groups = await groupsRes.json();
//         for (const group of groups) {
//           const otherMembers = group.members.filter((m: any) => m.keyid !== group.myKeyId);
//           if (otherMembers.length === 0) continue;
//           const pubkeyArr = [];
//           for (const member of otherMembers) {
//             let pubkey = await SecureStore.getItemAsync(`pubkey-${member.keyid}`);
//             if (!pubkey) {
//               const res = await fetch(`${serverUrl}/api/keys?keyId=${encodeURIComponent(member.keyid)}`, {
//                 headers: { 'authorization': `Bearer ${token}` }
//               });
//               if (!res.ok) continue;
//               const data = await res.json();
//               if (data.publicKey) {
//                 const metadata = await OpenPGP.getPublicKeyMetadata(data.publicKey);
//                 if (metadata.keyID === member.keyid) {
//                   await SecureStore.setItemAsync(`pubkey-${member.keyid}`, data.publicKey);
//                   pubkey = data.publicKey;
//                 }
//               }
//             }
//             if (pubkey) pubkeyArr.push(pubkey);
//           }
//           if (pubkeyArr.length === 0) continue;
//           const locationData = {
//             groupId: group.id,
//             timestamp: new Date().toISOString(),
//             coords: location.coords
//           };
//           const plaintext = JSON.stringify(locationData);
//           const publicKeys = pubkeyArr.join('\n');
//           const ciphertext = await OpenPGP.encrypt(plaintext, publicKeys);
//           const postRes = await fetch(`${serverUrl}/api/location`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${token}` },
//             body: JSON.stringify({ groupIds: [group.id], cipherText: ciphertext })
//           });
//           if (!postRes.ok) console.error('Failed to post background location');
//         }
//       } catch (e) {
//         console.error('Background location update error:', e);
//       }
//     }
//   }
// });

export default function HomeScreen() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [memberKeyIds, setMemberKeyIds] = useState('');
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [serverUrl, setServerUrl] = useState<string>('');
  const [serverUrlInput, setServerUrlInput] = useState<string>('');
  const [showServerModal, setShowServerModal] = useState(false);
  const [isBackgroundSharing, setIsBackgroundSharing] = useState(false);
  const [locationSubscription, setLocationSubscription] = useState<Location.LocationSubscription | null>(null);

  useEffect(() => {
    const loadExistingKeys = async () => {
      try {
        const pubkey = await getSecret("publicKey");
        if (pubkey) {
          const metadata = await OpenPGP.getPublicKeyMetadata(pubkey);
          setPublicKey(metadata.keyID);
        }
      } catch (error) {
        console.error('Error loading existing keys:', error);
      }
    };

    loadExistingKeys();
  }, []);

  useEffect(() => {
    const loadServerUrl = async () => {
      const url = await SecureStore.getItemAsync('serverUrl');
      if (url) setServerUrl(url);
    };
    loadServerUrl();
  }, []);

  // Add useEffect for auto-updates
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    // Send initial update immediately
    onSendLocationUpdate(false);
    
    // Then set up interval for every 20 seconds
    intervalId = setInterval(() => {
      onSendLocationUpdate(false);
    }, 20000);

    // Cleanup function to clear interval when component unmounts
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []); // Empty dependency array means this runs once when component mounts

  // useEffect(() => {
  //   // Start background location sharing when component mounts
  //   console.log("STARTING BACKGROUND LOCATION");
  //   startBackgroundLocation();
  // }, []);

  const onCreateGroup = async () => {
    const result = await handleCreateGroup({
      groupName,
      memberKeyIds,
      getSecret,
      serverUrl,
      setShowGroupDialog,
      setGroupName,
      setMemberKeyIds,
    });
    if (result.success) {
      Alert.alert('Success', 'Group created successfully');
    } else {
      Alert.alert('Error', result.error);
      if (result.details) console.error('Error creating group:', result.details);
    }
  };

  const onSendLocationUpdate = async (showAlerts = true) => {
    const result = await handleSendLocationUpdate({
      serverUrl,
      setLoadingLocation,
      getSecret,
      OpenPGP,
    });
    if (showAlerts) {
      if (result.success) {
        Alert.alert('Success', 'Location update sent to all groups.');
      } else {
        Alert.alert('Error', result.error);
        if (result.details) console.error('Location update error:', result.details);
      }
    }
  };

  const onSaveServerUrl = async () => {
    const result = await handleSaveServerUrl(serverUrlInput, setServerUrl, setShowServerModal);
    if (result.success) {
      Alert.alert('Success', 'Server URL saved!');
    } else {
      Alert.alert('Invalid URL', result.error);
    }
  };

  const onSetServerUrl = () => {
    handleSetServerUrl(serverUrl, setServerUrlInput, setShowServerModal);
  };

  // Local wrappers for handle* functions to use as Button handlers
  const onGenerateKeys = async () => {
    const options: Options = {
      name: 'Test User',
      email: 'j@sus.cx',
      keyOptions: {
        curve: Curve.CURVE25519,
      }
    };
    const keyId = await handleGenerateKeys(options, setPublicKey, getSecret);
    Alert.alert('Public Key', `Public Key ID: ${keyId}`);
  };

  const onSendKey = async () => {
    const result = await handleSendKey(getSecret, sendKeyToServer, serverUrl);
    if (result.success) {
      Alert.alert('Success', 'Public key sent to server successfully');
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const onRequestToken = async () => {
    const result = await handleRequestToken(requestAndVerifyToken, OpenPGP, getSecret, saveSecret, serverUrl);
    if (result.success) {
      Alert.alert('Success', 'Token received and stored successfully');
    } else {
      Alert.alert('Error', result.error);
      if (result.details) console.error('Error in token flow:', result.details);
    }
  };

  // const startBackgroundLocation = async () => {
  //   try {
  //     const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  //     if (foregroundStatus !== 'granted') {
  //       Alert.alert('Permission Denied', 'Location permission is required for background sharing.');
  //       return;
  //     }

  //     const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  //     if (backgroundStatus !== 'granted') {
  //       Alert.alert('Permission Denied', 'Background location permission is required for background sharing.');
  //       return;
  //     }

  //     const tasks = await TaskManager.getRegisteredTasksAsync();
  //     const isRegistered = tasks.some(task => task.taskName === LOCATION_TASK_NAME);
  //     if (!isRegistered) {
  //       await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
  //         accuracy: Location.Accuracy.High,
  //         timeInterval: 20000, // 20 seconds
  //         distanceInterval: 10,
  //         showsBackgroundLocationIndicator: true,
  //         foregroundService: {
  //           notificationTitle: "Location Sharing",
  //           notificationBody: "Sharing your location in the background",
  //           notificationColor: "#A1CEDC",
  //         },
  //       });
  //     }
  //   } catch (e) {
  //     console.error('Error starting background location:', e);
  //     Alert.alert('Error', 'Failed to start background location sharing');
  //   }
  // };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Testing screen</ThemedText>
        <HelloWave />
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Things</ThemedText>
        <Button title="Generate Keys" onPress={onGenerateKeys} />
        {publicKey && (
          <>
            <ThemedText>Public Key ID: {publicKey}</ThemedText>
            <Button title="Send Key to Server" onPress={onSendKey} />
            <Button title="Request Token" onPress={onRequestToken} />
            <Button title="Create Group" onPress={() => setShowGroupDialog(true)} />
            <Button title={loadingLocation ? 'Sending...' : 'Send Location Update'} onPress={() => onSendLocationUpdate(true)} disabled={loadingLocation} />
            <Button title="Set Server URL" onPress={onSetServerUrl} />
          </>
        )}
      </ThemedView>

      {showGroupDialog && (
        <View style={styles.dialogContainer}>
          <ThemedView style={styles.dialog}>
            <ThemedText type="subtitle">Create New Group</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Group Name"
              value={groupName}
              onChangeText={setGroupName}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Member Key IDs (comma-separated)"
              value={memberKeyIds}
              onChangeText={setMemberKeyIds}
              multiline
              numberOfLines={4}
            />
            <View style={styles.dialogButtons}>
              <Button title="Cancel" onPress={() => setShowGroupDialog(false)} />
              <Button title="Create" onPress={onCreateGroup} />
            </View>
          </ThemedView>
        </View>
      )}
      {showServerModal && (
        <View style={styles.dialogContainer}>
          <ThemedView style={styles.dialog}>
            <ThemedText type="subtitle">Set Server URL</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Enter server URL (e.g. http://link)"
              value={serverUrlInput}
              onChangeText={setServerUrlInput}
              autoCapitalize="none"
            />
            <View style={styles.dialogButtons}>
              <Button title="Cancel" onPress={() => setShowServerModal(false)} />
              <Button title="Save" onPress={onSaveServerUrl} />
            </View>
          </ThemedView>
        </View>
      )}
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  dialogContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 8,
    width: '80%',
    maxWidth: 400,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
});
