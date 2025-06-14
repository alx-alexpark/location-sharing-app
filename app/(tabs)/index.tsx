import { Image, StyleSheet, Platform, Button, View, Alert, TextInput, Modal } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useState, useEffect } from 'react';
import OpenPGP, { Curve, KeyPair, Options, PublicKeyMetadata} from "react-native-fast-openpgp";
import React from 'react';
import * as Location from 'expo-location';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { saveSecret, getSecret, generateAndSaveKeys, sendKeyToServer, requestAndVerifyToken, getCurrentLocation } from '../lib/helpers';

export default function HomeScreen() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [memberKeyIds, setMemberKeyIds] = useState('');
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [serverUrl, setServerUrl] = useState<string>('');
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

  useEffect(() => {
    const loadServerUrl = async () => {
      const url = await SecureStore.getItemAsync('serverUrl');
      if (url) setServerUrl(url);
    };
    loadServerUrl();
  }, []);

  const handleGenerateKeys = async () => {
    const options: Options = {
      name: 'Test User',
      email: 'j@sus.cx',
      keyOptions: {
        curve: Curve.CURVE25519,
      }
    };
    const generatedPublicKey = await generateAndSaveKeys(options);
    setPublicKey(generatedPublicKey);
    Alert.alert('Public Key', `Public Key ID: ${generatedPublicKey}`);
    const pubkey = await getSecret("publicKey");
    const metadata = await OpenPGP.getPublicKeyMetadata(pubkey!);
    setPublicKey(metadata.keyID);
  };

  const handleSendKey = async () => {
    const pubkey = await getSecret("publicKey");
    if (pubkey) {
      await sendKeyToServer(pubkey, serverUrl);
      Alert.alert('Success', 'Public key sent to server successfully');
    } else {
      Alert.alert('Error', 'No public key found. Please generate keys first.');
    }
  };

  const handleRequestToken = async () => {
    try {
      await requestAndVerifyToken(OpenPGP, getSecret, saveSecret, serverUrl);
      Alert.alert('Success', 'Token received and stored successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to complete token request flow');
      console.error('Error in token flow:', error);
    }
  };

  const handleCreateGroup = async () => {
    try {
      const token = await getSecret('token');
      if (!token) {
        Alert.alert('Error', 'No token found. Please request a token first.');
        return;
      }

      const response = await fetch('http://192.168.18.8:3000/api/groups', {
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
        console.error('Server error:', errorData.error);
        throw new Error(`Failed to create group: ${errorData.error}`);
      }

      const result = await response.json();
      Alert.alert('Success', 'Group created successfully');
      setShowGroupDialog(false);
      setGroupName('');
      setMemberKeyIds('');
    } catch (error) {
      Alert.alert('Error', 'Failed to create group');
      console.error('Error creating group:', error);
    }
  };

  const handleSendLocationUpdate = async () => {
    setLoadingLocation(true);
    try {
      if (!serverUrl) throw new Error('Server URL not set. Please set it first.');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        setLoadingLocation(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      const token = await getSecret('token');
      const privkey = await getSecret('privateKey');
      if (!token || !privkey) {
        Alert.alert('Error', 'Missing token or private key.');
        setLoadingLocation(false);
        return;
      }
      const groupsRes = await fetch(`${serverUrl}/api/groups`, {
        headers: { 'authorization': `Bearer ${token}` }
      });
      if (!groupsRes.ok) throw new Error('Failed to fetch groups');
      const groups = await groupsRes.json();
      for (const group of groups) {
        const otherMembers = group.members.filter((m: any) => m.keyid !== group.myKeyId);
        if (otherMembers.length === 0) continue;
        // Fetch public keys for other members individually
        const pubkeyArr = [];
        for (const member of otherMembers) {
          const res = await fetch(`${serverUrl}/api/keys?keyId=${encodeURIComponent(member.keyid)}`, {
            headers: { 'authorization': `Bearer ${token}` }
          });
          if (!res.ok) throw new Error('Failed to fetch public key for ' + member.keyid);
          const data = await res.json();
          if (data.publicKey) pubkeyArr.push(data.publicKey);
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
        console.log(ciphertext);
        const postRes = await fetch(`${serverUrl}/api/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${token}` },
          body: JSON.stringify({ groupIds: [group.id], cipherText: ciphertext })
        });
        if (!postRes.ok) throw new Error('Failed to post location');
      }
      Alert.alert('Success', 'Location update sent to all groups.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send location update');
      console.error('Location update error:', e);
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleSetServerUrl = () => {
    setServerUrlInput(serverUrl);
    setShowServerModal(true);
  };

  const handleSaveServerUrl = async () => {
    if (!serverUrlInput.startsWith('http://') && !serverUrlInput.startsWith('https://')) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }
    await SecureStore.setItemAsync('serverUrl', serverUrlInput);
    setServerUrl(serverUrlInput);
    setShowServerModal(false);
    Alert.alert('Success', 'Server URL saved!');
  };

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
        <Button title="Generate Keys" onPress={handleGenerateKeys} />
        {publicKey && (
          <>
            <ThemedText>Public Key ID: {publicKey}</ThemedText>
            <Button title="Send Key to Server" onPress={handleSendKey} />
            <Button title="Request Token" onPress={handleRequestToken} />
            <Button title="Create Group" onPress={() => setShowGroupDialog(true)} />
            <Button title={loadingLocation ? 'Sending...' : 'Send Location Update'} onPress={handleSendLocationUpdate} disabled={loadingLocation} />
            <Button title="Set Server URL" onPress={handleSetServerUrl} />
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
              <Button title="Create" onPress={handleCreateGroup} />
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
              <Button title="Save" onPress={handleSaveServerUrl} />
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
});
