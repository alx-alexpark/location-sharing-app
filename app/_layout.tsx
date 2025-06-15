import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import OpenPGP from 'react-native-fast-openpgp';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { useColorScheme } from '@/hooks/useColorScheme';
import { handleLocationUpdate } from './lib/helpers';
import { Alert } from 'react-native';

const LOCATION_TASK_NAME = 'background-location-task'
const BACKGROUND_FETCH_TASK = 'background-fetch-task'

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  console.log('Background task received data:', data);
  if (error) {
    console.error('LOCATION_TASK_NAME error:', error)
    return
  }
  if (data) {
    const locations = (data as { locations: Location.LocationObject[] }).locations;
    if (locations && locations.length > 0) {
      console.log('Processing background location:', locations[0].coords)
      try {
        await handleLocationUpdate({
          location: locations[0]
        });
        console.log('Successfully processed background location update');
      } catch (e) {
        console.error('Error processing background location:', e);
      }
    } else {
      console.log('No locations in background data');
    }
  } else {
    console.log('No data received in background task');
  }
})

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  const now = Date.now()
  console.log(`Got background fetch call at date: ${new Date(now).toLocaleString()}`)
  // Be sure to return the successful result of the fetch to guarantee future fetch occurrences
  return BackgroundFetch.BackgroundFetchResult.NewData
})

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [subscription, setSubscription] = useState<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    console.log("STARTING LOCATION TRACKING");
    const startLocationTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.error('Location permission not granted');
        return;
      }

      let subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000, // Update every 1 second (1000 milliseconds)
          distanceInterval: 10, // Update every 10 meters
        },
        async (location) => {
          console.log("LOCATION UPDATED", location);
          await handleLocationUpdate({
            location,
          });
        }
      );
      setSubscription(subscription);
    };

    startLocationTracking();

    const startBackgroundLocationTracking = async () => {
      console.log('Starting background location tracking setup...');
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync()
      console.log('Background permission status:', backgroundStatus);
      
      if (backgroundStatus === 'granted') {
        try {
          // First, check if the task is already registered
          const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
          console.log('Is location task registered?', isRegistered);
          
          if (isRegistered) {
            // If registered, stop it first to ensure clean state
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            console.log('Stopped existing location updates');
          }

          // Configure foreground service based on platform
          const foregroundService = Platform.select({
            android: {
              notificationTitle: 'Location Tracking Active',
              notificationBody: 'Tracking your location in the background',
              notificationColor: '#4CAF50',
              killServiceOnDestroy: false,
            },
            ios: undefined,
          });

          // Start new location updates with foreground service
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 60000, // Update every 60 seconds (1 minute)
            distanceInterval: 20, // Update every 20 meters
            showsBackgroundLocationIndicator: true, // iOS only
            foregroundService, // Only used on Android
            deferredUpdatesInterval: 60000, // Minimum time interval between updates
            deferredUpdatesDistance: 20, // Minimum distance between updates
            activityType: Location.ActivityType.Other, // iOS only, helps keep the app active
          });
          console.log('Started background location updates');

          // Register background fetch
          await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
            minimumInterval: 60 * 15, // 15 minutes
            stopOnTerminate: false,
            startOnBoot: true,
          });
          console.log('Registered background fetch task');

          // Verify task is running
          const isTaskRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
          if (isTaskRunning) {
            console.log('Background location tracking is running!');
            Alert.alert('Success', 'Background location tracking is running!');
          } else {
            console.error('Failed to start background location tracking');
            Alert.alert('Error', 'Failed to start background location tracking');
          }
        } catch (error) {
          console.error('Error setting up background location:', error);
          Alert.alert('Error', 'Failed to set up background location tracking');
        }
      } else {
        console.error('Background location permission denied');
        Alert.alert('Permission Denied', 'Background location permission is required for tracking');
      }
    }

    startBackgroundLocationTracking()

    return () => {
      console.log("STOPPING LOCATION TRACKING");
      if (subscription) {
        subscription.remove();
      }
      // Stop background location updates when component unmounts
      Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(console.error);
    };
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
