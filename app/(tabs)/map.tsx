import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { LeafletView } from 'react-native-leaflet-view';
import * as SecureStore from 'expo-secure-store';
import OpenPGP from 'react-native-fast-openpgp';

export default function App() {
  const [markers, setMarkers] = useState<any[]>([]);
  const [mapCenter, setMapCenter] = useState({ lat: 37.7749, lng: -122.4194 }); // Default: San Francisco

  useEffect(() => {
    console.log('fetching locations');
    const fetchLocations = async () => {
      try {
        const serverUrl = await SecureStore.getItemAsync('serverUrl');
        const token = await SecureStore.getItemAsync('token');
        const privkey = await SecureStore.getItemAsync('privateKey');
        if (!serverUrl || !token || !privkey) {
          Alert.alert('Error', 'Missing server URL, token, or private key.');
          return;
        }
        const res = await fetch(`${serverUrl}/api/location?limit=1`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch location updates');
        const updates = await res.json();
        const markerList: any[] = [];
        for (const update of updates) {
          try {
            const decrypted = await OpenPGP.decrypt(update.cipherText, privkey, '');
            const data = JSON.parse(decrypted);
            console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", data);
            if (data.coords && data.coords.latitude && data.coords.longitude) {
              markerList.push({
                id: update.id,
                lat: data.coords.latitude,
                lng: data.coords.longitude,
                user: update.user,
                timestamp: update.timestamp,
                group: update.Group,
              });
            }
          } catch (e: any) {
            // Ignore decryption errors for individual updates
            console.error('Failed to decrypt location update', update.id, e);
          }
        }
        setMarkers(markerList);
        // Optionally center map on first marker
        if (markerList.length > 0) {
          setMapCenter({ lat: markerList[0].lat, lng: markerList[0].lng });
        }
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to load location updates');
      }
    };

    // Initial fetch
    fetchLocations();

    // Set up polling every 5 seconds
    const intervalId = setInterval(fetchLocations, 2500);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  return (
    <View style={styles.container}>
      <LeafletView
        mapCenterPosition={mapCenter}
        zoom={13}
        mapMarkers={markers.map(m => ({
          position: { lat: m.lat, lng: m.lng },
          icon: "🚨",
          size: [32, 32],
          id: String(m.id),
          title: `${m.user.fullName || m.user.keyid} @ ${new Date(m.timestamp).toLocaleString('en-US', { 
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false 
          })}`,
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
}); 