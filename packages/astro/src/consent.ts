export const THEME_CONSENT_PATH = "/_voyant/consent" as const;
export const THEME_CONSENT_CONFIG_PATH =
  "/internal/theme-consent/config" as const;
export const THEME_CONSENT_PROOF_PATH =
  "/internal/theme-consent/proofs" as const;

export type ConsentCategory =
  | "necessary"
  | "functional"
  | "analytics"
  | "marketing";

export type ThemeConsentConfiguration = {
  schemaVersion: 1;
  surface: "theme";
  hostname: string;
  regime: "strict_opt_in";
  provider:
    | { mode: "disabled" }
    | { mode: "external_gtm"; gtmContainerId: string }
    | { mode: "voyant_managed"; gtmContainerId?: string };
  profile: null | {
    id: string;
    organizationId: string;
    policyRevision: string;
    presentationRevision: string;
    lifetimeDays: number;
    defaultLocale: string;
    content: Record<
      string,
      {
        title: string;
        description: string;
        acceptAllLabel: string;
        rejectAllLabel: string;
        customizeLabel: string;
        saveLabel: string;
        preferencesLabel: string;
        categories: Record<
          ConsentCategory,
          { label: string; description: string }
        >;
        legalLinks: Array<{ label: string; url: string }>;
      }
    >;
    appearance: {
      accentColor: string;
      backgroundColor: string;
      textColor: string;
      mutedTextColor: string;
      borderColor: string;
      buttonRadiusPx: number;
      position: "bottom" | "bottom_left" | "bottom_right";
      customCss: string;
    };
  };
  presentationOverrides: null | {
    appearance?: Partial<
      NonNullable<ThemeConsentConfiguration["profile"]>["appearance"]
    >;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseThemeConsentConfiguration(
  value: unknown,
  hostname: string,
): ThemeConsentConfiguration | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.surface !== "theme"
  )
    return null;
  if (value.hostname !== hostname || value.regime !== "strict_opt_in")
    return null;
  if (!isRecord(value.provider) || typeof value.provider.mode !== "string")
    return null;
  if (
    value.provider.mode !== "disabled" &&
    value.provider.mode !== "external_gtm" &&
    value.provider.mode !== "voyant_managed"
  )
    return null;
  if (
    value.provider.mode !== "disabled" &&
    value.provider.gtmContainerId !== undefined &&
    (typeof value.provider.gtmContainerId !== "string" ||
      !/^GTM-[A-Z0-9]+$/.test(value.provider.gtmContainerId))
  )
    return null;
  if (
    value.provider.mode === "external_gtm" &&
    typeof value.provider.gtmContainerId !== "string"
  )
    return null;
  if (value.provider.mode === "voyant_managed") {
    if (!isRecord(value.profile)) return null;
    const profile = value.profile;
    if (
      typeof profile.id !== "string" ||
      typeof profile.organizationId !== "string" ||
      typeof profile.policyRevision !== "string" ||
      typeof profile.presentationRevision !== "string" ||
      typeof profile.lifetimeDays !== "number" ||
      typeof profile.defaultLocale !== "string" ||
      !isRecord(profile.content) ||
      !isRecord(profile.appearance)
    )
      return null;
  } else if (value.profile !== null) return null;
  return value as ThemeConsentConfiguration;
}

/**
 * Runs entirely inside the visitor's document. Keep this self-contained: the
 * function is serialized into an early inline script by renderConsentBootstrap.
 */
function managedConsentBootstrap(configuration: ThemeConsentConfiguration) {
  const cookieName = "voyant_consent_v1";
  const categories = [
    "necessary",
    "functional",
    "analytics",
    "marketing",
  ] as const;
  type Preferences = Record<(typeof categories)[number], boolean>;
  type State = {
    schemaVersion: 1;
    consentId: string;
    policyRevision: string;
    regime: "strict_opt_in";
    preferences: Preferences;
    decisionBases: Record<keyof Preferences, string>;
    signals: { globalPrivacyControl: boolean };
    finalized: boolean;
    mechanism: "initial" | "banner" | "preferences" | "gpc" | "migration";
    updatedAt: string;
    expiresAt: string;
  };
  const w = window as Window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __voyantConsentRuntime?: { showPreferences(): void };
  };
  const globalPrivacyControl = (
    navigator as Navigator & { readonly globalPrivacyControl?: boolean }
  ).globalPrivacyControl;
  const signal = (value: boolean) => (value ? "granted" : "denied");
  const googleSignals = (state: State | null) => ({
    functionality_storage: signal(Boolean(state?.preferences.functional)),
    personalization_storage: signal(Boolean(state?.preferences.functional)),
    analytics_storage: signal(Boolean(state?.preferences.analytics)),
    ad_storage: signal(Boolean(state?.preferences.marketing)),
    ad_user_data: signal(Boolean(state?.preferences.marketing)),
    ad_personalization: signal(Boolean(state?.preferences.marketing)),
    security_storage: "granted",
  });
  const announce = (phase: "default" | "update", state: State | null) => {
    w.dataLayer = w.dataLayer ?? [];
    w.gtag =
      w.gtag ??
      ((...args: unknown[]) => {
        w.dataLayer?.push(args);
      });
    w.gtag("consent", phase, googleSignals(state));
  };
  const announceVoyant = (
    event: "voyant_consent_ready" | "voyant_consent_update",
    state: State | null,
  ) => {
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({
      event,
      voyantConsent: {
        consentId: state?.consentId ?? null,
        policyRevision: state?.policyRevision ?? null,
        finalized: state?.finalized === true,
        necessary: "granted",
        functional: state?.preferences.functional ? "granted" : "denied",
        analytics: state?.preferences.analytics ? "granted" : "denied",
        marketing: state?.preferences.marketing ? "granted" : "denied",
      },
    });
  };
  const readCookie = (): State | null => {
    const prefix = `${cookieName}=`;
    const encoded = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
    if (!encoded) return null;
    try {
      const state = JSON.parse(decodeURIComponent(encoded)) as State;
      if (
        state.schemaVersion !== 1 ||
        state.policyRevision !== configuration.profile?.policyRevision ||
        typeof state.signals?.globalPrivacyControl !== "boolean" ||
        Date.parse(state.expiresAt) <= Date.now()
      )
        return null;
      return state;
    } catch {
      return null;
    }
  };
  const loadGtm = () => {
    const id =
      configuration.provider.mode === "disabled"
        ? undefined
        : configuration.provider.gtmContainerId;
    if (!id || document.getElementById(`voyant-gtm-${id}`)) return;
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const script = document.createElement("script");
    script.id = `voyant-gtm-${id}`;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
  };
  if (configuration.provider.mode === "disabled") return;
  let state =
    configuration.provider.mode === "voyant_managed" ? readCookie() : null;
  if (configuration.provider.mode === "external_gtm") {
    announce("default", null);
    announceVoyant("voyant_consent_ready", null);
    loadGtm();
    return;
  }
  const profile = configuration.profile;
  if (!profile) return;
  if (!state) {
    const created = new Date();
    const expires = new Date(
      created.getTime() + profile.lifetimeDays * 86_400_000,
    );
    state = {
      schemaVersion: 1,
      consentId: crypto.randomUUID(),
      policyRevision: profile.policyRevision,
      regime: "strict_opt_in",
      preferences: {
        necessary: true,
        functional: false,
        analytics: false,
        marketing: false,
      },
      decisionBases: {
        necessary: "essential",
        functional: "default",
        analytics: "default",
        marketing: "default",
      },
      signals: { globalPrivacyControl: false },
      finalized: false,
      mechanism: "initial",
      updatedAt: created.toISOString(),
      expiresAt: expires.toISOString(),
    };
  }
  if (globalPrivacyControl === true) {
    state.preferences.marketing = false;
    state.decisionBases.marketing = "gpc";
    state.signals.globalPrivacyControl = true;
    state.mechanism = "gpc";
    state.updatedAt = new Date().toISOString();
  }
  announce("default", state);
  announceVoyant("voyant_consent_ready", state);
  // GTM loads only after strict defaults are queued. Individual tags remain
  // blocked by their GTM consent requirements until Voyant grants a category.
  loadGtm();

  let banner: HTMLElement | null = null;
  let launcher: HTMLButtonElement | null = null;
  const content =
    profile.content[document.documentElement.lang] ??
    profile.content[profile.defaultLocale];
  if (!content) return;
  const appearance = {
    ...profile.appearance,
    ...configuration.presentationOverrides?.appearance,
  };
  const persist = (
    preferences: Preferences,
    mechanism: "banner" | "preferences",
  ) => {
    if (!state) return;
    const now = new Date();
    state = {
      ...state,
      preferences,
      decisionBases: {
        necessary: "essential",
        functional: "consent",
        analytics: "consent",
        marketing: state.signals.globalPrivacyControl ? "gpc" : "consent",
      },
      signals: {
        globalPrivacyControl: state.signals.globalPrivacyControl,
      },
      finalized: true,
      mechanism,
      updatedAt: now.toISOString(),
    };
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store is not available on every managed surface browser.
    document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=${Math.max(0, Math.floor((Date.parse(state.expiresAt) - now.getTime()) / 1000))}; SameSite=Lax; Secure`;
    announce("update", state);
    announceVoyant("voyant_consent_update", state);
    try {
      void fetch("/_voyant/consent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-voyant-consent": "1",
        },
        body: JSON.stringify({ schemaVersion: 1, state }),
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Proof transport must never prevent the local decision.
    }
    banner?.remove();
    banner = null;
    renderLauncher();
  };
  const renderLauncher = () => {
    launcher?.remove();
    launcher = document.createElement("button");
    launcher.type = "button";
    launcher.textContent = content.preferencesLabel;
    launcher.dataset.voyantConsentPreferences = "";
    launcher.setAttribute(
      "style",
      `position:fixed;z-index:2147483646;left:12px;bottom:12px;border:1px solid ${appearance.borderColor};border-radius:${appearance.buttonRadiusPx}px;padding:7px 10px;background:${appearance.backgroundColor};color:${appearance.textColor};font:12px/1.2 system-ui,sans-serif;cursor:pointer`,
    );
    launcher.addEventListener("click", () => renderBanner(true));
    document.body.appendChild(launcher);
  };
  const renderBanner = (preferencesOnly = false) => {
    if (!state) return;
    banner?.remove();
    launcher?.remove();
    launcher = null;
    const host = document.createElement("div");
    host.dataset.voyantConsent = "";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `:host{--vc-accent:${appearance.accentColor};--vc-bg:${appearance.backgroundColor};--vc-text:${appearance.textColor};--vc-muted:${appearance.mutedTextColor};--vc-border:${appearance.borderColor};--vc-radius:${appearance.buttonRadiusPx}px;position:fixed;z-index:2147483647;left:${appearance.position === "bottom_right" ? "auto" : "16px"};right:${appearance.position === "bottom_left" ? "auto" : "16px"};bottom:16px;color:var(--vc-text);font:14px/1.45 system-ui,sans-serif}*{box-sizing:border-box}.panel{max-width:680px;margin:auto;background:var(--vc-bg);border:1px solid var(--vc-border);border-radius:calc(var(--vc-radius) + 4px);box-shadow:0 18px 60px #0003;padding:20px}.title{font-size:18px;font-weight:700;margin:0 0 8px}.description{color:var(--vc-muted);margin:0 0 16px}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}button{border:1px solid var(--vc-border);border-radius:var(--vc-radius);padding:9px 14px;background:var(--vc-bg);color:var(--vc-text);cursor:pointer}button.primary{background:var(--vc-accent);border-color:var(--vc-accent);color:#fff}.categories{display:grid;gap:10px;margin-top:14px}.category{display:grid;grid-template-columns:auto 1fr;gap:10px}.category p{margin:2px 0;color:var(--vc-muted);font-size:12px}.links{display:flex;gap:12px;margin-top:12px}.links a{color:var(--vc-accent)}${appearance.customCss}`;
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "voyant-consent-title");
    const title = document.createElement("h2");
    title.id = "voyant-consent-title";
    title.className = "title";
    title.textContent = content.title;
    const description = document.createElement("p");
    description.className = "description";
    description.textContent = content.description;
    panel.append(title, description);
    const selected = { ...state.preferences };
    if (preferencesOnly) {
      const list = document.createElement("div");
      list.className = "categories";
      for (const category of categories) {
        const row = document.createElement("label");
        row.className = "category";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected[category];
        checkbox.disabled = category === "necessary";
        checkbox.addEventListener("change", () => {
          if (category !== "necessary") selected[category] = checkbox.checked;
        });
        const copy = document.createElement("span");
        const label = document.createElement("strong");
        label.textContent = content.categories[category].label;
        const detail = document.createElement("p");
        detail.textContent = content.categories[category].description;
        copy.append(label, detail);
        row.append(checkbox, copy);
        list.appendChild(row);
      }
      panel.appendChild(list);
    }
    const links = document.createElement("div");
    links.className = "links";
    for (const item of content.legalLinks) {
      const link = document.createElement("a");
      link.href = item.url;
      link.textContent = item.label;
      links.appendChild(link);
    }
    if (content.legalLinks.length) panel.appendChild(links);
    const actions = document.createElement("div");
    actions.className = "actions";
    const button = (label: string, primary: boolean, action: () => void) => {
      const element = document.createElement("button");
      element.type = "button";
      element.textContent = label;
      if (primary) element.className = "primary";
      element.addEventListener("click", action);
      return element;
    };
    if (preferencesOnly) {
      actions.appendChild(
        button(content.saveLabel, true, () => persist(selected, "preferences")),
      );
    } else {
      actions.append(
        button(content.acceptAllLabel, true, () =>
          persist(
            {
              necessary: true,
              functional: true,
              analytics: true,
              marketing: globalPrivacyControl !== true,
            },
            "banner",
          ),
        ),
        button(content.rejectAllLabel, false, () =>
          persist(
            {
              necessary: true,
              functional: false,
              analytics: false,
              marketing: false,
            },
            "banner",
          ),
        ),
        button(content.customizeLabel, false, () => renderBanner(true)),
      );
    }
    panel.appendChild(actions);
    root.append(style, panel);
    document.body.appendChild(host);
    banner = host;
  };
  const start = () => {
    if (state?.finalized) renderLauncher();
    else renderBanner();
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  w.__voyantConsentRuntime = { showPreferences: () => renderBanner(true) };
}

export function renderConsentBootstrap(
  configuration: ThemeConsentConfiguration,
): string {
  const serialized = JSON.stringify(configuration).replaceAll("<", "\\u003c");
  return `<script data-voyant-consent-bootstrap>(${managedConsentBootstrap.toString()})(${serialized});</script>`;
}

export function injectConsentBootstrap(
  html: string,
  configuration: ThemeConsentConfiguration | null,
): string {
  if (!configuration || configuration.provider.mode === "disabled") return html;
  const match = /<head\b[^>]*>/i.exec(html);
  if (!match) return html;
  const at = match.index + match[0].length;
  return `${html.slice(0, at)}${renderConsentBootstrap(configuration)}${html.slice(at)}`;
}
