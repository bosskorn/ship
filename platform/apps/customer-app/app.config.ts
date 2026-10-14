import type { ExpoConfig } from 'expo/config';

// Build-time values come from the environment (never commit keys).
const config: ExpoConfig = {
  "name": "Ship ส่งของ",
  "slug": "ship-customer",
  "scheme": "shipcustomer",
  "version": "0.1.0",
  "orientation": "portrait",
  "userInterfaceStyle": "light",
  "ios": {
    "bundleIdentifier": "th.co.ship.customer",
    "supportsTablet": false,
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "ใช้ตำแหน่งของคุณเพื่อปักหมุดจุดรับสินค้าและคำนวณราคา",
      "NSCameraUsageDescription": "ใช้กล้องเพื่อถ่ายรูปสินค้า",
      "NSPhotoLibraryUsageDescription": "เลือกรูปสินค้าจากคลังภาพ"
    }
  },
  "android": {
    "blockedPermissions": ["android.permission.RECORD_AUDIO", "android.permission.SYSTEM_ALERT_WINDOW"],
    "package": "th.co.ship.customer",
    "permissions": [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "CAMERA"
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
      { "android": { "enableMinifyInReleaseBuilds": true, "enableShrinkResourcesInReleaseBuilds": true, "useLegacyPackaging": true } }
    ],
    "expo-router",
    "expo-secure-store",
    [
      "expo-location",
      {
        "locationWhenInUsePermission": "ใช้ตำแหน่งของคุณเพื่อปักหมุดจุดรับสินค้าและคำนวณราคา"
      }
    ],
    [
      "expo-image-picker",
      {
        "cameraPermission": "ใช้กล้องเพื่อถ่ายรูปสินค้า"
      }
    ],
    "expo-notifications"
  ],
  "experiments": {
    "typedRoutes": false
  },
  "extra": {
    "apiUrl": process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'
  }
};

export default config;
