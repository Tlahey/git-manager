import { defineConfig } from 'vite';

// The landing page ships to GitHub Pages (project pages, served from a
// sub-path). Relative asset URLs keep it working regardless of the base path.
export default defineConfig({
  base: './',
  server: {
    port: 5199,
    strictPort: true,
  },
});
