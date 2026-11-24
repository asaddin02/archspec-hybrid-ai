import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          firebase: ['firebase/app', 'firebase/ai', 'firebase/app-check', 'firebase/auth', 'firebase/firestore', 'firebase/remote-config']
        }
      }
    }
  }
});
