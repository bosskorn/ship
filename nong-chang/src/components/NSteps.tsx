import React from 'react';
import { StyleSheet, View } from 'react-native';

import { color, space } from '@/theme/tokens';

import { NIcon } from './NIcon';
import { NText } from './NText';

export type StepState = 'done' | 'current' | 'pending';

export interface StepItem {
  key: string;
  title: string;
  description?: string;
  state: StepState;
}

/** Vertical timeline (TDesign Steps, vertical layout). */
export function NSteps({ items, compact }: { items: StepItem[]; compact?: boolean }) {
  return (
    <View>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <View key={item.key} style={styles.row} accessibilityLabel={`${item.title} ${item.state === 'done' ? 'เสร็จแล้ว' : item.state === 'current' ? 'กำลังดำเนินการ' : ''}`}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.node,
                  item.state === 'done' && styles.nodeDone,
                  item.state === 'current' && styles.nodeCurrent,
                ]}
              >
                {item.state === 'done' ? <NIcon name="check" size={12} color={color.textOnPrimary} strokeWidth={2.5} /> : null}
                {item.state === 'current' ? <View style={styles.nodeInner} /> : null}
              </View>
              {!last ? <View style={[styles.line, item.state === 'done' && styles.lineDone]} /> : null}
            </View>
            <View style={[styles.body, { paddingBottom: last ? 0 : compact ? space.sm : space.md }]}>
              <NText
                variant={item.state === 'current' ? 'bodyStrong' : compact ? 'secondary' : 'body'}
                color={item.state === 'pending' ? 'textPlaceholder' : item.state === 'current' ? 'primary' : 'textPrimary'}
              >
                {item.title}
              </NText>
              {item.description ? (
                <NText variant="caption" color="textSecondary">
                  {item.description}
                </NText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Compact horizontal progress: ✓────✓────●────○ with labels (directive V2 §10, §13). */
export function NStepsInline({ items }: { items: StepItem[] }) {
  return (
    <View style={styles.inlineRow} accessibilityRole="progressbar">
      {items.map((item, i) => (
        <View key={item.key} style={styles.inlineItem}>
          <View style={styles.inlineTrack}>
            <View style={[styles.inlineLine, i === 0 && styles.hidden, item.state !== 'pending' && styles.lineDone]} />
            <View
              style={[
                styles.inlineNode,
                item.state === 'done' && styles.nodeDone,
                item.state === 'current' && styles.inlineCurrent,
              ]}
            >
              {item.state === 'done' ? <NIcon name="check" size={10} color={color.textOnPrimary} strokeWidth={3} /> : null}
            </View>
            <View
              style={[
                styles.inlineLine,
                i === items.length - 1 && styles.hidden,
                items[i + 1] && items[i + 1].state !== 'pending' && styles.lineDone,
              ]}
            />
          </View>
          <NText
            variant="label"
            numberOfLines={1}
            style={{ color: item.state === 'current' ? color.primary : item.state === 'done' ? color.textPrimary : color.textPlaceholder, fontWeight: item.state === 'current' ? '600' : '400' }}
          >
            {item.title}
          </NText>
        </View>
      ))}
    </View>
  );
}

const NODE = 18;
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  rail: { width: NODE, alignItems: 'center' },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.bgContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  nodeDone: { backgroundColor: color.primary, borderColor: color.primary },
  nodeCurrent: { borderColor: color.primary },
  nodeInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.primary },
  line: { flex: 1, width: 1.5, backgroundColor: color.divider, marginVertical: 2 },
  lineDone: { backgroundColor: color.primary },
  body: { flex: 1 },
  inlineRow: { flexDirection: 'row' },
  inlineItem: { flex: 1, alignItems: 'center', gap: 6 },
  inlineTrack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  inlineLine: { flex: 1, height: 2, backgroundColor: color.divider },
  hidden: { opacity: 0 },
  inlineNode: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: color.border, backgroundColor: color.bgContainer, alignItems: 'center', justifyContent: 'center' },
  inlineCurrent: { borderColor: color.primary, borderWidth: 5 },
});
