import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TIcon, TIconButton, TText, useTheme } from '@/design-system';
import type { DocumentRecord } from '@/core/document-engine/model';
import { formatBytes, formatDate } from '@/core/i18n/format';
import { SecureImage } from '@/features/shared/SecureImage';

export interface DocumentListItemProps {
  doc: DocumentRecord;
  onPress: (doc: DocumentRecord) => void;
  onMore?: (doc: DocumentRecord) => void;
  /** Long press: starts selection where the screen supports it, otherwise opens the menu. */
  onLongPress?: (doc: DocumentRecord) => void;
  /** In selection mode: shows a check instead of the menu button. */
  selected?: boolean;
  selecting?: boolean;
}

/** Date · pages · size, in the user's locale. */
export function useDocumentMeta(doc: DocumentRecord, withSize = true) {
  const { t, i18n } = useTranslation();
  return [
    formatDate(doc.updatedAt, i18n.language),
    doc.pageCount ? t('common.pages', { count: doc.pageCount }) : null,
    withSize ? formatBytes(doc.sizeBytes, i18n.language) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Thumbnail of the first page (decrypted on demand), or a document glyph. */
export function DocumentThumb({ doc, width, height }: { doc: DocumentRecord; width: number | `${number}%`; height: number }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius.sm,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.divider,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {doc.thumbnailUri ? (
        <SecureImage uri={doc.thumbnailUri} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <TIcon name="documents" size="md" color={colors.textPlaceholder} />
      )}
    </View>
  );
}

export function SelectionMark({ selected }: { selected: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: selected ? 0 : 2,
        borderColor: colors.border,
        backgroundColor: selected ? colors.brand : colors.bgContainer,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected ? <TIcon name="check" size="sm" color={colors.textAnti} strokeWidth={2.5} /> : null}
    </View>
  );
}

export const DocumentListItem = memo(function DocumentListItem({ doc, onPress, onMore, onLongPress, selected, selecting }: DocumentListItemProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const meta = useDocumentMeta(doc);

  return (
    <Pressable
      testID={`doc-${doc.id}`}
      accessibilityRole="button"
      accessibilityState={selecting ? { selected: !!selected } : undefined}
      onPress={() => onPress(doc)}
      onLongPress={onLongPress ? () => onLongPress(doc) : onMore ? () => onMore(doc) : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingStart: spacing.md,
        paddingEnd: spacing.xxs,
        paddingVertical: spacing.sm,
        backgroundColor: selected ? colors.brandLight : pressed ? colors.bgPressed : colors.bgContainer,
      })}
    >
      <DocumentThumb doc={doc} width={44} height={56} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}>
          <TText variant="bodyLarge" numberOfLines={1} style={{ flexShrink: 1 }}>
            {doc.title}
          </TText>
          {doc.hasSensitive ? <TIcon name="shield" size={14} color={colors.warning} /> : null}
        </View>
        <TText variant="bodySmall" color="textSecondary" numberOfLines={1}>
          {meta}
        </TText>
      </View>
      {selecting ? (
        <View style={{ width: 48, alignItems: 'center' }}>
          <SelectionMark selected={!!selected} />
        </View>
      ) : onMore ? (
        <TIconButton icon="more" accessibilityLabel={t('common.more')} color={colors.textSecondary} onPress={() => onMore(doc)} size={48} />
      ) : null}
    </Pressable>
  );
});
