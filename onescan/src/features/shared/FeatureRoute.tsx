import React, { ComponentType } from 'react';
import { Redirect } from 'expo-router';
import { FeatureFlag, useFeature } from '@/core/config/remoteConfig';

/**
 * Route for a feature behind a flag. Every file in src/app is also a deep link
 * (onescan://…); while the feature is off (see PRODUCTION_OFF) the link goes Home
 * instead of showing an unfinished screen.
 */
export function featureRoute(flag: FeatureFlag, Screen: ComponentType) {
  return function FeatureRouteScreen() {
    const on = useFeature(flag);
    return on ? <Screen /> : <Redirect href="/" />;
  };
}
