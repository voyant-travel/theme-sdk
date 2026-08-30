import type { ThemeBuildRuntime } from "@voyant-travel/theme/tooling";
import {
  PLATFORM_API_URL_BINDING,
  PUBLICATION_BINDING_NAMES,
} from "./runtime.js";

export const CLOUDFLARE_THEME_RUNTIME = {
  schemaVersion: "voyant.theme.runtime.v1",
  platform: "cloudflare-workers",
  entrypoint: "server/entry.mjs",
  assetsDirectory: "client",
  assetsBinding: "ASSETS",
  compatibilityFlags: ["nodejs_compat"],
  requiredBindings: [...PUBLICATION_BINDING_NAMES, PLATFORM_API_URL_BINDING],
} as const satisfies ThemeBuildRuntime;
