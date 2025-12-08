// electron.vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { resolve } from "path";
var __electron_vite_injected_dirname = "C:\\Projects\\ireport-admin";
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      rollupOptions: {
        external: ["better-sqlite3"]
      }
    }
  },
  preload: {
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/preload/index.ts")
        }
      }
    }
  },
  renderer: {
    root: "src/renderer",
    build: {
      outDir: "dist/renderer",
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html")
        }
      }
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
