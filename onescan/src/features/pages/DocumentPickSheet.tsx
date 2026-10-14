import React from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TDivider, TEmpty, TIconButton, TText, useTheme } from '@/design-system';
import type { DocumentRecord } from '@/core/document-engine/model';
import { useDocuments } from '@/features/documents/documentsStore';
import { DocumentTypeBadge, useDocumentMeta } from '@/features/documents/DocumentListItem';

function Row({ doc, onPress }: { doc: DocumentRecord; onPress: () => void }) {
  const { spacing, colors } = useTheme();
  const meta = useDocumentMeta(doc);
  return (
    <Pressable
      testID={`pick-${doc.id}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: pressed ? colors.bgPressed : colors.bgContainer })}
    >
      <DocumentTypeBadge doc={doc} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <TText variant="bodyLarge" numberOfLines={1}>
          {doc.title}
        </TText>
        <TText variant="bodySmall" color="textSecondary" numberOfLines={1}>
          {meta}
        </TText>
      </View>
    </Pressable>
  );
}

/** Full-screen list of documents to choose one from (only documents with pages). */
export function DocumentPickSheet({ visible, onClose, onPick, exclude }: { visible: boolean; onClose: () => void; onPick: (doc: DocumentRecord) => void; exclude?: string }) {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const documents = useDocuments((s) => s.documents).filter((d) => d.pageCount > 0 && d.id !== exclude);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.bgContainer, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs, height: 56 }}>
          <TIconButton icon="close" accessibilityLabel={t('common.cancel')} onPress={onClose} />
          <TText variant="title">{t('pages.choose_document')}</TText>
        </View>
        <FlatList
          data={documents}
          keyExtractor={(d) => d.id}
          ItemSeparatorComponent={() => <TDivider inset={spacing.md + 40 + spacing.sm} />}
          renderItem={({ item }) => <Row doc={item} onPress={() => onPick(item)} />}
          ListEmptyComponent={<TEmpty icon="documents" title={t('pages.no_documents')} />}
          contentContainerStyle={{ flexGrow: 1 }}
        />
      </View>
    </Modal>
  );
}
