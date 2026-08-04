import { defineTheme, type ThemeDefinition } from "../src/index.js";

export function validTheme(): ThemeDefinition {
  return defineTheme({
    contractVersion: "v1alpha3",
    manifest: {
      id: "test-theme",
      name: "Test theme",
      version: "0.1.0-alpha.0",
      routes: [
        { id: "home", pattern: "/", context: "home" },
        { id: "entry", pattern: "/stories/[entry]", context: "content" },
        { id: "not-found", pattern: "/404", context: "notFound" },
      ],
      settings: [],
      sections: [],
    },
    fixtures: {
      home: {
        kind: "home",
        path: "/",
        locale: "en",
        site: { name: "Test" },
        navigation: [],
        menus: {},
        seo: { title: "Home" },
        settings: {},
        title: "Home",
        sections: [],
      },
      content: [
        {
          kind: "content",
          path: "/stories/one",
          slug: "one",
          locale: "en",
          site: { name: "Test" },
          navigation: [],
          menus: {},
          seo: { title: "One" },
          settings: {},
          title: "One",
          body: "Body",
        },
      ],
      notFound: {
        kind: "notFound",
        path: "/404",
        locale: "en",
        site: { name: "Test" },
        navigation: [],
        menus: {},
        seo: { title: "Missing", noIndex: true },
        settings: {},
        title: "Missing",
      },
    },
  });
}
