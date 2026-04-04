import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig(({ command }) => {
  const isElectron = process.env.ELECTRON !== 'false';

  return {
    plugins: [
      react(),
      ...(isElectron
        ? [
            electron([
              {
                entry: 'electron/main.ts',
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    lib: {
                      entry: 'electron/main.ts',
                      formats: ['cjs'],
                    },
                    rollupOptions: {
                      external: ['electron', 'discord-rpc', 'path', 'fs', 'url', 'https', 'http', 'crypto', 'zlib', 'util'],
                      output: {
                        entryFileNames: '[name].cjs',
                      },
                    },
                  },
                },
              },
              {
                entry: 'electron/preload.ts',
                onstart(args) {
                  args.reload();
                },
                vite: {
                  build: {
                    outDir: 'dist-electron',
                    lib: {
                      entry: 'electron/preload.ts',
                      formats: ['cjs'],
                    },
                    rollupOptions: {
                      external: ['electron'],
                      output: {
                        entryFileNames: '[name].cjs',
                      },
                    },
                  },
                },
              },
            ]),
            renderer(),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    base: './',
    build: {
      outDir: 'dist',
    },
    server: {
      port: 5173,
    },
  };
});
