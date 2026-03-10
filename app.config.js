/**
 * Expo config. Use app.config.js so we can set web baseUrl from env.
 * - EXPO_PUBLIC_WEB_BASE_URL="" or "/" → assets at root (for www.toptipster.ie)
 * - EXPO_PUBLIC_WEB_BASE_URL="/TopTipsterRacing" or unset → project path (for github.io/TopTipsterRacing)
 */
const baseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? '/TopTipsterRacing';
const webBaseUrl = baseUrl === '/' ? '' : baseUrl;

module.exports = {
  expo: {
    name: 'Top Tipster Racing',
    slug: 'cheltenham-top-tipster',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/appstore.png',
    scheme: 'cheltenhamtipster',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0a0a0a',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.cheltenhamtoptipster.app',
      buildNumber: '1',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/playstore.png',
        backgroundColor: '#0a0a0a',
      },
      package: 'com.cheltenhamtoptipster.app',
      versionCode: 1,
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/logo/TopTipster_Logo-Light.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/LARAZ Regular.ttf',
            './assets/fonts/LARAZ Light.ttf',
          ],
        },
      ],
      '@react-native-community/datetimepicker',
    ],
    experiments: {
      typedRoutes: true,
      baseUrl: webBaseUrl,
    },
    extra: {
      router: {},
      eas: {
        projectId: '46f6a025-ceba-46ea-bd70-26cf8328c4d1',
      },
    },
  },
};
