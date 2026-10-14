// Web-preview stand-in for react-native-maps (native maps render only on Android/iOS).
import { forwardRef, ReactNode, useEffect, useImperativeHandle } from 'react';
import { Text, View } from 'react-native';

type Props = { style?: any; children?: ReactNode; initialRegion?: Region; onRegionChangeComplete?: (r: Region) => void; [k: string]: any };

const MapView = forwardRef<unknown, Props>(function MapView({ style, children, initialRegion, onRegionChangeComplete }, ref) {
  useImperativeHandle(ref, () => ({ animateToRegion() {}, fitToCoordinates() {} }));
  // the native map reports the pin position once it settles; mimic that
  useEffect(() => {
    if (initialRegion) onRegionChangeComplete?.(initialRegion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={[{ backgroundColor: '#E8EEF4', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#8B929C', fontSize: 12 }}>แผนที่ (แสดงบนมือถือจริง)</Text>
      <View style={{ display: 'none' }}>{children}</View>
    </View>
  );
});

export const Marker = (_: { children?: ReactNode; [k: string]: unknown }) => null;
export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export default MapView;
