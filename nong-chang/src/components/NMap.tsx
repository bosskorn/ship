/**
 * Native map wrapper (react-native-maps: Apple Maps on iOS, Google Maps on
 * Android). The map mounts after the screen's first frame and fades in once
 * ready, so screens never wait on map tiles (spec §66 "Map โหลดแยก").
 */
import React, { forwardRef, useEffect, useState } from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';
import MapView, { MapViewProps } from 'react-native-maps';
import Animated, { FadeIn } from 'react-native-reanimated';

import { color, motion } from '@/theme/tokens';

export const NMap = forwardRef<MapView, MapViewProps>(function NMap({ style, onMapReady, ...props }, ref) {
  const [mount, setMount] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setMount(true));
    return () => task.cancel();
  }, []);
  return (
    <View style={[styles.placeholder, style]}>
      {mount ? (
        <Animated.View entering={FadeIn.duration(motion.crossfade)} style={StyleSheet.absoluteFill}>
          <MapView
            ref={ref}
            style={StyleSheet.absoluteFill}
            showsPointsOfInterests={false}
            showsCompass={false}
            toolbarEnabled={false}
            onMapReady={onMapReady}
            {...props}
          />
        </Animated.View>
      ) : null}
    </View>
  );
});

/** Customer location marker: brand dot with white ring. */
export function HomeMarker() {
  return (
    <View style={styles.homeOuter}>
      <View style={styles.homeInner} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: '#E9EEF5', overflow: 'hidden' },
  homeOuter: { width: 22, height: 22, borderRadius: 11, backgroundColor: color.bgContainer, alignItems: 'center', justifyContent: 'center' },
  homeInner: { width: 14, height: 14, borderRadius: 7, backgroundColor: color.primary },
});
