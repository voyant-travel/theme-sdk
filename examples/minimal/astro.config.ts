import cloudflare from "@astrojs/cloudflare";
import { voyantTheme } from "@voyant-travel/astro";
import { defineConfig, sessionDrivers } from "astro/config";
import theme from "./theme.config";

export default defineConfig({
  adapter: cloudflare({ imageService: "passthrough" }),
  output: "server",
  session: { driver: sessionDrivers.lruCache() },
  build: { format: "directory" },
  integrations: [voyantTheme({ theme })],
});
