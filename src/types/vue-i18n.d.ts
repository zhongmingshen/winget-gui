declare module "vue-i18n" {
  import type { App } from "vue";

  interface LocaleRef {
    value: string;
  }

  interface Composer {
    locale: LocaleRef;
    t: (key: string, values?: Record<string, unknown>) => string;
  }

  interface I18n {
    global: Composer;
    install: (app: App) => void;
  }

  export function createI18n(options: unknown): I18n;
  export function useI18n(): Composer;
}
