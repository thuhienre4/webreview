const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, '.data');
const offersFile = path.join(dataDir, 'offers.json');
const storesFile = path.join(dataDir, 'stores.json');
const subscribersFile = path.join(dataDir, 'subscribers.json');
// Keep compatibility with the misspelled Railway variable that existed before
// the production backend was added. ADMIN_PASSWORD remains the canonical key.
const adminPassword = String(process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWRD || '');
const adminEmails = new Set(String(process.env.ADMIN_EMAILS || 'hn084933@gmail.com,ecorpenglishbtl@gmail.com')
  .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
const sessions = new Map();
const loginAttempts = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function ensureData() {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const [target, seed] of [[offersFile, 'offers.json'], [storesFile, 'stores.json']]) {
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(root, 'seed', seed), target);
  }
  if (!fs.existsSync(subscribersFile)) fs.writeFileSync(subscribersFile, '[]\n');
}

function readArray(file) {
  try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

function writeArray(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function send(res, status, body = '', type = 'text/plain; charset=utf-8', extra = {}) {
  const headers = {
    'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    ...extra,
  };
  res.writeHead(status, headers);
  res.end(body);
}

function json(res, status, value, extra = {}) {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store', ...extra });
}

async function body(req, limit = 2_000_000) {
  let value = '';
  for await (const chunk of req) {
    value += chunk;
    if (Buffer.byteLength(value) > limit) throw new Error('Request is too large.');
  }
  return value ? JSON.parse(value) : {};
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => part.trim().split('='))
    .filter(([key, value]) => key && value).map(([key, value]) => [key, decodeURIComponent(value)]));
}

function session(req) {
  const token = cookies(req).review_admin;
  const current = token && sessions.get(token);
  if (!current || current.expiresAt < Date.now()) { if (token) sessions.delete(token); return null; }
  current.expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  return current;
}

function requireAdmin(req, res) {
  const current = session(req);
  if (!current) json(res, 401, { error: 'Admin login required.' });
  return current;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function text(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function identifier(prefix) { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`; }
function safeUrl(value) {
  const parsed = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP/HTTPS links are allowed.');
  return parsed.toString();
}
function slug(value) { return text(value, 160).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function cleanOffer(payload, previous = {}) {
  const brand = text(payload.brand ?? previous.brand, 160);
  const title = text(payload.title ?? previous.title, 240);
  if (!brand || !title) throw new Error('Brand and title are required.');
  return {
    ...previous,
    id: previous.id || text(payload.id, 100) || identifier('offer'),
    storeId: text(payload.storeId ?? previous.storeId, 100), brand,
    domain: text(payload.domain ?? previous.domain, 180).replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    title, type: payload.type === 'deal' ? 'deal' : 'code',
    code: text(payload.code ?? previous.code, 120), discount: text(payload.discount ?? previous.discount, 100),
    link: safeUrl(payload.link ?? previous.link), category: text(payload.category ?? previous.category, 120) || 'Other',
    description: text(payload.description ?? payload.review ?? previous.description, 1200),
    expiry: text(payload.expiry ?? previous.expiry, 40), logo: text(payload.logo ?? previous.logo, 1000),
    visible: payload.visible !== false, featured: payload.featured === true,
    order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : Number(previous.order || 0),
    clicks: Number(previous.clicks || 0), reveals: Number(previous.reveals || 0),
    createdAt: previous.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function cleanStore(payload, previous = {}) {
  const name = text(payload.name ?? previous.name, 160);
  const domain = text(payload.domain ?? previous.domain, 180).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!name || !domain) throw new Error('Store name and domain are required.');
  return {
    ...previous, id: previous.id || text(payload.id, 100) || identifier('store'), name, domain,
    slug: slug(payload.slug ?? previous.slug ?? name), category: text(payload.category ?? previous.category, 120) || 'Other',
    description: text(payload.description ?? previous.description, 1200), logo: text(payload.logo ?? previous.logo, 1000),
    visible: payload.visible !== false, createdAt: previous.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function publicOffer(offer) {
  const { code, ...safe } = offer;
  return { ...safe, hasCode: Boolean(text(code)) };
}

function clientIp(req) { return text(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown', 100).split(',')[0]; }

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes('\0') || decoded.startsWith('/seed/') || /^\/(server\.js|package(?:-lock)?\.json|Procfile|\.env)/i.test(decoded)) return send(res, 404, 'Not found');
  const file = path.resolve(root, `.${decoded}`);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found');
  const content = fs.readFileSync(file);
  send(res, 200, req.method === 'HEAD' ? '' : content, mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream', {
    'Cache-Control': /\.(css|js|png|jpe?g|webp|svg)$/i.test(file) ? 'public, max-age=300' : 'no-cache',
  });
}

ensureData();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === 'GET' && url.pathname === '/healthz') {
      return json(res, 200, {
        ok: true,
        offers: readArray(offersFile).length,
        stores: readArray(storesFile).length,
        adminConfigured: Boolean(adminPassword),
        adminVariableNames: Object.keys(process.env).filter((name) => name.startsWith('ADMIN_')).sort(),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/login') {
      const ip = clientIp(req); const attempt = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
      if (Date.now() > attempt.resetAt) { attempt.count = 0; attempt.resetAt = Date.now() + 15 * 60 * 1000; }
      if (attempt.count >= 10) return json(res, 429, { error: 'Too many login attempts. Try again later.' });
      if (!adminPassword) return json(res, 503, { error: 'Set ADMIN_PASSWORD in Railway before using Admin.' });
      const payload = await body(req, 20_000); const email = text(payload.email, 254).toLowerCase();
      if (!adminEmails.has(email) || !safeEqual(payload.password, adminPassword)) {
        attempt.count += 1; loginAttempts.set(ip, attempt); return json(res, 401, { error: 'Invalid email or password.' });
      }
      loginAttempts.delete(ip); const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { email, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
      return json(res, 200, { ok: true, email }, { 'Set-Cookie': `review_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${production ? '; Secure' : ''}` });
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const token = cookies(req).review_admin; if (token) sessions.delete(token);
      return json(res, 200, { ok: true }, { 'Set-Cookie': `review_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production ? '; Secure' : ''}` });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/session') {
      const current = session(req); return json(res, current ? 200 : 401, current ? { authenticated: true, email: current.email } : { authenticated: false });
    }

    if (req.method === 'GET' && url.pathname === '/api/offers') {
      const offers = readArray(offersFile).filter((offer) => offer.visible !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      return json(res, 200, offers.map(publicOffer));
    }

    if (req.method === 'GET' && url.pathname === '/api/stores') {
      return json(res, 200, readArray(storesFile).filter((store) => store.visible !== false));
    }

    const codeMatch = url.pathname.match(/^\/api\/offers\/([^/]+)\/code$/);
    if (req.method === 'GET' && codeMatch) {
      const offers = readArray(offersFile); const offer = offers.find((item) => item.id === decodeURIComponent(codeMatch[1]) && item.visible !== false);
      if (!offer || !text(offer.code)) return json(res, 404, { error: 'Coupon code is unavailable.' });
      offer.reveals = Number(offer.reveals || 0) + 1; offer.updatedAt = new Date().toISOString(); writeArray(offersFile, offers);
      return json(res, 200, { code: offer.code, redirect: `/go/${encodeURIComponent(offer.id)}` });
    }

    const goMatch = url.pathname.match(/^\/go\/([^/]+)$/);
    if (req.method === 'GET' && goMatch) {
      const offers = readArray(offersFile); const offer = offers.find((item) => item.id === decodeURIComponent(goMatch[1]) && item.visible !== false);
      if (!offer) return send(res, 404, 'Offer not found');
      offer.clicks = Number(offer.clicks || 0) + 1; offer.updatedAt = new Date().toISOString(); writeArray(offersFile, offers);
      res.writeHead(302, { Location: safeUrl(offer.link), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); return res.end();
    }

    if (req.method === 'POST' && url.pathname === '/api/newsletter/subscribe') {
      const payload = await body(req, 20_000); const email = text(payload.email, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
      const subscribers = readArray(subscribersFile);
      if (!subscribers.some((item) => item.email === email)) subscribers.push({ id: identifier('sub'), email, status: 'active', createdAt: new Date().toISOString() });
      writeArray(subscribersFile, subscribers); return json(res, 201, { ok: true, message: 'Subscription saved.' });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/dashboard') {
      if (!requireAdmin(req, res)) return;
      const offers = readArray(offersFile); const stores = readArray(storesFile); const subscribers = readArray(subscribersFile);
      return json(res, 200, { offers: offers.length, codes: offers.filter((o) => o.type === 'code').length, deals: offers.filter((o) => o.type === 'deal').length, stores: stores.length, subscribers: subscribers.length, clicks: offers.reduce((n, o) => n + Number(o.clicks || 0), 0), reveals: offers.reduce((n, o) => n + Number(o.reveals || 0), 0) });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/offers') {
      if (!requireAdmin(req, res)) return; return json(res, 200, readArray(offersFile));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/offers') {
      if (!requireAdmin(req, res)) return; const offers = readArray(offersFile); const offer = cleanOffer(await body(req)); offers.unshift(offer); writeArray(offersFile, offers); return json(res, 201, offer);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/offers/batch') {
      if (!requireAdmin(req, res)) return; const payload = await body(req, 5_000_000); const items = Array.isArray(payload) ? payload : payload.items;
      if (!Array.isArray(items) || !items.length || items.length > 500) return json(res, 400, { error: 'Supply between 1 and 500 offers.' });
      const offers = readArray(offersFile); const created = items.map((item) => cleanOffer(item)); writeArray(offersFile, [...created, ...offers]); return json(res, 201, { created, total: created.length });
    }
    const adminOfferMatch = url.pathname.match(/^\/api\/admin\/offers\/([^/]+)$/);
    if (adminOfferMatch && ['PUT', 'DELETE'].includes(req.method)) {
      if (!requireAdmin(req, res)) return; const offers = readArray(offersFile); const index = offers.findIndex((item) => item.id === decodeURIComponent(adminOfferMatch[1]));
      if (index < 0) return json(res, 404, { error: 'Offer not found.' });
      if (req.method === 'DELETE') { const [deleted] = offers.splice(index, 1); writeArray(offersFile, offers); return json(res, 200, deleted); }
      offers[index] = cleanOffer(await body(req), offers[index]); writeArray(offersFile, offers); return json(res, 200, offers[index]);
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/stores') {
      if (!requireAdmin(req, res)) return; return json(res, 200, readArray(storesFile));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/stores') {
      if (!requireAdmin(req, res)) return; const stores = readArray(storesFile); const store = cleanStore(await body(req)); stores.push(store); writeArray(storesFile, stores); return json(res, 201, store);
    }
    const adminStoreMatch = url.pathname.match(/^\/api\/admin\/stores\/([^/]+)$/);
    if (adminStoreMatch && ['PUT', 'DELETE'].includes(req.method)) {
      if (!requireAdmin(req, res)) return; const stores = readArray(storesFile); const index = stores.findIndex((item) => item.id === decodeURIComponent(adminStoreMatch[1]));
      if (index < 0) return json(res, 404, { error: 'Store not found.' });
      if (req.method === 'DELETE') { const [deleted] = stores.splice(index, 1); writeArray(storesFile, stores); return json(res, 200, deleted); }
      stores[index] = cleanStore(await body(req), stores[index]); writeArray(storesFile, stores); return json(res, 200, stores[index]);
    }

    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url.pathname);
    return send(res, 405, 'Method not allowed');
  } catch (error) {
    console.error(error); return json(res, 400, { error: error.message || 'Bad request' });
  }
});

server.listen(port, host, () => {
  console.log(`Review Hubs running at http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
  console.log(`Admin: /admin | data: ${dataDir}`);
  if (!adminPassword) console.warn('ADMIN_PASSWORD is not configured; production admin login is disabled.');
});
