const http = require('http');
const https = require('https');
const fs = require('fs');
const { URL } = require('url');
const { recordEvent, getSummary, ensureDir } = require('./storage');

ensureDir();

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const SHARED_SECRET = process.env.RW_SHARED_SECRET || null;
const MAX_BODY_SIZE = 256 * 1024; // 256 kB should be plenty
const TLS_CERT_PATH = process.env.RW_TLS_CERT || '';
const TLS_KEY_PATH = process.env.RW_TLS_KEY || '';
const TLS_CA_PATH = process.env.RW_TLS_CA || '';
const ENABLE_HTTP_REDIRECT = process.env.RW_ENABLE_HTTP_REDIRECT === 'true';
const HTTP_REDIRECT_PORT = process.env.RW_HTTP_REDIRECT_PORT || 8080;

function hasTlsConfig() {
  return Boolean(TLS_CERT_PATH && TLS_KEY_PATH);
}

function loadTlsConfig() {
  if (!hasTlsConfig()) return null;
  try {
    const options = {
      cert: fs.readFileSync(TLS_CERT_PATH),
      key: fs.readFileSync(TLS_KEY_PATH)
    };
    if (TLS_CA_PATH) {
      options.ca = fs.readFileSync(TLS_CA_PATH);
    }
    return options;
  } catch (err) {
    console.error('[analytics] Kunde inte läsa TLS-certifikat:', err.message);
    return null;
  }
}

function send(res, statusCode, body, extraHeaders) {
  const data = body != null ? JSON.stringify(body) : '';
  res.writeHead(statusCode, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }, extraHeaders || {}));
  res.end(data);
}

function isAuthorized(req) {
  if (!SHARED_SECRET) return true;
  const header = req.headers['authorization'];
  if (!header) return false;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return match[1] === SHARED_SECRET;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve(null);
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function validateEvent(payload) {
  if (!payload || typeof payload !== 'object') return 'Payload måste vara ett JSON-objekt';
  if (!payload.event) return 'Fältet "event" saknas';
  if (!payload.customerId) return 'Fältet "customerId" saknas';
  if (!payload.hostname) return 'Fältet "hostname" saknas';
  if (!payload.userId) return 'Fältet "userId" saknas';
  if (!payload.timestamp) payload.timestamp = new Date().toISOString();
  return null;
}

const requestListener = async (req, res) => {
  const protocol = req.socket && req.socket.encrypted ? 'https' : 'http';
  const url = new URL(req.url, `${protocol}://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  if (!isAuthorized(req)) {
    send(res, 401, { error: 'Unauthorized' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/events') {
    try {
      const body = await parseBody(req);
      const errMsg = validateEvent(body);
      if (errMsg) {
        send(res, 400, { error: errMsg });
        return;
      }
      recordEvent(body);
      send(res, 202, { status: 'accepted' });
    } catch (err) {
      send(res, err.message === 'Payload too large' ? 413 : 400, { error: err.message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/stats') {
    const summary = getSummary();
    send(res, 200, summary);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, { status: 'ok', uptime: process.uptime() });
    return;
  }

  send(res, 404, { error: 'Not found' });
};

function createServer() {
  const tlsOptions = loadTlsConfig();
  if (tlsOptions) {
    return https.createServer(tlsOptions, requestListener);
  }
  return http.createServer(requestListener);
}

const server = createServer();

function startHttpRedirectServer() {
  if (!hasTlsConfig() || !ENABLE_HTTP_REDIRECT) return;
  const redirectServer = http.createServer((req, res) => {
    const host = req.headers.host ? req.headers.host.split(':')[0] : 'localhost';
    const location = `https://${host}:${PORT}${req.url}`;
    res.writeHead(301, { Location: location });
    res.end();
  });
  redirectServer.listen(HTTP_REDIRECT_PORT, HOST, () => {
    console.log(`[analytics] HTTP redirect server på http://${HOST}:${HTTP_REDIRECT_PORT} → https://${HOST}:${PORT}`);
  });
}

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const protocol = hasTlsConfig() ? 'https' : 'http';
    console.log(`[analytics] listening on ${protocol}://${HOST}:${PORT}`);
    if (hasTlsConfig()) {
      console.log('[analytics] TLS aktiverat.');
    }
    if (SHARED_SECRET) {
      console.log('[analytics] shared secret protection ENABLED');
    }
  });
  startHttpRedirectServer();
}

module.exports = { server, createServer, requestListener };
