import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Alert, TouchableOpacity, Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import OpenPGP from 'react-native-fast-openpgp';
import { Camera, MapView, PointAnnotation } from '@maplibre/maplibre-react-native';
import { checkBackgroundLocationStatus } from '../lib/locations';

const zoomLevels: number[][] = [];
for (let i=0; i < 21; i++) {
  zoomLevels.unshift([i, 360 / Math.pow(2, i)]);
}

export default function App() {
  const [markers, setMarkers] = useState<any[]>([]);
  const cameraRef = useRef<any>(null);

  const [centerX, setCenterX] = useState(0);
  const [centerY, setCenterY] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);

  const calculateCamera = (markerList: any[]) => {
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

    const width = maxLng - minLng;
    const height = maxLat - minLat;

    const centerX = minLng + (width / 2);
    const centerY = minLat + (height / 2);

    const longDim = Math.max(width, height);
    let zoom = 0;
    for (const [level, levelWidth] of zoomLevels) {
      console.log(levelWidth)
      zoom = level;
      if (levelWidth > longDim) {
        break;
      }
    }

    return {
      centerCoordinate: [centerX, centerY],
      zoomLevel: zoom
    }
  };

  const resetView = () => {
    if (markers.length > 0 && cameraRef.current) {
      const camera = calculateCamera(markers);
      if (camera) {
        setCenterX(camera.centerCoordinate[0]);
        setCenterY(camera.centerCoordinate[1]);
        setZoomLevel(camera.zoomLevel);
      }
    }
  };

  const zoomToMarker = (marker: any) => {
    if (cameraRef.current) {
      setCenterX(marker.lng);
      setCenterY(marker.lat);
      setZoomLevel(15);
    }
  };

  const checkLocationStatus = async () => {
    const status = await checkBackgroundLocationStatus();
    if (status) {
      Alert.alert(
        'Background Location Status',
        `Foreground: ${status.foregroundStatus}\nBackground: ${status.backgroundStatus}\nTask registered: ${status.taskRegistered}`,
        [{ text: 'OK' }]
      );
    }
  };

  const fetchLocations = useCallback(async (initial: boolean) => {
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
          console.log("Decrypted location data:", data);
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
          console.error('Failed to decrypt location update', update.id, e);
        }
      }
      
      setMarkers(prevMarkers => {
        if (JSON.stringify(prevMarkers) !== JSON.stringify(markerList)) {
          return markerList;
        }
        return prevMarkers;
      });

      if (markerList.length > 0 && cameraRef.current && initial) {
        const camera = calculateCamera(markerList);
        console.log(camera)
        if (camera) {
          setCenterX(camera.centerCoordinate[0]);
          setCenterY(camera.centerCoordinate[1]);
          setZoomLevel(camera.zoomLevel);
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load locat ion updates');
    }
  }, []);

  useEffect(() => {
    console.log('Setting up location fetching effect');

    fetchLocations(true);

    const intervalId = setInterval(() => fetchLocations(false), 5000);

    return () => {
      console.log('Cleaning up location fetching effect');
      clearInterval(intervalId);
    };
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        style={{ flex: 1 }}
        mapStyle={mapStyle}
      >
        <Camera 
          ref={cameraRef}
          centerCoordinate={[centerX, centerY]}
          zoomLevel={zoomLevel}
          animationMode="flyTo"
          animationDuration={300}
          followUserLocation={false}
        />
        {markers.map((marker) => {
          // Get the first initial (uppercase) from the user string
          const initial = marker.user.fullName && typeof marker.user.fullName === 'string' ? marker.user.fullName.charAt(0).toUpperCase() : '?';
          return (
            <PointAnnotation
              key={marker.id.toString()}
              id={marker.id.toString()}
              coordinate={[marker.lng, marker.lat]}
              title={marker.user}
              snippet={`Last updated: ${new Date(marker.timestamp).toLocaleString()}`}
              anchor={{ x: 0.5, y: 0.5 }}
              onSelected={(feature) => {
                console.log('Selected marker:', feature);
                zoomToMarker(marker);
              }}
            >
              <View style={styles.markerInitialContainer}>
                <Text style={styles.markerInitialText}>{initial}</Text>
              </View>
            </PointAnnotation>
          );
        })}
      </MapView>
      <TouchableOpacity 
        style={styles.resetButton}
        onPress={resetView}
      >
        <Text style={styles.resetButtonText}>Reset View</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.resetButton, { bottom: 80 }]}
        onPress={checkLocationStatus}
      >
        <Text style={styles.resetButtonText}>Check Status</Text>
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
  markerInitialContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  markerInitialText: {
    color: '#007AFF',
    fontWeight: 'bold',
    fontSize: 16,
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