import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Non-production Static Web App (API + Easy Auth linked backend). */
const NONPROD_SWA = "https://icy-water-0ce7d5b10.7.azurestaticapps.net";

export default defineConfig(({ mode }) => {
  // Vite is started from the frontend/ directory, so "." resolves env files correctly.
  const env = loadEnv(mode, ".", "");
  // Local Functions: set VITE_DEV_API_PROXY=http://127.0.0.1:7071
  const proxyTarget = (env.VITE_DEV_API_PROXY || NONPROD_SWA).replace(/\/$/, "");

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
        // Needed when signing in against nonprod Easy Auth from Vite.
        "/.auth": {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    test: { exclude: ["api/**", "node_modules/**", "dist/**"] },
  };
});
