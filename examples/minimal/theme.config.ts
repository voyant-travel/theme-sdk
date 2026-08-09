import { defineTheme, themeFixturesSchema } from "@voyant-travel/theme";
import fixtures from "../../fixtures/minimal.json";

const parsedFixtures = themeFixturesSchema.parse(fixtures);

export default defineTheme({
  contractVersion: "v1alpha5",
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
      { id: "tours", pattern: "/tours", context: "tourIndex" },
      {
        id: "tour-detail",
        pattern: "/tours/[slug]",
        context: "tourDetail",
      },
      { id: "cruises", pattern: "/cruises", context: "cruiseIndex" },
      {
        id: "cruise-detail",
        pattern: "/cruises/[slug]",
        context: "cruiseDetail",
      },
      {
        id: "ship-detail",
        pattern: "/ships/[slug]",
        context: "shipDetail",
      },
      {
        id: "sailing-detail",
        pattern: "/sailings/[slug]",
        context: "sailingDetail",
      },
      { id: "not-found", pattern: "/404", context: "notFound" },
    ],
    templates: [
      {
        id: "tour-feature",
        name: "Feature tour",
        context: "tourDetail",
      },
    ],
    capabilities: [
      { id: "catalog.search.v1" },
      { id: "catalog.product-detail.v1" },
      { id: "catalog.pricing.v1" },
      { id: "catalog.availability.v1" },
      { id: "catalog.requirements.v1" },
      { id: "catalog.markets.v1" },
      { id: "cruise.search.v1" },
      { id: "cruise.sailing.v1" },
      { id: "cruise.pricing.v1" },
      { id: "cruise.quote.v1" },
      { id: "shopping.search.v1" },
      { id: "shopping.trip-selections.v1" },
      { id: "shopping.trip-booking.v1" },
      { id: "booking.session.v1" },
      { id: "checkout.v1" },
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
        templates: ["home", "tour-feature"],
        settings: [{ id: "eyebrow", label: "Eyebrow", type: "text" }],
      },
    ],
  },
  fixtures: parsedFixtures,
});
