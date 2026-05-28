import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
// import { componentTagger } from "lovable-tagger"; // Temporarily disabled due to ESM issues
// NOTE: vite-plugin-compression on Windows can emit broken paths (dist/C:/...) and break deploy tar.
// Production nginx gzips static responses (see nginx/production.conf).

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Explicitly define environment variables for production
  define: {
    'import.meta.env.PROD': mode === 'production' ? 'true' : 'false',
    'import.meta.env.DEV': mode === 'production' ? 'false' : 'true',
    'import.meta.env.MODE': JSON.stringify(mode),
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    hmr: {
      overlay: false,
    },
    // Removed 'Cache-Control': 'no-store' to allow browser caching of static assets
    // This prevents unnecessary reloading of logos and other static files on navigation
  },
  // Optimize dependencies pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
    ],
    exclude: ['lucide-react'], // Icons should be tree-shaken
  },
  plugins: [
    react(),
    // Visible in View Source: proves which HTML the browser got (debug stale CDN/browser cache).
    {
      name: "inject-crm-build-meta",
      transformIndexHtml(html) {
        const id = new Date().toISOString();
        return html.replace(
          `<meta charset="UTF-8" />`,
          `<meta charset="UTF-8" />\n    <meta name="crm-build-id" content="${id}" />`,
        );
      },
    },
    // mode === "development" && componentTagger(), // Temporarily disabled due to ESM issues
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // Production: strip console/debugger (replaces old terser pure_funcs drop_console).
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    // Single JS chunk in production avoids cross-chunk circular init / TDZ errors after minify.
    rollupOptions: {
      output: mode === "production" ? { inlineDynamicImports: true } : {},
    },
    // Default Rollup/Vite chunking only. Custom manualChunks caused circular chunks and
    // runtime "Cannot access 'X' before initialization" after minification (M, T, ...).
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 900,
    // Disable sourcemaps in production for smaller bundle
    sourcemap: false,
    minify: 'esbuild',
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Optimize assets
    assetsInlineLimit: 2048, // Inline only very small assets (2kb)
    // Target modern browsers for smaller output
    target: 'es2020',
  },
}));
