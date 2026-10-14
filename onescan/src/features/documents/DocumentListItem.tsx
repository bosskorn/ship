import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TIcon, TIconButton, TText, useTheme } from '@/design-system';
import type { DocumentRecord } from '@/core/document-engine/model';
import { formatRelativeDay } from '@/core/i18n/format';
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

/** "6 pages · Today" (pages optional), in the user's locale. */
export function useDocumentMeta(doc: DocumentRecord, opts: { pages?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const day = formatRelativeDay(doc.updatedAt, i18n.language, { today: t('common.today'), yesterday: t('common.yesterday') });
  return [opts.pages !== false && doc.pageCount ? t('common.pages', { count: doc.pageCount }) : null, day].filter(Boolean).join(' · ');
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

/**
 * The first page as a physical sheet: soft shadow, a second sheet behind when the document
 * has more pages, and the page count on the page.
 */
export function DocumentPaper({ doc, width, height }: { doc: DocumentRecord; width: number | `${number}%`; height: number }) {
  const { colors } = useTheme();
  const multi = doc.pageCount > 1;
  return (
    <View style={{ width, height, paddingRight: multi ? 4 : 0, paddingBottom: multi ? 4 : 0 }}>
      {multi ? (
        <View style={{ position: 'absolute', left: 4, top: 4, right: 0, bottom: 0, borderRadius: 6, backgroundColor: colors.bgContainer, borderWidth: 1, borderColor: colors.border }} />
      ) : null}
      <View style={{ flex: 1, borderRadius: 6, backgroundColor: colors.bgContainer, elevation: 3, shadowColor: '#0F1521', shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}>
        <View style={{ flex: 1, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' }}>
          {doc.thumbnailUri ? (
            <SecureImage uri={doc.thumbnailUri} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <TIcon name="documents" size="lg" color={colors.textPlaceholder} />
          )}
        </View>
        {multi ? (
          <View style={{ position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(15,21,33,0.72)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 }}>
            <TText variant="caption" weight="600" style={{ color: '#FFFFFF', fontSize: 11, lineHeight: 16 }}>
              {doc.pageCount}
            </TText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** List rows show the document as text: a type badge instead of a page image (no decryption). */
export function DocumentTypeBadge({ doc, size = 44 }: { doc: DocumentRecord; size?: number }) {
  const { colors } = useTheme();
  const icon = doc.docType === 'id_card' ? 'idCard' : doc.docType === 'receipt' ? 'receipt' : 'documents';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
      <TIcon name={icon} size={size / 2} color={colors.brand} />
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
      <DocumentTypeBadge doc={doc} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}>
          <TText variant="bodyLarge" numberOfLines={1} style={{ flexShrink: 1 }}>
            {doc.title}
          </TText>
          {doc.isFavorite ? <TIcon name="star" size={14} color={colors.warning} filled /> : null}
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
