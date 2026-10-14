import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { router } from 'expo-router';
import { TActionSheet, TDialog, TInput, TText, useTheme, useToast } from '@/design-system';
import type { DocumentRecord } from '@/core/document-engine/model';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { useFeature, useRemoteConfig } from '@/core/config/remoteConfig';
import { track } from '@/services/analytics/analytics';
import { useDocuments } from './documentsStore';
import { DocumentThumb, useDocumentMeta } from './DocumentListItem';
import { DocumentInfoDialog, TagPickerDialog } from './DocumentSheets';
import { DocumentMetadataService } from '@/core/document-engine/services/DocumentMetadataService';

/** Bottom-sheet header: which document the actions apply to. */
function SheetHeader({ doc }: { doc: DocumentRecord }) {
  const { spacing } = useTheme();
  const meta = useDocumentMeta(doc);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.sm }}>
      <DocumentThumb doc={doc} width={36} height={46} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <TText variant="title" numberOfLines={1}>
          {doc.title}
        </TText>
        <TText variant="bodySmall" color="textSecondary" numberOfLines={1}>
          {meta}
        </TText>
      </View>
    </View>
  );
}

type Pending = { kind: 'menu' | 'rename' | 'delete' | 'move' | 'tags' | 'info'; doc: DocumentRecord } | null;

/**
 * Context menu for a document (spec §23): actions are revealed on demand, never all shown inline.
 * Order: open, rename, favourite, tags, move, share, print, duplicate, delete. In the Viewer
 * (`inViewer`) "open" is replaced by Document info.
 */
export function useDocumentActions(opts: { inViewer?: boolean; onChanged?: () => void } = {}) {
  const { t } = useTranslation();
  const toast = useToast();
  const folders = useDocuments((s) => s.folders);
  const refresh = useDocuments((s) => s.refresh);
  const retention = useRemoteConfig((s) => s.config.trashRetentionDays);
  const trashEnabled = useFeature('trash');
  const [pending, setPending] = useState<Pending>(null);
  const [name, setName] = useState('');

  const open = useCallback((doc: DocumentRecord) => setPending({ kind: 'menu', doc }), []);
  const close = () => setPending(null);

  const onSelect = async (key: string) => {
    if (!pending) return;
    const doc = pending.doc;
    switch (key) {
      case 'open':
        close();
        router.push({ pathname: '/document/[id]', params: { id: doc.id } });
        return;
      case 'favorite':
        close();
        try {
          await DocumentMetadataService.setFavorite(doc, !doc.isFavorite);
          await refresh();
          opts.onChanged?.();
          toast(t(doc.isFavorite ? 'documents.unfavorited' : 'documents.favorited'), 'success');
        } catch {
          toast(t('errors.generic'), 'error');
        }
        return;
      case 'tags':
        return setPending({ kind: 'tags', doc });
      case 'info':
        return setPending({ kind: 'info', doc });
      case 'print':
        close();
        try {
          await DocumentEngine.print(doc);
        } catch {
          toast(t('errors.print_failed'), 'error');
        }
        return;
      case 'share':
        close();
        try {
          if (!(await DocumentEngine.export.isShareAvailable())) return toast(t('errors.share_unavailable'), 'error');
          await DocumentEngine.share(doc);
          track('document_shared', { source: 'menu' });
        } catch {
          toast(t('errors.generic'), 'error');
        }
        return;
      case 'rename':
        setName(doc.title);
        return setPending({ kind: 'rename', doc });
      case 'move':
        if (!folders.length) {
          close();
          return toast(t('documents.no_folders_hint'), 'info');
        }
        return setPending({ kind: 'move', doc });
      case 'delete':
        return setPending({ kind: 'delete', doc });
      case 'duplicate':
        close();
        try {
          await DocumentEngine.duplicate(doc, t('documents.copy_name', { name: doc.title }));
          await refresh();
          toast(t('documents.duplicated'), 'success');
        } catch {
          toast(t('errors.generic'), 'error');
        }
        return;
      default:
        close();
    }
  };

  const element = (
    <>
      <TActionSheet
        visible={pending?.kind === 'menu'}
        title={pending?.doc.title}
        cancelLabel={t('common.cancel')}
        onClose={close}
        onSelect={onSelect}
        header={pending?.kind === 'menu' ? <SheetHeader doc={pending.doc} /> : undefined}
        items={[
          opts.inViewer ? { key: 'info', label: t('doc_info.title'), icon: 'info' as const } : { key: 'open', label: t('documents.open'), icon: 'documents' as const },
          { key: 'rename', label: t('documents.rename'), icon: 'edit' },
          { key: 'favorite', label: t(pending?.doc.isFavorite ? 'documents.unfavorite' : 'documents.favorite'), icon: 'star' },
          { key: 'tags', label: t('documents.tags'), icon: 'tag' },
          { key: 'move', label: t('documents.move_to_folder'), icon: 'folder' },
          { key: 'share', label: t('documents.share_pdf'), icon: 'share' },
          ...(pending?.doc.pdfUri && DocumentEngine.export.canPrint() ? [{ key: 'print', label: t('documents.print'), icon: 'print' as const }] : []),
          { key: 'duplicate', label: t('documents.duplicate'), icon: 'duplicate' },
          { key: 'delete', label: t('documents.delete'), icon: 'delete', danger: true },
        ]}
      />
      <TActionSheet
        visible={pending?.kind === 'move'}
        title={t('documents.move')}
        cancelLabel={t('common.cancel')}
        onClose={close}
        items={folders.map((f) => ({ key: f.id, label: f.systemKey ? t(`folders.${f.systemKey}`) : f.name, icon: 'folder' as const }))}
        onSelect={async (folderId) => {
          if (!pending) return;
          await documentRepository.move(pending.doc.id, folderId);
          close();
          await refresh();
        }}
      />
      <TagPickerDialog doc={pending?.kind === 'tags' ? pending.doc : null} onClose={close} />
      <DocumentInfoDialog doc={pending?.kind === 'info' ? pending.doc : null} onClose={close} />
      <TDialog
        visible={pending?.kind === 'rename'}
        title={t('documents.rename')}
        onRequestClose={close}
        actions={[
          { label: t('common.cancel'), onPress: close },
          {
            label: t('common.save'),
            tone: 'primary',
            onPress: async () => {
              const title = name.trim();
              if (pending && title) {
                await documentRepository.rename(pending.doc.id, title);
                await refresh();
                toast(t('documents.renamed'), 'success');
              }
              close();
            },
          },
        ]}
      >
        <TInput value={name} onChangeText={setName} autoFocus selectTextOnFocus maxLength={120} />
      </TDialog>
      <TDialog
        visible={pending?.kind === 'delete'}
        title={t(trashEnabled ? 'documents.delete_title' : 'documents.delete_forever_title')}
        content={trashEnabled ? t('documents.delete_body', { days: retention }) : t('documents.delete_forever_body')}
        onRequestClose={close}
        actions={[
          // No Trash screen in 1.2.0: deleting is permanent, and the dialog says so.
          ...(trashEnabled
            ? [
                {
                  label: t('documents.delete'),
                  tone: 'danger' as const,
                  onPress: async () => {
                    if (pending) await DocumentEngine.moveToTrash(pending.doc.id);
                    close();
                    await refresh();
                    toast(t('documents.deleted'));
                  },
                },
              ]
            : []),
          {
            label: t('documents.delete_permanent'),
            tone: 'danger',
            onPress: async () => {
              if (pending) await DocumentEngine.deletePermanently(pending.doc);
              close();
              await refresh();
              if (!trashEnabled) toast(t('documents.deleted_forever'));
            },
          },
          { label: t('common.cancel'), onPress: close },
        ]}
      />
    </>
  );

  return { open, element };
}
