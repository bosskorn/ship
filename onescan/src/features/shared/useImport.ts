import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/design-system';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { useScanSession } from '@/features/scanner/scanSession';
import { useDocuments } from '@/features/documents/documentsStore';
import { track } from '@/services/analytics/analytics';

/** Just-in-time import flows: permissions are requested only here (spec §49). */
export function useImport() {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const importPdf = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      setBusy(true);
      track('import_started', { kind: 'pdf' });
      const doc = await DocumentEngine.importPdf(res.assets[0].uri, res.assets[0].name);
      await useDocuments.getState().refresh();
      router.push({ pathname: '/document/[id]', params: { id: doc.id } });
    } catch {
      toast(t('errors.import_failed'), 'error');
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  /** Returns true when pages were added. With `append`, the caller handles navigation. */
  const importPhotos = useCallback(async (opts?: { append?: boolean }): Promise<boolean> => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
      if (res.canceled || !res.assets.length) return false;
      setBusy(true);
      track('import_started', { kind: 'photo', count: res.assets.length });
      const session = useScanSession.getState();
      // From the camera, imported photos join the current scan session.
      if (!opts?.append) session.start();
      for (const a of res.assets) session.addPage(await DocumentEngine.processCapture(a.uri));
      if (!opts?.append) router.push('/editor');
      return true;
    } catch {
      toast(t('errors.import_failed'), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  return { importPdf, importPhotos, busy };
}
