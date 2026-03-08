import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const basePath = process.env.VITE_BASE_PATH || "/";
  const normalizedBasePath = basePath.endsWith("/") ? basePath : `${basePath}/`;

  return {
    base: basePath,
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        injectRegister: false,
        registerType: "autoUpdate",
        manifest: {
          name: "Bleup",
          short_name: "Bleup",
          description: "Bleup helps you discover, unlock, and follow creator-driven blueprint content.",
          display: "standalone",
          start_url: normalizedBasePath,
          scope: normalizedBasePath,
          theme_color: "#faf8f5",
          background_color: "#faf8f5",
          icons: [
            {
              src: "pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "pwa-maskable-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
          globIgnores: ["**/index.html", "**/release.json", "**/branding/**"],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
