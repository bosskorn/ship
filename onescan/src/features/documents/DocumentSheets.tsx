import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TChip, TDialog, TInput, TText, useTheme } from '@/design-system';
import type { DocumentRecord } from '@/core/document-engine/model';
import { formatBytes, formatDate } from '@/core/i18n/format';
import { DocumentInfo, DocumentMetadataService } from '@/core/document-engine/services/DocumentMetadataService';
import { TagService, TagServiceError } from '@/core/document-engine/services/TagService';
import { useDocuments } from './documentsStore';

export function useTagErrorText() {
  const { t } = useTranslation();
  return (e: unknown) => (e instanceof TagServiceError ? t(`tags.err_${e.code}`) : t('errors.generic'));
}

/** Tags of one document: tap to add/remove, create a new one inline, or manage all tags. */
export function TagPickerDialog({ doc, onClose }: { doc: DocumentRecord | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const tags = useDocuments((s) => s.tags);
  const tagMap = useDocuments((s) => s.tagMap);
  const refresh = useDocuments((s) => s.refresh);
  const errorText = useTagErrorText();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const assigned = new Set(doc ? (tagMap[doc.id] ?? []) : []);

  const done = () => {
    setName('');
    setError(null);
    onClose();
  };

  const toggle = async (tagId: string) => {
    if (!doc) return;
    await TagService.setAssigned(doc.id, tagId, !assigned.has(tagId));
    await refresh();
  };
  const create = async () => {
    if (!doc) return;
    setError(null);
    try {
      const id = await TagService.create(name);
      await TagService.setAssigned(doc.id, id, true);
      setName('');
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <TDialog
      visible={!!doc}
      title={t('tags.title')}
      onRequestClose={done}
      actions={[
        {
          label: t('tags.manage'),
          onPress: () => {
            done();
            router.push('/tags');
          },
        },
        { label: t('common.done'), tone: 'primary', onPress: done },
      ]}
    >
      <View style={{ gap: spacing.sm }}>
        {tags.length ? (
          <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {tags.map((tag) => (
              <TChip
                key={tag.id}
                testID={`tag-chip-${tag.name}`}
                label={tag.name}
                icon={assigned.has(tag.id) ? 'check' : 'tag'}
                selected={assigned.has(tag.id)}
                onPress={() => void toggle(tag.id)}
              />
            ))}
          </ScrollView>
        ) : (
          <TText variant="body" color="textSecondary">
            {t('tags.none_yet')}
          </TText>
        )}
        <TInput
          testID="tag-new"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
          placeholder={t('tags.new_placeholder')}
          maxLength={30}
          returnKeyType="done"
          onSubmitEditing={() => void create()}
          error={error ?? undefined}
        />
      </View>
    </TDialog>
  );
}

/** Document Info: only what OneScan really stores (no OCR language: it is not recorded per document). */
export function DocumentInfoDialog({ doc, onClose }: { doc: DocumentRecord | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { spacing } = useTheme();
  const [loaded, setLoaded] = useState<{ doc: DocumentRecord; info: DocumentInfo } | null>(null);
  const info = loaded && loaded.doc === doc ? loaded.info : null;

  useEffect(() => {
    let alive = true;
    if (doc) DocumentMetadataService.info(doc).then((i) => alive && setLoaded({ doc, info: i })).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [doc]);

  const rows: [string, string][] = info
    ? [
        [t('doc_info.name'), info.title],
        [t('doc_info.type'), t(`doc_types.${info.docType}`)],
        [t('doc_info.pages'), String(info.pageCount)],
        [t('doc_info.created'), formatDate(info.createdAt, i18n.language)],
        [t('doc_info.modified'), formatDate(info.updatedAt, i18n.language)],
        [t('doc_info.size'), formatBytes(info.sizeBytes, i18n.language)],
        [t('doc_info.folder'), info.folder ? (info.folder.systemKey ? t(`folders.${info.folder.systemKey}`) : info.folder.name) : t('doc_info.no_folder')],
        [t('doc_info.tags'), info.tags.length ? info.tags.join(', ') : t('doc_info.no_tags')],
      ]
    : [];

  return (
    <TDialog visible={!!doc} title={t('doc_info.title')} onRequestClose={onClose} actions={[{ label: t('common.close'), tone: 'primary', onPress: onClose }]}>
      <View testID="doc-info" style={{ gap: spacing.sm }}>
        {rows.map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TText variant="body" color="textSecondary" style={{ width: 96 }}>
              {label}
            </TText>
            <TText variant="body" style={{ flex: 1 }} selectable>
              {value}
            </TText>
          </View>
        ))}
      </View>
    </TDialog>
  );
}
