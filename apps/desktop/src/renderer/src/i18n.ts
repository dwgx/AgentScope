import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  locales,
  resolveLocale,
  resources,
  type LanguageSetting,
  type Locale
} from "@agentscope/i18n";

export function resolveAppLocale(setting: LanguageSetting, systemLocale?: string): Locale {
  return setting === "system" ? resolveLocale(systemLocale ?? navigator.language) : setting;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLocale(typeof navigator === "undefined" ? undefined : navigator.language),
  fallbackLng: "en-US",
  supportedLngs: [...locales],
  returnNull: false,
  interpolation: {
    escapeValue: false
  },
  react: {
    useSuspense: false
  }
});

export { i18n };
