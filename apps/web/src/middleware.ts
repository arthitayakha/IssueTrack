import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // Thai is the default. A visitor who has never picked a language has no
  // NEXT_LOCALE cookie; in that case we hide the browser's Accept-Language
  // header so next-intl falls back to `defaultLocale` ("th") instead of
  // redirecting every fresh visit to /en. Once a choice exists (the
  // LanguageSwitcher writes this cookie), the request passes through
  // untouched, so English stays English on later visits.
  if (!request.cookies.has("NEXT_LOCALE")) {
    const headers = new Headers(request.headers);
    headers.delete("accept-language");
    return intlMiddleware(new NextRequest(request, { headers }));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next|_vercel|favicon.ico|.*\\..*).*)"],
};
