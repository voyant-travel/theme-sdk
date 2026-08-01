import { defineTheme, themeFixturesSchema } from "@voyant-travel/theme";
import fixtures from "../../fixtures/minimal.json";

const parsedFixtures = themeFixturesSchema.parse(fixtures);

export default defineTheme({
  contractVersion: "v1alpha1",
  manifest: {
    id: "minimal",
    name: "Minimal Voyant Theme",
    version: "0.1.0-alpha.0",
    description: "A fixture-backed reference theme.",
    routes: [
      { id: "home", pattern: "/", context: "home" },
      {
        id: "journal-entry",
        pattern: "/journal/[...path]",
        context: "content",
      },
      { id: "not-found", pattern: "/404", context: "notFound" },
    ],
    settings: [
      {
        id: "accent",
        label: "Accent colour",
        type: "select",
        default: "ocean",
        options: [
          { label: "Ocean", value: "ocean" },
          { label: "Sunset", value: "sunset" },
        ],
      },
    ],
    sections: [
      {
        id: "hero",
        name: "Hero",
        fields: [{ id: "eyebrow", label: "Eyebrow", type: "text" }],
      },
    ],
  },
  fixtures: parsedFixtures,
});
