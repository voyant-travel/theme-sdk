import {
  resolveThemeConsentConfiguration,
  resolveThemeContext,
} from "virtual:voyant-theme";
import { getThemeEditorContext } from "@voyant-travel/theme";

import { injectConsentBootstrap } from "./consent.js";
import { injectThemeEditorBridge } from "./editor-bridge.js";
import { injectThemeCode, isInjectableDocument } from "./injection.js";

/**
 * Splices operator code injection into every document the theme renders.
 *
 * This runs after the page because the rendered HTML is what gets spliced.
 *
 * Injection never fails a page. An operator's analytics tag is not worth a
 * blank Site, so a context that cannot be resolved here leaves the
 * response exactly as the theme rendered it — the page itself has already
 * succeeded or failed on its own resolution by this point.
 */
export async function onRequest(
  context: { request: Request },
  next: () => Promise<Response>,
): Promise<Response> {
  const response = await next();
  if (!isInjectableDocument(response)) return response;

  let pageContext: Awaited<ReturnType<typeof resolveThemeContext>>;
  try {
    pageContext = await resolveThemeContext(context.request.url);
  } catch {
    return response;
  }
  const [consent, editor] = await Promise.all([
    resolveThemeConsentConfiguration(context.request),
    Promise.resolve(getThemeEditorContext(pageContext)),
  ]);
  if (!pageContext.codeInjection && !editor && !consent) return response;

  const html = await response.text();
  const injected = injectThemeEditorBridge(
    injectConsentBootstrap(
      injectThemeCode(html, pageContext.codeInjection),
      consent,
    ),
    editor,
  );
  if (injected === html) return new Response(html, response);

  // Content-Length is now wrong, and a stale one truncates the document.
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(injected, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
