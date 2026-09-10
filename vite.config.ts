import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";

export default defineConfig({
  nitro: true,
  tanstackStart: {
    client: { entry: "client" },
    server: { entry: "server" },
  },
  plugins: [
    mcpPlugin(),
    sentryTanstackStart({
      org: "hasat-xc",
      // TODO(B-6): Sentry projesinin gerçek slug'ı teyit edilmedi (API/ekran görüntüsü
      // erişimi yoktu). "TanStack Start React" wizard-adının olası slug'ı ile dolduruldu —
      // Berkin Sentry dashboard'undan doğrulamalı.
      project: "tanstack-start-react",
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
