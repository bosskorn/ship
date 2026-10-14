import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { haptics, TIcon, TText, useTheme } from '@/design-system';
import { displayTurn, movePage, PageItem, slotAt } from '@/core/document-engine/pages/pageOps';
import { SecureImage } from '@/features/shared/SecureImage';

export const PAGE_COLUMNS = 3;
const PAGE_ASPECT = 1.414;

/** One page: its preview turned to its current rotation, the page number, selection. */
export function PageThumb({ item, width, height, selected, label }: { item: PageItem; width: number; height: number; selected?: boolean; label?: string }) {
  const { colors, radius } = useTheme();
  const turn = displayTurn(item);
  const sideways = turn === 90 || turn === 270;
  return (
    <View style={{ width, gap: 4, alignItems: 'center' }}>
      <View
        style={{
          width,
          height,
          borderRadius: radius.md,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.brand : colors.divider,
          backgroundColor: colors.bgSecondary,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SecureImage
          uri={item.page.processedUri}
          resizeMode="contain"
          style={{ width: sideways ? height - 4 : width - 4, height: sideways ? width - 4 : height - 4, transform: [{ rotate: `${turn}deg` }] }}
        />
        {selected ? (
          <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
            <TIcon name="check" size={14} color={colors.textAnti} strokeWidth={2.5} />
          </View>
        ) : null}
      </View>
      {label ? (
        <TText variant="caption" color={selected ? 'brand' : 'textSecondary'} weight={selected ? '600' : undefined} numberOfLines={1} style={{ maxWidth: width }}>
          {label}
        </TText>
      ) : null}
    </View>
  );
}

/**
 * Thumbnail grid shared by every page tool. Long press then drag moves a page (the grid shows
 * where it will land); taps go to `onPress`. Reordering is also possible without dragging
 * (Page Manager's move buttons) for accessibility.
 */
export function PageGrid({
  items,
  selected,
  onPress,
  onMove,
  onDragChange,
  badge,
}: {
  items: PageItem[];
  selected?: ReadonlySet<string>;
  onPress: (item: PageItem, index: number) => void;
  /** Omit to disable dragging (e.g. Split, PDF → Images). */
  onMove?: (from: number, to: number) => void;
  onDragChange?: (dragging: boolean) => void;
  /** Extra label under a page (e.g. its source document in Merge). */
  badge?: (item: PageItem) => string | undefined;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { width } = useWindowDimensions();
  const gap = spacing.sm;
  const cellW = Math.floor((width - spacing.md * 2 - gap * (PAGE_COLUMNS - 1)) / PAGE_COLUMNS);
  const thumbH = Math.round(cellW * PAGE_ASPECT);
  const cell = { width: cellW + gap, height: thumbH + 24 + gap };

  const container = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ from: number; to: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [pos] = useState(() => new Animated.ValueXY());
  // What the gesture handlers read at event time (they are created once).
  const live = useRef({ count: items.length, cell, cellW, thumbH, onMove, onDragChange });
  useLayoutEffect(() => {
    live.current = { count: items.length, cell, cellW, thumbH, onMove, onDragChange };
  });

  // The responder is created once; its handlers read the refs only when touch events arrive,
  // never during render (the lint rule cannot tell them apart from render-time reads).
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const end = (commit: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      live.current.onDragChange?.(false);
      if (commit && d && d.from !== d.to) live.current.onMove?.(d.from, d.to);
    };
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: () => dragRef.current !== null,
      onMoveShouldSetPanResponderCapture: () => dragRef.current !== null,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (e) => {
        const d = dragRef.current;
        if (!d) return;
        const g = live.current;
        const x = e.nativeEvent.pageX - origin.current.x;
        const y = e.nativeEvent.pageY - origin.current.y;
        pos.setValue({ x: x - g.cellW / 2, y: y - g.thumbH / 2 });
        const to = slotAt(x, y, g.cell, PAGE_COLUMNS, g.count);
        if (to !== d.to) {
          dragRef.current = { ...d, to };
          setDrag({ ...d, to });
          haptics.select();
        }
      },
      onPanResponderRelease: () => end(true),
      onPanResponderTerminate: () => end(false),
    });
  });

  const startDrag = (index: number) => {
    if (!onMove || items.length < 2) return;
    haptics.long();
    container.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
    const col = index % PAGE_COLUMNS;
    const row = Math.floor(index / PAGE_COLUMNS);
    pos.setValue({ x: col * cell.width, y: row * cell.height });
    dragRef.current = { from: index, to: index };
    setDrag({ from: index, to: index });
    onDragChange?.(true);
  };

  // While dragging, the grid shows the order the page will produce.
  const shown = drag ? movePage(items, drag.from, drag.to) : items;
  const dragged = drag ? items[drag.from] : null;

  return (
    <View ref={container} {...pan.panHandlers} style={{ flexDirection: 'row', flexWrap: 'wrap', gap, paddingHorizontal: spacing.md }}>
      {shown.map((it, i) => {
        const isDragged = dragged?.key === it.key;
        const label = [t('pages.page_n', { n: i + 1 }), badge?.(it)].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={it.key}
            testID={`page-${i + 1}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={selected ? { selected: selected.has(it.key) } : undefined}
            accessibilityHint={onMove ? t('pages.drag_hint') : undefined}
            delayLongPress={300}
            onPress={() => !drag && onPress(it, i)}
            onLongPress={() => startDrag(i)}
            style={{ opacity: isDragged ? 0.25 : 1 }}
          >
            <PageThumb item={it} width={cellW} height={thumbH} selected={selected?.has(it.key)} label={label} />
          </Pressable>
        );
      })}
      {dragged ? (
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', left: spacing.md, top: 0, transform: pos.getTranslateTransform(), elevation: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
        >
          <View style={{ transform: [{ scale: 1.06 }] }}>
            <PageThumb item={dragged} width={cellW} height={thumbH} selected />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
