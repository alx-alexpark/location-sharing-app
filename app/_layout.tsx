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
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { useColorScheme } from '@/hooks/useColorScheme';
import { sendLocationUpdate } from './lib/locations';
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
        const result = await sendLocationUpdate({
          location: locations[0]
        });
        if (result.success) {
          console.log('Successfully processed background location update');
        } else {
          console.error('Failed to process background location:', result.error);
        }
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
          await sendLocationUpdate({
            location,
          });
        }
      );
      setSubscription(subscription);
    };

    startLocationTracking();

    const startBackgroundLocationTracking = async () => {
      console.log('Starting background location tracking setup...');
      
      // Request notification permission first
      const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
      if (notificationStatus !== 'granted') {
        console.error('Notification permission denied');
        Alert.alert('Permission Denied', 'Notification permission is required for background location tracking');
        return;
      }
      console.log('Notifications granted');

      // Request background location permission
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
              notificationBody: 'Sharing your location with your groups',
              notificationColor: '#4CAF50',
              killServiceOnDestroy: false,
              notificationPriority: 'high',
              notificationChannelId: 'location-tracking',
              notificationChannelName: 'Location Tracking',
              notificationChannelDescription: 'Shows when location tracking is active',
              notificationChannelImportance: 'high',
              notificationChannelShowBadge: true,
              notificationChannelEnableVibration: false,
              notificationChannelEnableLights: false,
              startOnBoot: true,
              stopOnTerminate: false
            },
            ios: undefined,
          });

          // Start new location updates with more aggressive settings for better background performance
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000, // Update every 30 seconds (reduced from 60s)
            distanceInterval: 10, // Update every 10 meters (reduced from 20m)
            showsBackgroundLocationIndicator: true, // iOS only
            foregroundService, // Only used on Android
            deferredUpdatesInterval: 30000, // Minimum time interval between updates
            deferredUpdatesDistance: 10, // Minimum distance between updates
            activityType: Location.ActivityType.Other, // iOS only
            pausesUpdatesAutomatically: false, // Don't pause location updates
            mayShowUserSettingsDialog: true // Allow showing settings dialog if needed
          });
          console.log('Started background location updates with enhanced settings');

          // Register background fetch with shorter interval
          try {
            await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
              minimumInterval: 60 * 5, // 5 minutes (reduced from 15)
              stopOnTerminate: false,
              startOnBoot: true,
            });
            console.log('Registered background fetch task');
          } catch (fetchError) {
            console.error('Failed to register background fetch:', fetchError);
          }

          // Verify task is running
          const isTaskRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
          if (isTaskRunning) {
            console.log('Background location tracking is running!');
            Alert.alert('Success', 'Background location tracking is now active!');
          } else {
            console.error('Failed to start background location tracking');
            Alert.alert('Error', 'Failed to start background location tracking');
          }
        } catch (error) {
          console.error('Error setting up background location:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          Alert.alert('Error', `Failed to set up background location tracking: ${errorMessage}`);
        }
      } else {
        console.error('Background location permission denied');
        Alert.alert(
          'Permission Required', 
          'Background location permission is required for location sharing. Please enable "Allow all the time" in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Location.enableNetworkProviderAsync() }
          ]
        );
      }
    }

    startBackgroundLocationTracking()

    return () => {
      console.log("STOPPING LOCATION TRACKING");
      if (subscription) {
        subscription.remove();
      }
      // Stop background location updates when component unmounts
      // Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(console.error);
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
