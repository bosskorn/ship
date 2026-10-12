import type { ExpoConfig } from 'expo/config';

// Build-time values come from the environment (never commit keys).
const config: ExpoConfig = {
  "name": "Ship Driver",
  "slug": "ship-driver",
  "scheme": "shipdriver",
  "version": "0.1.0",
  "orientation": "portrait",
  "userInterfaceStyle": "light",
  "ios": {
    "bundleIdentifier": "th.co.ship.driver",
    "supportsTablet": false,
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "ใช้ตำแหน่งเพื่อรับงานใกล้คุณและให้ลูกค้าติดตามการส่ง",
      "NSLocationAlwaysAndWhenInUseUsageDescription": "ส่งตำแหน่งขณะออนไลน์แม้แอปอยู่เบื้องหลัง เพื่อรับงานและให้ลูกค้าติดตามการส่ง (หยุดส่งเมื่อออฟไลน์)",
      "NSCameraUsageDescription": "ถ่ายรูปเอกสาร สินค้า และหลักฐานการส่ง",
      "UIBackgroundModes": [
        "location",
        "fetch",
        "remote-notification"
      ]
    }
  },
  "android": {
    "blockedPermissions": ["android.permission.RECORD_AUDIO", "android.permission.SYSTEM_ALERT_WINDOW"],
    "package": "th.co.ship.driver",
    "permissions": [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "CAMERA",
      "POST_NOTIFICATIONS"
    ],
    "config": {
      "googleMaps": {
        "apiKey": process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? ""
      }
    }
  },
  "plugins": [
    [
      "expo-build-properties",
      { "android": { "enableMinifyInReleaseBuilds": true, "enableShrinkResourcesInReleaseBuilds": true } }
    ],
    "expo-router",
    "expo-secure-store",
    [
      "expo-location",
      {
        "locationAlwaysAndWhenInUsePermission": "ส่งตำแหน่งขณะออนไลน์แม้แอปอยู่เบื้องหลัง เพื่อรับงานและให้ลูกค้าติดตามการส่ง",
        "isAndroidBackgroundLocationEnabled": true,
        "isAndroidForegroundServiceEnabled": true
      }
    ],
    [
      "expo-camera",
      {
        "cameraPermission": "สแกน QR และถ่ายรูปหลักฐานการรับ-ส่งสินค้า",
        "recordAudioAndroid": false
      }
    ],
    [
      "expo-image-picker",
      {
        "cameraPermission": "ถ่ายรูปเอกสารและหลักฐานการส่ง"
      }
    ],
    "expo-notifications"
  ],
  "extra": {
    "apiUrl": process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'
  }
};

export default config;
