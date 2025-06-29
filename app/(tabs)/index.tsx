import { StyleSheet, Button, View, Alert, TextInput } from 'react-native';
import { useState, useEffect } from 'react';
import OpenPGP, { Curve, Options } from "react-native-fast-openpgp";
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

import { getSecret } from '../lib/secrets';
import { createGroup } from '../lib/groups';
import { getCurrentLocation, sendLocationUpdate } from '../lib/locations';
import { saveServerUrl } from '../lib/server';
import { sendKeyToServer, generateAndSaveKeys } from '../lib/keys';
import { requestAndVerifyToken } from '../lib/tokens';

export default function HomeScreen() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [memberKeyIds, setMemberKeyIds] = useState('');
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState<string>('');
  const [showServerModal, setShowServerModal] = useState(false);

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

  const onCreateGroup = async () => {
    const result = await createGroup({
      groupName,
      memberKeyIds
    });
    if (result.success) {
      setShowGroupDialog(false);
      setGroupName('');
      setMemberKeyIds('');
      Alert.alert('Success', 'Group created successfully');
    } else {
      Alert.alert('Error', result.error);
      if (result.details) console.error('Error creating group:', result.details);
    }
  };

  const onSendLocationUpdate = async (showAlerts = true) => {
    const location = await getCurrentLocation();

    if (location) {
      const result = await sendLocationUpdate({ location });
      if (showAlerts) {
        if (result.success) {
          Alert.alert('Success', 'Location update sent to all groups.');
        } else {
          if (result.details) console.error('Location update error:', result.details);
          Alert.alert('Error', result.error);
        }
      }
    }
  };

  const onSaveServerUrl = async () => {
    const result = await saveServerUrl(serverUrlInput);
    if (result.success) {
      setShowServerModal(false);
      Alert.alert('Success', 'Server URL saved!');
    } else {
      Alert.alert('Invalid URL', result.error);
    }
  };

  const onGenerateKeys = async () => {
    const options: Options = {
      name: 'Test User',
      email: 'j@sus.cx',
      keyOptions: {
        curve: Curve.CURVE25519,
      }
    };

    const key = await generateAndSaveKeys(options);
    const metadata = await OpenPGP.getPublicKeyMetadata(key);
    setPublicKey(metadata.keyID);
  };

  const onSendKey = async () => {
    const result = await sendKeyToServer();
    if (result.success) {
      Alert.alert('Success', 'Public key sent to server successfully');
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const onRequestToken = async () => {
    const result = await requestAndVerifyToken();
    if (result) {
      Alert.alert('Success', 'Token received and stored successfully');
    } else {
      Alert.alert('Error', result.error);
      if (result.details) console.error('Error in token flow:', result.details);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Debug</ThemedText>
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
            <Button title="Send Location Update" onPress={() => onSendLocationUpdate(true)} />
            <Button title="Set Server URL" onPress={() => setShowServerModal(true)} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 50,
    backgroundColor: 'white'
  },
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
