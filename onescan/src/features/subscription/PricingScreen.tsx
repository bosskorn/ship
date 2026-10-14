import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TCell, TCellGroup, TEmpty, TNavigationBar, TScreen, TTag } from '@/design-system';
import { Plan, PlanPrice, useRemoteConfig } from '@/core/config/remoteConfig';
import { intlLocale } from '@/core/i18n/format';

function formatPrice(p: PlanPrice, language: string) {
  return new Intl.NumberFormat(intlLocale(language), { style: 'currency', currency: p.currency, maximumFractionDigits: 0 }).format(p.amountMinor / 100);
}

/** Plans and prices come exclusively from backend config (spec §31, §66.9). */
export function PricingScreen() {
  const { t, i18n } = useTranslation();
  const plans = useRemoteConfig((s) => s.config.plans);
  const load = useRemoteConfig((s) => s.load);
  const name = (p: Plan) => p.name[i18n.language] ?? p.name.en ?? p.id;

  return (
    <TScreen scroll header={<TNavigationBar title={t('pricing.title')} onBack={() => router.back()} />}>
      {plans.length === 0 ? (
        <View>
          <TEmpty icon="plan" title={t('pricing.unavailable')} actionLabel={t('common.retry')} onAction={() => void load()} />
        </View>
      ) : (
        plans.map((plan) => (
          <TCellGroup key={plan.id} title={name(plan)}>
            {plan.tier === 'free' ? <TCell title={t('pricing.current')} right={<TTag theme="brand" label={t('profile.plan_free')} />} /> : null}
            {plan.prices.map((price) => (
              <TCell
                key={price.storeProductId}
                title={t(price.period === 'month' ? 'pricing.per_month' : 'pricing.per_year', { price: formatPrice(price, i18n.language) })}
                right={<TButton label={t('common.continue')} size="small" variant="secondary" onPress={() => router.push('/unavailable')} />}
              />
            ))}
            {plan.features.map((f) => (
              <TCell key={f} icon="check" title={f} />
            ))}
          </TCellGroup>
        ))
      )}
    </TScreen>
  );
}
