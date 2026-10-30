import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Staff admin tool. Talks only to Supabase with the signed-in staff user's session; the
// publishable key is the only key it ever sees (src/env.ts refuses anything else).
export default defineConfig({
  plugins: [react()],
  envPrefix: 'VITE_',
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});
