import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TIconButton, TText, useTheme } from '@/design-system';
import { DocumentListItemProps, DocumentThumb, SelectionMark, useDocumentMeta } from './DocumentListItem';

/** Grid cell: the page itself is the hero (A4 proportions), title and meta below. */
export const DocumentGridItem = memo(function DocumentGridItem({ doc, onPress, onMore, onLongPress, selected, selecting }: DocumentListItemProps) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const meta = useDocumentMeta(doc, false);
  return (
    <Pressable
      testID={`doc-${doc.id}`}
      accessibilityRole="button"
      accessibilityState={selecting ? { selected: !!selected } : undefined}
      onPress={() => onPress(doc)}
      onLongPress={onLongPress ? () => onLongPress(doc) : onMore ? () => onMore(doc) : undefined}
      style={({ pressed }) => ({
        flex: 1,
        padding: spacing.xs,
        borderRadius: radius.lg,
        backgroundColor: selected ? colors.brandLight : pressed ? colors.bgPressed : 'transparent',
      })}
    >
      <View>
        <DocumentThumb doc={doc} width="100%" height={196} />
        {selecting ? (
          <View style={{ position: 'absolute', top: spacing.xs, end: spacing.xs }}>
            <SelectionMark selected={!!selected} />
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TText variant="body" weight="500" numberOfLines={1}>
            {doc.title}
          </TText>
          <TText variant="bodySmall" color="textSecondary" numberOfLines={1}>
            {meta}
          </TText>
        </View>
        {!selecting && onMore ? (
          <TIconButton icon="more" accessibilityLabel={t('common.more')} color={colors.textSecondary} onPress={() => onMore(doc)} size={36} />
        ) : null}
      </View>
    </Pressable>
  );
});
