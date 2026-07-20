"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Locale, TranslationMessages } from "./types";
import { en } from "./translations/en";
import { zh } from "./translations/zh";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  messages: TranslationMessages;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const MESSAGES: Record<Locale, TranslationMessages> = { en, zh };

export function getNestedValue(obj: TranslationMessages, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

export function I18nProvider({ children, defaultLocale = "en" }: { children: ReactNode; defaultLocale?: Locale }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value =
        getNestedValue(MESSAGES[locale], key) ?? getNestedValue(MESSAGES["en"], key) ?? key;
      if (!params) return value;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
        value,
      );
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, messages: MESSAGES[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
