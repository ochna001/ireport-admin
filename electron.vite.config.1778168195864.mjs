// electron.vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { resolve } from "path";
import { copyFileSync, existsSync, mkdirSync } from "fs";
var __electron_vite_injected_dirname = "C:\\Projects\\ireport-admin";
var copyGeoDataPlugin = () => ({
  name: "copy-geo-data",
  closeBundle() {
    const srcPath = resolve(__electron_vite_injected_dirname, "src/main/data/camarinesNorteMunicipalities.json");
    const destDir = resolve(__electron_vite_injected_dirname, "dist/main/data");
    const destPath = resolve(destDir, "camarinesNorteMunicipalities.json");
    if (existsSync(srcPath)) {
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      copyFileSync(srcPath, destPath);
      console.log("[Build] Copied GeoJSON data to dist/main/data/");
    }
  }
});
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      rollupOptions: {
        external: ["better-sqlite3"]
      }
    },
    plugins: [copyGeoDataPlugin()]
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
