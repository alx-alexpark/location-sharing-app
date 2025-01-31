import { Image, StyleSheet, Platform, Button, View, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
import OpenPGP, { Curve, KeyPair, Options, PublicKeyMetadata} from "react-native-fast-openpgp";

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

export default function HomeScreen() {
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const handleGenerateKeys = async () => {
    const generatedPublicKey = await generateAndSaveKeys();
    setPublicKey(generatedPublicKey);
    Alert.alert('Public Key', `Public Key ID: ${generatedPublicKey}`);
    const pubkey = await getSecret("publicKey");
    const metadata = await OpenPGP.getPublicKeyMetadata(pubkey!);
    setPublicKey(metadata.keyID);

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
          <ThemedText>Public Key ID: {publicKey}</ThemedText>
        )}
      </ThemedView>
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
});
