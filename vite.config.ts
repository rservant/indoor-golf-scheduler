import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Set the root to public directory where index.html is located
  root: 'public',
  
  // Build configuration
  build: {
    // Output directory relative to root (public)
    outDir: '../dist',
    // Empty the output directory before building
    emptyOutDir: true,
    // Rollup options for advanced bundling
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html')
      }
    },
    // Generate source maps for debugging
    sourcemap: true,
    // Target modern browsers
    target: 'es2020',
    // Minify in production
    minify: 'esbuild'
  },
  
  // Module resolution
  resolve: {
    alias: {
      // Create alias for src directory
      '@': resolve(__dirname, 'src')
    }
  },
  
  // Development server configuration
  server: {
    port: 3000,
    host: true,
    // Enable hot module replacement
    hmr: true,
    // Open browser automatically
    open: false
  },
  
  // Preview server configuration (for production builds)
  preview: {
    port: 3000,
    host: true
  },
  
  // TypeScript configuration
  esbuild: {
    target: 'es2020'
  },
  
  // Define environment variables
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production')
  }
});