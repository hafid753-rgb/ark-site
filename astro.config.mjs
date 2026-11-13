import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ark.example',
  build: { inlineStylesheets: 'always' },
  // Scripts stay as files so the Content-Security-Policy can be script-src 'self'.
  vite: { build: { assetsInlineLimit: 0 } },
});
