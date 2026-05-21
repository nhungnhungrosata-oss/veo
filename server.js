import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateViaProxy } from './api/generate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const distDir = path.join(__dirname, 'dist');
const port = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html') || req.path === '/sw.js' || req.path === '/sw2.js' || req.path === '/pwa-register.js') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});


app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});

app.post('/api/generate', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await generateViaProxy(req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[AI Proxy]', err);
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      ok: false,
      error: err?.message || 'AI proxy failed',
    });
  }
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
