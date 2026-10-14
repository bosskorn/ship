import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TLoading, TText, useTheme } from '@/design-system';
import type { DocumentRecord } from '@/core/document-engine/model';
import { DocumentPickSheet } from './DocumentPickSheet';

/** First step of a one-source tool: a OneScan document or a PDF file on the device. */
export function SourcePicker({ hint, loading, error, onDocument, onFile }: {
  hint: string;
  loading: boolean;
  error: 'pdf' | 'load' | null;
  onDocument: (doc: DocumentRecord) => void;
  onFile: () => void;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [picking, setPicking] = useState(false);
  if (loading) {
    return (
      <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: 96 }}>
        <TLoading />
        <TText variant="body" color="textSecondary">
          {t('pages.loading')}
        </TText>
      </View>
    );
  }
  return (
    <View>
      <TText variant="body" color="textSecondary" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
        {hint}
      </TText>
      {error ? (
        <TText variant="body" color="error" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
          {error === 'pdf' ? t('pages.pdf_failed') : t('pages.failed')}
        </TText>
      ) : null}
      <TCellGroup>
        <TCell testID="source-document" icon="documents" title={t('pages.choose_document')} arrow onPress={() => setPicking(true)} />
        <TCell testID="source-file" icon="importPdf" title={t('to_images.from_file')} arrow onPress={onFile} />
      </TCellGroup>
      <DocumentPickSheet
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(doc) => {
          setPicking(false);
          onDocument(doc);
        }}
      />
    </View>
  );
}
