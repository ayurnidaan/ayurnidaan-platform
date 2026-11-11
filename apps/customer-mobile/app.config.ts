import type { ExpoConfig, ConfigContext } from 'expo/config';

const isDevelopment =
  process.env.APP_VARIANT === 'development' ||
  process.env.EXPO_PUBLIC_APP_ENV === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Ayurnidaan',
  slug: 'ayurnidaan',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/ayurnidaan-app-icon-safe.png',
  userInterfaceStyle: 'light',
  scheme: isDevelopment ? 'ayurnidaan-dev' : 'ayurnidaan',
  extra: {
    eas: {
      projectId: '5fd63f99-6df9-4147-bb0d-5cb8d7cde91f',
    },
  },
  experiments: {
    ...config.experiments,
    onDemandFilesystem: false,
  },
  plugins: [
    'expo-web-browser',
    'expo-asset',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Ayurnidaan to choose a meal photo for nutrition tracking.',
        cameraPermission: 'Allow Ayurnidaan to photograph a meal for nutrition tracking.',
        microphonePermission: false,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Allow Ayurnidaan to show a live meal preview and take a meal photo.',
        recordAudioAndroid: false,
        barcodeScannerEnabled: false,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Allow Ayurnidaan to use your current location to fill your delivery address.',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F8F4E8',
        image: './assets/ayurnidaan-logo.png',
        imageWidth: 220,
        resizeMode: 'contain',
      },
    ],
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: isDevelopment
      ? 'com.ayurnidaan.wellness.dev'
      : 'com.ayurnidaan.wellness',
    infoPlist: {
      LSApplicationQueriesSchemes: ['tez', 'phonepe', 'paytmmp'],
    },
  },
  android: {
    package: isDevelopment
      ? 'com.ayurnidaan.wellness.dev'
      : 'com.ayurnidaan.wellness',
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: {
      backgroundColor: '#164D39',
      foregroundImage: './assets/ayurnidaan-app-icon-safe.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
});
