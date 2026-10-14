import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TDivider, TIcon, TNavigationBar, TScreen, TTag, TText, useTheme } from '@/design-system';
import { LegalDoc, LegalSection, legalDocument } from './legalContent';

/** Privacy Policy / Terms of Use, read inside the app (no browser, works offline). */
export function LegalScreen({ doc }: { doc: LegalDoc }) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const d = legalDocument(doc, i18n.language);
  const other: LegalDoc = doc === 'privacy' ? 'terms' : 'privacy';
  const card = { backgroundColor: colors.bgContainer, borderRadius: radius.lg, marginHorizontal: spacing.md } as const;

  return (
    <TScreen scroll header={<TNavigationBar title={d.title} onBack={() => router.back()} />} contentStyle={{ paddingBottom: spacing.huge }}>
      <View testID={`legal-${doc}`} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg, gap: spacing.sm }}>
        <View style={{ width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
          <TIcon name={doc === 'privacy' ? 'shield' : 'book'} size={26} color={colors.brand} />
        </View>
        <TText variant="headline" accessibilityRole="header">
          {d.title}
        </TText>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs }}>
          <TTag label={d.version} theme="brand" />
          <TText variant="bodySmall" color="textSecondary">
            {d.updated}
          </TText>
        </View>
        <TText variant="bodyLarge" color="textSecondary">
          {d.intro}
        </TText>
      </View>

      {d.highlights ? (
        <View style={[card, { paddingVertical: spacing.xs, marginBottom: spacing.lg }]}>
          <TText variant="bodySmall" color="textSecondary" weight="600" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, letterSpacing: 0.3 }}>
            {t('legal.highlights')}
          </TText>
          {d.highlights.map((h, i) => (
            <View key={h.title}>
              {i > 0 ? <TDivider inset={spacing.md + 36 + spacing.sm} /> : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' }}>
                  <TIcon name={h.icon} size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <TText variant="title">{h.title}</TText>
                  <TText variant="body" color="textSecondary">
                    {h.body}
                  </TText>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[card, { paddingHorizontal: spacing.md, paddingVertical: spacing.xs }]}>
        {d.sections.map((s, i) => (
          <View key={s.title}>
            {i > 0 ? <TDivider /> : null}
            <Section index={i + 1} section={s} />
          </View>
        ))}
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <TCellGroup>
          <TCell
            testID={`legal-open-${other}`}
            icon={other === 'privacy' ? 'shield' : 'book'}
            title={legalDocument(other, i18n.language).title}
            arrow
            onPress={() => router.replace(`/legal/${other}`)}
          />
        </TCellGroup>
      </View>
    </TScreen>
  );
}

function Section({ index, section }: { index: number; section: LegalSection }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ paddingVertical: spacing.md, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs }}>
        <TText variant="title" color="brand" style={{ minWidth: 22 }}>
          {index}.
        </TText>
        <TText variant="title" style={{ flex: 1 }} accessibilityRole="header">
          {section.title}
        </TText>
      </View>
      {section.paragraphs?.map((p) => (
        <TText key={p.slice(0, 32)} variant="body" style={{ lineHeight: 24 }}>
          {p}
        </TText>
      ))}
      {section.bullets ? (
        <View style={{ gap: spacing.xs }}>
          {section.bullets.map((b) => (
            <View key={b.slice(0, 32)} style={{ flexDirection: 'row', gap: spacing.xs, paddingEnd: spacing.xs }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand, marginTop: 10, marginStart: 4 }} />
              <TText variant="body" style={{ flex: 1, lineHeight: 24 }}>
                {b}
              </TText>
            </View>
          ))}
        </View>
      ) : null}
      {section.note ? (
        <TText variant="bodySmall" color="textSecondary">
          {section.note}
        </TText>
      ) : null}
    </View>
  );
}
