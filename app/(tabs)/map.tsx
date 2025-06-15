import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { LeafletView } from 'react-native-leaflet-view';
import * as SecureStore from 'expo-secure-store';
import OpenPGP from 'react-native-fast-openpgp';

export default function App() {
  const [markers, setMarkers] = useState<any[]>([]);
  const [mapCenter, setMapCenter] = useState({ lat: 37.7749, lng: -122.4194 }); // Default: San Francisco
  const [centerSet, setCenterSet] = useState(false);

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

        // Calculate bounds and update map view
        const bounds = calculateBounds(markerList);
        if (bounds) {
          setMapCenter(bounds.center);
          // Calculate zoom level based on the distance between points
          const latDiff = Math.abs(bounds.bounds.northEast.lat - bounds.bounds.southWest.lat);
          const lngDiff = Math.abs(bounds.bounds.northEast.lng - bounds.bounds.southWest.lng);
          const maxDiff = Math.max(latDiff, lngDiff);
          // Adjust zoom level based on the spread of markers
          const newZoom = Math.floor(10 - Math.log2(maxDiff*2));
          setZoom(Math.max(1, Math.min(18, newZoom))); // Clamp zoom between 1 and 18
          console.log("zoom AAAAAAAAAAAA ZOOOM", zoom);
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
          iconAnchor: [6, 20],
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