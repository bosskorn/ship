import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  IconName, TActionSheet, TCell, TCellGroup, TEmpty, TIcon, TNavigationBar, TScreen, TText, useTheme, useToast,
} from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import type { AiTaskId } from '@/core/document-engine/ai/aiPolicy';
import { useDocuments } from '@/features/documents/documentsStore';
import { track } from '@/services/analytics/analytics';

/** AI is a set of document tools, not an empty chatbot (spec §20). */
export function AIScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const allowAI = useSettings((s) => s.privacy.allowAI);
  const documents = useDocuments((s) => s.documents);
  const [picking, setPicking] = useState<AiTaskId | null>(null);

  const tools: { task: AiTaskId; icon: IconName; title: string; desc: string }[] = [
    { task: 'summary', icon: 'ai', title: t('ai.summarize'), desc: t('ai.summarize_desc') },
    { task: 'ask', icon: 'chat', title: t('ai.ask'), desc: t('ai.ask_desc') },
    { task: 'translate', icon: 'translate', title: t('ai.translate'), desc: t('ai.translate_desc') },
    { task: 'extract_receipt', icon: 'extract', title: t('ai.extract'), desc: t('ai.extract_desc') },
  ];

  return (
    <TScreen scroll header={<TNavigationBar large title={t('ai.title')} />}>
      {!allowAI ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.infoLight }}>
          <TIcon name="shield" size="md" color={colors.info} />
          <View style={{ flex: 1, gap: 2 }}>
            <TText variant="body" weight="600">
              {t('ai.off_title')}
            </TText>
            <TText variant="bodySmall" color="textSecondary">
              {t('ai.off_body')}
            </TText>
          </View>
        </View>
      ) : null}

      <TCellGroup title={t('ai.tools')}>
        {tools.map((tool) => (
          <TCell
            key={tool.task}
            icon={tool.icon}
            iconColor={colors.brand}
            title={tool.title}
            description={tool.desc}
            arrow
            onPress={() => {
              track('ai_clicked', { source: 'ai_tab', task: tool.task });
              if (!documents.length) return toast(t('documents.empty_hint'));
              setPicking(tool.task);
            }}
          />
        ))}
      </TCellGroup>

      <TCellGroup title={t('ai.recent')}>
        <TEmpty icon="ai" title={t('ai.recent_empty')} />
      </TCellGroup>

      <TActionSheet
        visible={picking !== null}
        title={t('ai.choose_document')}
        cancelLabel={t('common.cancel')}
        onClose={() => setPicking(null)}
        items={documents.slice(0, 8).map((d) => ({ key: d.id, label: d.title, icon: 'documents' as const }))}
        onSelect={(id) => {
          const task = picking;
          setPicking(null);
          if (task) router.push({ pathname: '/ai-consent', params: { id, task } });
        }}
      />
    </TScreen>
  );
}
