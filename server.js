#!/usr/bin/env node

/**
 * Simple HTTP server for the Indoor Golf Scheduler
 * Serves the built TypeScript application with proper MIME types
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    
    res.writeHead(200, { 
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname || '/';

  // Default to index.html for root requests
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Normalize the path and prevent directory traversal
  pathname = path.posix.normalize(pathname);
  if (!pathname.startsWith('/')) {
    pathname = '/' + pathname;
  }
  if (pathname.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Helper to resolve and enforce that the path stays within a base directory
  const publicBase = path.resolve(__dirname, 'public');
  const distBase = path.resolve(__dirname, 'dist');
  const srcBase = path.resolve(__dirname, 'src');

  // Try to serve from public directory first
  let filePath = path.resolve(publicBase, '.' + pathname);
  if (!filePath.startsWith(publicBase + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Check if file exists in public directory
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (!err) {
      serveFile(filePath, res);
      return;
    }

    // Try to serve from dist directory for built files
    filePath = path.resolve(distBase, '.' + pathname);
    if (!filePath.startsWith(distBase + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (!err) {
        serveFile(filePath, res);
        return;
      }

      // Try to serve from src directory for development
      filePath = path.resolve(srcBase, '.' + pathname);
      if (!filePath.startsWith(srcBase + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (!err) {
          serveFile(filePath, res);
          return;
        }

        // File not found
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found: ' + pathname);
      });
    });
  });
});

server.listen(PORT, () => {
  console.log(`🏌️ Indoor Golf Scheduler server running at http://localhost:${PORT}`);
  console.log('');
  console.log('📁 Serving TypeScript application from:');
  console.log('   - public/ (static files and HTML entry point)');
  console.log('   - dist/ (compiled TypeScript application)');
  console.log('');
  console.log('🚀 Open http://localhost:' + PORT + ' in your browser');
  console.log('');
  console.log('Press Ctrl+C to stop the server');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});