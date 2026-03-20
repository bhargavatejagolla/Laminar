import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import hi from "./hi.json";
import te from "./te.json";
import gu from "./gu.json";
import ta from "./ta.json";

const STORAGE_KEY = "laminar_language";

// Always default to 'en' during initialization to ensure SSR matches CSR
// Restoration will happen in I18nProvider after mounting
const INITIAL_LANG = "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    te: { translation: te },
    gu: { translation: gu },
    ta: { translation: ta },
  },
  lng: INITIAL_LANG,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export default i18n;
