import { Image, StyleSheet, Platform, Button, View, Alert, TextInput } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useState, useEffect } from 'react';
import OpenPGP, { Curve, KeyPair, Options, PublicKeyMetadata} from "react-native-fast-openpgp";
import React from 'react';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

async function saveSecret(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}

async function getSecret(key: string) {
  return await SecureStore.getItemAsync(key);
}

async function generateAndSaveKeys() {
  const options: Options = {
    name: 'Test User',
    email: 'j@sus.cx',
    keyOptions: {
      curve: Curve.CURVE25519,
    }
  };

  const generated: KeyPair = await OpenPGP.generate(options);

  await saveSecret('publicKey', generated.publicKey);
  await saveSecret('privateKey', generated.privateKey);
  return generated.publicKey;
}

async function sendKeyToServer(pubkey: string) {
  try {
    const response = await fetch('http://192.168.18.8:3000/api/signUp', {
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
    Alert.alert('Success', 'Public key sent to server successfully');
    return data;
  } catch (error) {
    Alert.alert('Error', 'Failed to send public key to server');
    console.error('Error sending key:', error);
  }
}

async function requestAndVerifyToken() {
  try {
    // Get the stored keys
    const pubkey = await getSecret("publicKey");
    const privkey = await getSecret("privateKey");
    
    if (!pubkey || !privkey) {
      Alert.alert('Error', 'No keys found. Please generate keys first.');
      return;
    }

    // Get the key ID from metadata
    const metadata = await OpenPGP.getPublicKeyMetadata(pubkey);
    const keyId = metadata.keyID;

    // Request token
    const tokenResponse = await fetch('http://192.168.18.8:3000/api/requestToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keyid: keyId }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token request failed: ${tokenResponse.status}`);
    }

    const { challenge } = await tokenResponse.json();

    // Create a detached signature in the correct format
    const signedMessage = `-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\n${challenge}\n${await OpenPGP.sign(challenge, privkey, '')}`;

    // Submit attestation
    const attestationResponse = await fetch('http://192.168.18.8:3000/api/submitAttestation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ signedChallenge: signedMessage }),
    });

    if (!attestationResponse.ok) {
      throw new Error(`Attestation failed: ${attestationResponse.status}`);
    }

    const { tokenCipherText } = await attestationResponse.json();

    // Decrypt the token
    const decryptedToken = await OpenPGP.decrypt(tokenCipherText, privkey, ''); // Empty passphrase

    // Parse the JSON and save just the token value
    const tokenData = JSON.parse(decryptedToken);
    await saveSecret('token', tokenData.token);
    console.log('Token:', tokenData.token);
    
    Alert.alert('Success', 'Token received and stored successfully');
  } catch (error) {
    Alert.alert('Error', 'Failed to complete token request flow');
    console.error('Error in token flow:', error);
  }
}

export default function HomeScreen() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [memberKeyIds, setMemberKeyIds] = useState('');
  const [showGroupDialog, setShowGroupDialog] = useState(false);

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

  const handleGenerateKeys = async () => {
    const generatedPublicKey = await generateAndSaveKeys();
    setPublicKey(generatedPublicKey);
    Alert.alert('Public Key', `Public Key ID: ${generatedPublicKey}`);
    const pubkey = await getSecret("publicKey");
    const metadata = await OpenPGP.getPublicKeyMetadata(pubkey!);
    setPublicKey(metadata.keyID);

  };

  const handleSendKey = async () => {
    const pubkey = await getSecret("publicKey");
    if (pubkey) {
      await sendKeyToServer(pubkey);
    } else {
      Alert.alert('Error', 'No public key found. Please generate keys first.');
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
            <Button title="Request Token" onPress={requestAndVerifyToken} />
            <Button title="Create Group" onPress={() => setShowGroupDialog(true)} />
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
