import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { color, radius, space } from '@/theme/tokens';

import { NIcon } from './NIcon';
import { NText } from './NText';

/**
 * Photo thumbnails. Mock ids (e.g. "before-1") render a neutral placeholder;
 * real URIs load lazily.
 */
export function NPhotoGrid({ uris, onAdd, onRemove, size = 80, label }: { uris: string[]; onAdd?: () => void; onRemove?: (uri: string) => void; size?: number; label?: string }) {
  return (
    <View style={styles.grid}>
      {uris.map((uri) => (
        <View key={uri} style={[styles.thumb, { width: size, height: size }]}>
          {uri.includes('://') ? (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <NIcon name="image" size={24} color={color.textPlaceholder} />
          )}
          {label ? (
            <View style={styles.label}>
              <NText variant="caption" style={{ color: color.textOnPrimary }}>
                {label}
              </NText>
            </View>
          ) : null}
          {onRemove ? (
            <Pressable accessibilityLabel="ลบรูป" hitSlop={8} onPress={() => onRemove(uri)} style={styles.remove}>
              <NIcon name="close" size={14} color={color.textOnPrimary} strokeWidth={2.5} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {onAdd ? (
        <Pressable accessibilityRole="button" accessibilityLabel="เพิ่มรูป" onPress={onAdd} style={[styles.thumb, styles.add, { width: size, height: size }]}>
          <NIcon name="plus" size={24} color={color.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  thumb: { borderRadius: radius.card, backgroundColor: color.bgSecondary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  add: { borderWidth: 1, borderStyle: 'dashed', borderColor: color.border, backgroundColor: color.bgContainer },
  remove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 2, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
});
