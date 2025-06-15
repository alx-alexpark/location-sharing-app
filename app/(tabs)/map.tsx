import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { LeafletView } from 'react-native-leaflet-view';
import * as SecureStore from 'expo-secure-store';
import OpenPGP from 'react-native-fast-openpgp';
import { Camera, MapView, PointAnnotation } from '@maplibre/maplibre-react-native';

const generateRandomId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const defaultCamera = {
  centerCoordinate: [-73.98004319979121, 40.75272669831773],
  zoomLevel: 17,
};

export default function App() {
  const [markers, setMarkers] = useState<any[]>([]);
  const cameraRef = useRef<any>(null);
  const [centerSet, setCenterSet] = useState(false);

  const calculateBounds = (markerList: any[]) => {
    if (markerList.length === 0) return null;

    let minLat = markerList[0].lat;
    let maxLat = markerList[0].lat;
    let minLng = markerList[0].lng;
    let maxLng = markerList[0].lng;

    markerList.forEach(marker => {
      minLat = Math.min(minLat, marker.lat);
      maxLat = Math.max(maxLat, marker.lat);
      minLng = Math.min(minLng, marker.lng);
      maxLng = Math.max(maxLng, marker.lng);
    });

    // Add some padding
    const latPadding = (maxLat - minLat) * 0.1;
    const lngPadding = (maxLng - minLng) * 0.1;

    return {
      southWest: { lat: minLat - latPadding, lng: minLng - lngPadding },
      northEast: { lat: maxLat + latPadding, lng: maxLng + lngPadding }
    };
  };

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
          cameraRef.current.fitBounds(
            [bounds.northEast.lng, bounds.northEast.lat],
            [bounds.southWest.lng, bounds.southWest.lat],
            { padding: 50 },
            100
          );
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

  useEffect(() => {
    if (markers.length > 0 && !centerSet && cameraRef.current) {
      const bounds = calculateBounds(markers);
      if (bounds) {
        cameraRef.current.fitBounds(
          [bounds.northEast.lng, bounds.northEast.lat],
          [bounds.southWest.lng, bounds.southWest.lat],
          { padding: 50 },
          100
        );
        setCenterSet(true);
      }
    }
  }, [markers, centerSet]);

  return (
    <View style={styles.container}>
      <MapView
        style={{ flex: 1 }}
        mapStyle={mapStyle}
      >
        <Camera 
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [-73.98004319979121, 40.75272669831773],
            zoomLevel: 13
          }} 
        />
        {markers.map((marker) => (
          <PointAnnotation
            key={generateRandomId()}
            id={generateRandomId()}
            coordinate={[marker.lng, marker.lat]}
            title={marker.user}
            snippet={`Last updated: ${new Date(marker.timestamp).toLocaleString()}`}
            anchor={{ x: 0.5, y: 0.5 }}
            onSelected={(feature) => {
              console.log('Selected marker:', feature);
            }}
          >
            <View style={styles.marker}>
              <View style={styles.markerDot} />
            </View>
          </PointAnnotation>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
  },
});

const mapStyle = {
  "version": 8,
	"sources": {
    "osm": {
			"type": "raster",
			"tiles": ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
			"tileSize": 256,
      "attribution": "&copy; OpenStreetMap Contributors",
      "maxzoom": 19
    }
  },
  "layers": [
    {
      "id": "osm",
      "type": "raster",
      "source": "osm" // This must match the source key above
    }
  ]
};