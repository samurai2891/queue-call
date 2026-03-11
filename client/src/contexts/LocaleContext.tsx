import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Locale, SUPPORTED_LOCALES, detectLocale, t as translate, TranslationKey, getLocalizedField } from '../../../shared/i18n/translations';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  getField: <T extends Record<string, any>>(item: T, fieldPrefix: string) => string;
  supportedLocales: Locale[];
}

const LocaleContext = createContext<LocaleContextType | null>(null);

const LOCALE_STORAGE_KEY = 'queue-call-locale';

export function LocaleProvider({ 
  children, 
  defaultLocale,
  supportedLocales = SUPPORTED_LOCALES 
}: { 
  children: ReactNode;
  defaultLocale?: Locale;
  supportedLocales?: Locale[];
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    // Check localStorage first
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
      if (stored && supportedLocales.includes(stored)) {
        return stored;
      }
    }
    // Then check browser language
    const detected = detectLocale();
    if (supportedLocales.includes(detected)) {
      return detected;
    }
    // Fallback to default or first supported
    return defaultLocale || supportedLocales[0] || 'ja';
  });

  const setLocale = useCallback((newLocale: Locale) => {
    if (supportedLocales.includes(newLocale)) {
      setLocaleState(newLocale);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
      }
    }
  }, [supportedLocales]);

  const t = useCallback((key: TranslationKey) => {
    return translate(locale, key);
  }, [locale]);

  const getField = useCallback(<T extends Record<string, any>>(item: T, fieldPrefix: string) => {
    return getLocalizedField(item, fieldPrefix, locale);
  }, [locale]);

  // Update document lang attribute
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, getField, supportedLocales }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}

// Re-export types and utilities
export { SUPPORTED_LOCALES, LOCALE_NAMES } from '../../../shared/i18n/translations';
export type { Locale, TranslationKey };
