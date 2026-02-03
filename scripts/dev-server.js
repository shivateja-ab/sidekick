import { createServer, request as httpRequest } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const ROOT_DIR = join(__dirname, '..');

const PORT = 3000;
const PUBLIC_DIR = join(ROOT_DIR, 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  let filePath = join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // If it's an API call, proxy to Vercel dev (port 3001)
  if (req.url.startsWith('/api/')) {
    const proxyReq = httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: 'localhost:3001' },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('API server not available. Make sure Vercel dev is running on port 3001');
    });
    
    req.pipe(proxyReq);
    return;
  }

  // Serve static files
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // Try index.html for directories
    if (req.url.endsWith('/')) {
      filePath = join(filePath, 'index.html');
    } else {
      filePath = join(PUBLIC_DIR, 'index.html');
    }
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (error) {
    res.writeHead(500);
    res.end('Server Error');
  }
});

server.listen(PORT, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use!`);
      console.error(`   Kill the process or use a different port`);
      console.error(`   Find process: netstat -ano | findstr :${PORT}`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  } else {
    console.log(`✅ Frontend server running at http://localhost:${PORT}`);
    console.log(`📡 API requests will proxy to http://localhost:3001 (Vercel dev)`);
    console.log(`\n⚠️  Make sure to run Vercel dev on port 3001:`);
    console.log(`   vercel dev --listen 3001 --yes`);
  }
});
