import * as Sentry from "@sentry/tanstackstart-react";

Sentry.init({
  dsn:
    import.meta.env.VITE_SENTRY_DSN ??
    "https://655cfee3b27b38e98bed27e8e2cf660d@o4512061608558592.ingest.de.sentry.io/4512061624942672",
  dataCollection: {
    httpBodies: [], // minimum veri toplama kararı — istek gövdelerini raporlama
  },
});
