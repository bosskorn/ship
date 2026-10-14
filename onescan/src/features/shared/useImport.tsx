import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { TProgress, TText, useTheme, useToast } from '@/design-system';
import { defaultFilterFor } from '@/core/document-engine/image/filters';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { noteCropResult } from '@/features/scanner/cropStats';
import { isDiskFull } from '@/core/document-engine/storage/diskSpace';
import { MAX_SCAN_PAGES, useScanSession } from '@/features/scanner/scanSession';
import { useDocuments } from '@/features/documents/documentsStore';
import { track } from '@/services/analytics/analytics';

/** Just-in-time import flows: permissions are requested only here (spec §49). */
export function useImport() {
  const { t } = useTranslation();
  const toast = useToast();
  const { colors, spacing, radius } = useTheme();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const importPdf = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      setBusy(true);
      track('import_started', { kind: 'pdf' });
      const doc = await DocumentEngine.importPdf(res.assets[0].uri, res.assets[0].name, (_stage, p) => setProgress(p));
      await useDocuments.getState().refresh();
      router.push({ pathname: '/document/[id]', params: { id: doc.id } });
    } catch (e) {
      toast(t(isDiskFull(e) ? 'errors.disk_full' : 'errors.import_failed'), 'error');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }, [t, toast]);

  /** Returns true when pages were added. With `append`, the caller handles navigation. */
  const importPhotos = useCallback(async (opts?: { append?: boolean }): Promise<boolean> => {
    try {
      const room = opts?.append ? MAX_SCAN_PAGES - useScanSession.getState().pages.length : MAX_SCAN_PAGES;
      if (room <= 0) {
        toast(t('scanner.page_limit', { count: MAX_SCAN_PAGES }), 'info');
        return false;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 1 });
      if (res.canceled || !res.assets.length) return false;
      setBusy(true);
      track('import_started', { kind: 'photo', count: res.assets.length });
      const session = useScanSession.getState();
      // From the camera, imported photos join the current scan session.
      if (!opts?.append) session.start();
      for (const a of res.assets.slice(0, room)) {
        const docType = useScanSession.getState().docType;
        const prior = docType === 'id_card' || docType === 'business_card' ? 'card' : docType === 'receipt' ? 'receipt' : null;
        const page = await DocumentEngine.processCapture(a.uri, defaultFilterFor(docType), { prior });
        session.addPage(page);
        noteCropResult(page);
      }
      if (!opts?.append) router.push('/editor');
      return true;
    } catch (e) {
      toast(t(isDiskFull(e) ? 'errors.disk_full' : 'errors.import_failed'), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  const overlay = busy ? (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgMask, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }]}>
      <View style={{ width: '100%', maxWidth: 320, backgroundColor: colors.bgContainer, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md }}>
        <TText variant="title" align="center">
          {t('documents.importing')}
        </TText>
        <TProgress value={0.1 + progress * 0.85} />
      </View>
    </View>
  ) : null;

  return { importPdf, importPhotos, busy, overlay };
}
