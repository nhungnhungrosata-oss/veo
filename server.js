import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const distDir = path.join(__dirname, 'dist');
const port = process.env.PORT || 3000;

app.disable('x-powered-by');

app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html') || req.path === '/sw.js' || req.path === '/sw2.js' || req.path === '/pwa-register.js') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(distDir, {
  etag: true,
  setHeaders(res, filePath) {
    const base = path.basename(filePath);
    if (['sw.js', 'sw2.js', 'pwa-register.js'].includes(base) || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }
    if (/\.(js|css|woff2|png|jpg|jpeg|webp|svg)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
