import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';
  const isProduction = mode === 'production';
  
  return {
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
        },
        // Configure code splitting and chunk optimization (production only)
        output: isProduction ? {
          // Manual chunk splitting for better caching
          manualChunks: {
            // Vendor chunk for third-party libraries
            vendor: ['fast-check', 'papaparse', 'jspdf', 'xlsx'],
            // Core application logic
            core: [
              'src/models/index.ts',
              'src/repositories/index.ts',
              'src/services/index.ts'
            ],
            // UI components
            ui: [
              'src/ui/index.ts',
              'src/state/ApplicationState.ts'
            ]
          },
          // Optimize chunk file names for caching
          chunkFileNames: (chunkInfo) => {
            const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop()?.replace('.ts', '') : 'chunk';
            return `js/${facadeModuleId}-[hash].js`;
          },
          entryFileNames: 'js/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        } : {
          // Development: simpler output structure
          chunkFileNames: 'js/[name].js',
          entryFileNames: 'js/[name].js',
          assetFileNames: 'assets/[name].[ext]'
        },
        // Tree shaking configuration (production only)
        treeshake: isProduction ? {
          // Enable aggressive tree shaking
          moduleSideEffects: false,
          // Remove unused imports
          pureExternalModules: true,
          // Optimize property access
          propertyReadSideEffects: false
        } : false
      },
      // Generate source maps for debugging (always in development, optional in production)
      sourcemap: isDevelopment ? 'inline' : false,
      // Target modern browsers for better optimization
      target: ['es2020', 'chrome80', 'firefox78', 'safari14'],
      // Enhanced minification for production only
      minify: isProduction ? 'terser' : false,
      // Terser options for better compression
      terserOptions: isProduction ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log'],
          passes: 2
        },
        mangle: {
          toplevel: true
        },
        format: {
          comments: false
        }
      } : undefined,
      // Chunk size warnings
      chunkSizeWarningLimit: 500,
      // Optimize CSS
      cssCodeSplit: isProduction,
      // Report compressed size
      reportCompressedSize: isProduction,
      // Optimize assets
      assetsInlineLimit: isProduction ? 4096 : 0
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
    // Enable hot module replacement with detailed configuration
    hmr: {
      port: 24678,
      // Enable overlay for build errors
      overlay: true
    },
    // Open browser automatically
    open: false,
    // Configure CORS for development
    cors: true,
    // Configure proper MIME types and headers
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    // Configure middleware for proper MIME types
    middlewareMode: false,
    // Enable file watching with polling for better compatibility
    watch: {
      usePolling: true,
      interval: 100
    },
    // Configure proxy if needed for API calls
    proxy: {},
    // Enable strict port (fail if port is already in use)
    strictPort: false,
    // Configure file serving options
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..']
    }
  },
  
  // Preview server configuration (for production builds)
  preview: {
    port: 3000,
    host: true
  },
  
  // TypeScript and CSS configuration
  esbuild: {
    target: 'es2020',
    // Keep class names for debugging
    keepNames: isDevelopment,
    // Drop console and debugger statements in production
    drop: isProduction ? ['console', 'debugger'] : [],
    // Generate source maps for better debugging
    sourcemap: isDevelopment
  },
  
  // CSS configuration
  css: {
    // Enable CSS source maps in development
    devSourcemap: isDevelopment,
    // Configure CSS modules if needed
    modules: {
      localsConvention: 'camelCase'
    }
  },
  
  // Define environment variables
  define: {
    __DEV__: JSON.stringify(isDevelopment),
    __VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0')
  },
  
  // Logging configuration
  logLevel: isDevelopment ? 'info' : 'warn',
  clearScreen: false,
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['fast-check', 'papaparse', 'jspdf', 'xlsx'],
    // Force pre-bundling of these dependencies
    force: false,
    // Exclude certain dependencies from pre-bundling if needed
    exclude: [],
    // Configure esbuild options for dependency optimization
    esbuildOptions: {
      target: 'es2020'
    }
  }
  };
});