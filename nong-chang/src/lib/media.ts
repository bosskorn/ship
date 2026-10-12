/**
 * Just-in-time permissions (spec §64): camera is requested only when the user
 * taps "ถ่ายรูป", photos only when they choose to upload.
 */
import * as ImagePicker from 'expo-image-picker';

export type PickResult = { uri: string } | { denied: true } | { cancelled: true };

export async function pickPhoto(source: 'camera' | 'library'): Promise<PickResult> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { denied: true };
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.7, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return { cancelled: true };
  return { uri: res.assets[0].uri };
}
