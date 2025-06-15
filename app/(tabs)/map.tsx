import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Alert, TouchableOpacity, Text } from 'react-native';
import { LeafletView } from 'react-native-leaflet-view';
import * as SecureStore from 'expo-secure-store';
import OpenPGP from 'react-native-fast-openpgp';
import { Camera, MapView, PointAnnotation } from '@maplibre/maplibre-react-native';

const generateRandomId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export default function App() {
  const [markers, setMarkers] = useState<any[]>([]);
  const cameraRef = useRef<any>(null);
  const hasInitialized = useRef(false);

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

  const resetView = () => {
    if (markers.length > 0 && cameraRef.current) {
      const bounds = calculateBounds(markers);
      if (bounds) {
        cameraRef.current.fitBounds(
          [bounds.northEast.lng, bounds.northEast.lat],
          [bounds.southWest.lng, bounds.southWest.lat],
          { padding: 50 },
          100
        );
      }
    }
  };

  const zoomToMarker = (marker: any) => {
    if (cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [marker.lng, marker.lat],
        zoomLevel: 15,
        animationDuration: 300
      });
    }
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

        // Only do initial bounds fitting once when we first get markers
        if (!hasInitialized.current && markerList.length > 0 && cameraRef.current) {
          const bounds = calculateBounds(markerList);
          if (bounds) {
            cameraRef.current.fitBounds(
              [bounds.northEast.lng, bounds.northEast.lat],
              [bounds.southWest.lng, bounds.southWest.lat],
              { padding: 50 },
              100
            );
            hasInitialized.current = true;
          }
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
      <MapView
        style={{ flex: 1 }}
        mapStyle={mapStyle}
      >
        <Camera 
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [0, 0],
            zoomLevel: 1
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
              zoomToMarker(marker);
            }}
          >
            <View style={styles.marker}>
              <View style={styles.markerDot} />
            </View>
          </PointAnnotation>
        ))}
      </MapView>
      <TouchableOpacity 
        style={styles.resetButton}
        onPress={resetView}
      >
        <Text style={styles.resetButtonText}>Reset View</Text>
      </TouchableOpacity>
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
  resetButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  resetButtonText: {
    color: '#007AFF',
    fontWeight: '600',
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