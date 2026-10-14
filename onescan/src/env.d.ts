// Expo inlines EXPO_PUBLIC_* variables at build time.
declare const process: { env: { readonly [key: string]: string | undefined } };
