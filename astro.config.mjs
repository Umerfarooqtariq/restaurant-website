import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

const site = process.env.SITE_URL || "http://localhost:4321";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "never",
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes("/admin"),
    }),
  ],
  build: {
    format: "file",
  },
});
