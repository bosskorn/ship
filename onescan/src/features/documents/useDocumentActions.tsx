import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TActionSheet, TDialog, TInput, useToast } from '@/design-system';
import type { DocumentRecord } from '@/core/document-engine/model';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { documentRepository } from '@/core/database/repositories/documentRepository';
import { useFeature, useRemoteConfig } from '@/core/config/remoteConfig';
import { track } from '@/services/analytics/analytics';
import { useDocuments } from './documentsStore';

type Pending = { kind: 'menu' | 'rename' | 'delete' | 'move'; doc: DocumentRecord } | null;

/**
 * Context menu for a document (spec §23): actions are revealed on demand,
 * never all shown inline.
 */
export function useDocumentActions() {
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
        toast(t('common.comingSoon'));
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
        items={[
          { key: 'share', label: t('documents.share'), icon: 'share' },
          { key: 'rename', label: t('documents.rename'), icon: 'edit' },
          { key: 'move', label: t('documents.move'), icon: 'folder' },
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
