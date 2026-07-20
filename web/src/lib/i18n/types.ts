export type Locale = "en" | "zh";

export interface TranslationMessages {
  [key: string]: string | TranslationMessages;
}

export interface I18nConfig {
  defaultLocale: Locale;
  supportedLocales: Locale[];
  fallbackLocale: Locale;
}
