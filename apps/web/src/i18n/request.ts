import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale, requestLocale }) => {
  // next-intl v4 passes the [locale] segment via `requestLocale` (a Promise).
  // `locale` is only set for explicit getTranslations({locale}) calls.
  const resolved = (await requestLocale) ?? locale ?? routing.defaultLocale;
  return {
    locale: resolved,
    messages: (await import(`../messages/${resolved}.json`)).default,
  };
});
