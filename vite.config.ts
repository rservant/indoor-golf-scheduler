import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Set the root to project root
  root: '.',
  
  // Build configuration
  build: {
    // Output directory
    outDir: 'dist',
    // Empty the output directory before building
    emptyOutDir: true,
    // Rollup options for advanced bundling
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
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
      // Create comprehensive aliases for clean imports
      '@': resolve(__dirname, 'src'),
      '@/models': resolve(__dirname, 'src/models'),
      '@/services': resolve(__dirname, 'src/services'),
      '@/repositories': resolve(__dirname, 'src/repositories'),
      '@/ui': resolve(__dirname, 'src/ui'),
      '@/state': resolve(__dirname, 'src/state'),
      '@/utils': resolve(__dirname, 'src/utils'),
      '@/routing': resolve(__dirname, 'src/routing')
    },
    // Ensure proper extension resolution
    extensions: ['.ts', '.js', '.json']
  },
  
  // Development server configuration
  server: {
    port: 3000,
    host: true,
    // Enable hot module replacement
    hmr: true,
    // Open browser automatically
    open: false,
    // Configure CORS for development
    cors: true
  },
  
  // Preview server configuration (for production builds)
  preview: {
    port: 3000,
    host: true
  },
  
  // TypeScript configuration
  esbuild: {
    target: 'es2020',
    // Keep class names for debugging
    keepNames: true
  },
  
  // Define environment variables
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production')
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['fast-check', 'papaparse', 'jspdf', 'xlsx'],
    // Force pre-bundling of these dependencies
    force: false
  }
});