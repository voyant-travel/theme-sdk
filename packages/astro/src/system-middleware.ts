import {
  resolvePublicationSystemRoute,
  resolveThemeConsentProofRoute,
  resolveThemePublicApiRoute,
} from "virtual:voyant-theme";

/**
 * Serves platform-owned discovery documents before theme middleware can
 * redirect, short-circuit, or mutate their responses.
 */
export async function onRequest(
  context: { request: Request },
  next: () => Promise<Response>,
): Promise<Response> {
  const consentResponse = await resolveThemeConsentProofRoute(context.request);
  if (consentResponse) return consentResponse;
  const publicApiResponse = await resolveThemePublicApiRoute(context.request);
  if (publicApiResponse) return publicApiResponse;
  const systemResponse = await resolvePublicationSystemRoute(context.request);
  return systemResponse ?? next();
}
