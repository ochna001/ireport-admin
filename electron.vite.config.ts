import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';

// Plugin to copy GeoJSON data files to dist
const copyGeoDataPlugin = () => ({
  name: 'copy-geo-data',
  closeBundle() {
    const srcPath = resolve(__dirname, 'src/main/data/camarinesNorteMunicipalities.json');
    const destDir = resolve(__dirname, 'dist/main/data');
    const destPath = resolve(destDir, 'camarinesNorteMunicipalities.json');
    
    if (existsSync(srcPath)) {
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      copyFileSync(srcPath, destPath);
      console.log('[Build] Copied GeoJSON data to dist/main/data/');
    }
  }
});

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        external: ['better-sqlite3']
      }
    },
    plugins: [copyGeoDataPlugin()]
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()]
  }
});
