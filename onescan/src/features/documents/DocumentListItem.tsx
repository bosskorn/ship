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
}

export const DocumentListItem = memo(function DocumentListItem({ doc, onPress, onMore }: DocumentListItemProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const meta = [
    t('documents.pdf'),
    doc.pageCount ? t('common.pages', { count: doc.pageCount }) : null,
    formatBytes(doc.sizeBytes),
    formatDate(doc.updatedAt, i18n.language),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      testID={`doc-${doc.id}`}
      accessibilityRole="button"
      onPress={() => onPress(doc)}
      onLongPress={onMore ? () => onMore(doc) : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingLeft: spacing.md,
        paddingRight: spacing.xxs,
        paddingVertical: spacing.sm,
        backgroundColor: pressed ? colors.bgPressed : colors.bgContainer,
      })}
    >
      <View
        style={{
          width: 44,
          height: 56,
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
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}>
          <TText variant="bodyLarge" numberOfLines={1} style={{ flexShrink: 1 }}>
            {doc.title}
          </TText>
          {doc.hasSensitive ? <TIcon name="shield" size={14} color={colors.warning} /> : null}
        </View>
        <TText variant="bodySmall" color="textPlaceholder" numberOfLines={1}>
          {meta}
        </TText>
      </View>
      {onMore ? <TIconButton icon="more" accessibilityLabel={t('common.more')} color={colors.textSecondary} onPress={() => onMore(doc)} /> : null}
    </Pressable>
  );
});
