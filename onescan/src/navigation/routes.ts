import type { FeatureFlag } from '@/core/config/remoteConfig';

/**
 * Registry of every route in the product spec (§61). Routes not yet built in
 * this release point at `/unavailable` so deep links and menu items stay
 * stable while features roll out behind remote flags.
 */
export type RouteName =
  | 'Splash' | 'Onboarding' | 'Home' | 'Scanner' | 'ScannerPreview' | 'DocumentEditor' | 'MultiPageEditor'
  | 'Documents' | 'Folder' | 'DocumentViewer' | 'Search' | 'OCRResult' | 'SensitiveData' | 'Redaction'
  | 'AITools' | 'AIConsent' | 'AIChat' | 'AIResult' | 'Tools' | 'PDFTools' | 'ConvertTools'
  | 'Cloud' | 'CloudProviders' | 'CloudSettings' | 'Pricing' | 'Subscription' | 'AICredits'
  | 'Profile' | 'Account' | 'Privacy' | 'Security' | 'Devices' | 'Language' | 'Appearance'
  | 'Notifications' | 'Help' | 'About' | 'ScanQuality' | 'ScanDiagnostics';

export interface RouteDef {
  path: string;
  release: '1.0' | '1.1' | '1.2' | '1.3' | '1.4';
  flag?: FeatureFlag;
  built: boolean;
}

export const routes: Record<RouteName, RouteDef> = {
  Splash: { path: '/', release: '1.0', built: true },
  Onboarding: { path: '/onboarding', release: '1.0', built: true },
  Home: { path: '/', release: '1.0', built: true },
  Scanner: { path: '/scanner', release: '1.0', built: true },
  ScannerPreview: { path: '/editor', release: '1.0', built: true },
  DocumentEditor: { path: '/editor', release: '1.0', built: true },
  MultiPageEditor: { path: '/editor', release: '1.0', built: true },
  Documents: { path: '/documents', release: '1.0', built: true },
  Folder: { path: '/folder/[id]', release: '1.0', built: true },
  DocumentViewer: { path: '/document/[id]', release: '1.0', built: true },
  Search: { path: '/search', release: '1.0', built: true },
  OCRResult: { path: '/ocr/[id]', release: '1.0', flag: 'ocr', built: true },
  SensitiveData: { path: '/sensitive/[id]', release: '1.1', flag: 'sensitiveDetection', built: true },
  Redaction: { path: '/unavailable', release: '1.1', flag: 'redaction', built: false },
  AITools: { path: '/ai', release: '1.2', built: true },
  AIConsent: { path: '/ai-consent', release: '1.2', flag: 'ai', built: true },
  AIChat: { path: '/unavailable', release: '1.2', flag: 'ai', built: false },
  AIResult: { path: '/unavailable', release: '1.2', flag: 'ai', built: false },
  Tools: { path: '/tools', release: '1.0', built: true },
  PDFTools: { path: '/tools', release: '1.4', flag: 'advancedPdf', built: true },
  ConvertTools: { path: '/tools', release: '1.4', flag: 'convert', built: true },
  Cloud: { path: '/cloud', release: '1.3', built: true },
  CloudProviders: { path: '/cloud', release: '1.3', built: true },
  CloudSettings: { path: '/cloud', release: '1.3', built: true },
  Pricing: { path: '/pricing', release: '1.4', built: true },
  Subscription: { path: '/pricing', release: '1.4', built: true },
  AICredits: { path: '/unavailable', release: '1.2', flag: 'aiCredits', built: false },
  Profile: { path: '/profile', release: '1.0', built: true },
  Account: { path: '/unavailable', release: '1.2', built: false },
  Privacy: { path: '/privacy', release: '1.0', built: true },
  Security: { path: '/security', release: '1.1', built: true },
  Devices: { path: '/unavailable', release: '1.3', built: false },
  Language: { path: '/language', release: '1.0', built: true },
  Appearance: { path: '/appearance', release: '1.0', built: true },
  ScanQuality: { path: '/scan-quality', release: '1.0', built: true },
  ScanDiagnostics: { path: '/scan-diagnostics', release: '1.0', built: true },
  Notifications: { path: '/unavailable', release: '1.2', built: false },
  Help: { path: '/unavailable', release: '1.0', built: false },
  About: { path: '/about', release: '1.0', built: true },
};
