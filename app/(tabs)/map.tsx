import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LeafletView } from 'react-native-leaflet-view';

export default function App() {
  return (
    <View style={styles.container}>
      <LeafletView
        mapCenterPosition={{ lat: 37.7749, lng: -122.4194 }} // Example: San Francisco
        zoom={13}
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