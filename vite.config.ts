import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { VitePWA } from "vite-plugin-pwa";


const plugins = [
  react(), 
  tailwindcss(), 
  jsxLocPlugin(), 
  vitePluginManusRuntime(),
  VitePWA({
    strategies: 'injectManifest',
    registerType: 'autoUpdate',
    srcDir: 'src',
    filename: 'sw.ts',
    includeAssets: ['icons/*.png', 'manifest.json'],
    manifest: false, // Use existing manifest.json in public folder
    injectManifest: {
      // Exclude API and SSE routes from precache
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
    },
    devOptions: {
      enabled: true, // Enable PWA in development for testing
      type: 'module',
    },
  }),
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
