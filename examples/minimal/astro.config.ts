import { voyantTheme } from "@voyant-travel/astro";
import { defineConfig } from "astro/config";
import theme from "./theme.config";

export default defineConfig({
  output: "static",
  build: { format: "directory" },
  integrations: [voyantTheme({ theme })],
});
