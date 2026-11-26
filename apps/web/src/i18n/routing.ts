import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["th", "en"],
  defaultLocale: "th",
  // next-intl's locale cookie is session-only by default. Keep an explicit
  // choice (Thai or English) for a year so it survives browser restarts;
  // visitors who never choose still get Thai from the middleware fallback.
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});
