const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

const root = __dirname;
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, '.data');
const offersFile = path.join(dataDir, 'offers.json');
const storesFile = path.join(dataDir, 'stores.json');
const subscribersFile = path.join(dataDir, 'subscribers.json');
const postsFile = path.join(dataDir, 'posts.json');
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
  for (const [target, seed] of [[offersFile, 'offers.json'], [storesFile, 'stores.json'], [postsFile, 'posts.json']]) {
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
  let raw = String(value || '').trim();
  if (/^[\w.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(raw)) raw = `https://${raw}`;
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP/HTTPS links are allowed.');
  return parsed.toString();
}
function safeImageUrl(value) {
  const image = text(value, 1500);
  if (!image) return '';
  if (image.startsWith('/') && !image.startsWith('//')) return image;
  return safeUrl(image);
}
function slug(value) { return text(value, 160).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function hostname(value) {
  try { return new URL(safeUrl(value)).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function normalizedFieldKey(value) {
  return String(value).trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[\s-]+/g, '_');
}

function destinationHostname(value) {
  try {
    const current = new URL(safeUrl(value));
    for (const key of ['url', 'u', 'target', 'redirect', 'redirect_url', 'destination', 'destination_url', 'merchant_url', 'landing_page']) {
      const candidate = current.searchParams.get(key);
      if (!candidate) continue;
      try { const target = new URL(safeUrl(decodeURIComponent(candidate))); return target.hostname.replace(/^www\./, ''); } catch { /* use affiliate hostname */ }
    }
    return current.hostname.replace(/^www\./, '');
  } catch { return ''; }
}

function logoForDomain(domain) {
  const clean = hostname(domain) || text(domain, 180).replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  return clean ? `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(clean)}` : '';
}

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

function firstValue(source, keys, fallback = '') {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== '') return source[key];
  }
  return fallback;
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return !['0', 'false', 'no', 'off', 'hidden', 'inactive'].includes(String(value).trim().toLowerCase());
}

function normalizeBatchOffer(source = {}) {
  const item = Object.fromEntries(Object.entries(source).map(([key, value]) => [normalizedFieldKey(key), value]));
  const rawType = String(firstValue(item, ['type', 'offer_type', 'kind'])).toLowerCase();
  const code = firstValue(item, ['code', 'coupon_code', 'promo_code', 'voucher_code']);
  return {
    brand: firstValue(item, ['brand', 'brand_name', 'store', 'store_name', 'merchant', 'merchant_name', 'label', 'shop']),
    domain: firstValue(item, ['domain', 'store_domain', 'merchant_domain', 'brand_domain', 'website', 'website_url', 'store_url']),
    title: firstValue(item, ['title', 'name', 'offer_title', 'coupon_title', 'deal_title']),
    type: ['deal', 'promotion', 'sale'].includes(rawType) ? 'deal' : ['code', 'coupon', 'voucher'].includes(rawType) ? 'code' : code ? 'code' : 'deal',
    code,
    discount: firstValue(item, ['discount', 'offer', 'discount_value', 'saving']),
    link: firstValue(item, ['link', 'url', 'affiliate_link', 'affiliate_url', 'affiliate', 'tracking_link', 'tracking_url', 'destination_url']),
    category: firstValue(item, ['category', 'industry'], 'Other'),
    description: firstValue(item, ['description', 'review', 'details', 'terms']),
    expiry: firstValue(item, ['expiry', 'expires', 'expiration', 'expiration_date', 'end_date']),
    logo: firstValue(item, ['logo', 'logo_url', 'brand_logo', 'brand_logo_url', 'merchant_logo', 'store_logo', 'image', 'image_url']),
    order: Number(firstValue(item, ['order', 'sort_order', 'priority'], 0)) || 0,
    visible: booleanValue(firstValue(item, ['visible', 'active', 'published', 'status'], true), true),
    featured: booleanValue(firstValue(item, ['featured', 'is_featured'], false), false),
  };
}

function offerFingerprint(offer) {
  return [offer.brand, offer.code || offer.title, offer.link].map((value) => String(value || '').trim().toLowerCase()).join('|');
}

function prepareBatchOffers(items, currentOffers = [], currentStores = []) {
  const existing = new Set(currentOffers.map(offerFingerprint));
  const accepted = new Set();
  const ready = [];
  const errors = [];
  const duplicates = [];
  items.slice(0, 500).forEach((source, index) => {
    try {
      if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Row must be an object.');
      const offer = cleanOffer(normalizeBatchOffer(source));
      const fingerprint = offerFingerprint(offer);
      if (existing.has(fingerprint) || accepted.has(fingerprint)) {
        duplicates.push({ row: index + 2, brand: offer.brand, title: offer.title, reason: existing.has(fingerprint) ? 'Already exists' : 'Repeated in upload' });
        return;
      }
      accepted.add(fingerprint);
      ready.push(offer);
    } catch (error) {
      errors.push({ row: index + 2, title: text(source?.title || source?.name, 160), error: error.message });
    }
  });
  const storesByLabel = new Map();
  currentStores.forEach((store) => storesByLabel.set(slug(store.name), store));
  const plannedStores = new Map();
  const usedStoreIds = new Set(currentStores.map((store) => store.id));
  const storeGroups = new Map();

  ready.forEach((offer) => {
    const labelKey = slug(offer.brand) || 'store';
    let store = storesByLabel.get(labelKey) || plannedStores.get(labelKey);
    if (!store) {
      let storeId = `store_${labelKey}`;
      let suffix = 2;
      while (usedStoreIds.has(storeId)) { storeId = `store_${labelKey}_${suffix}`; suffix += 1; }
      usedStoreIds.add(storeId);
      const domain = offer.domain || destinationHostname(offer.link);
      store = cleanStore({ id: storeId, name: offer.brand, domain, slug: labelKey, category: offer.category, logo: offer.logo || logoForDomain(domain), description: `Coupons and deals from ${offer.brand}.`, visible: true });
      plannedStores.set(labelKey, store);
    }
    offer.storeId = store.id;
    if (!offer.domain) offer.domain = store.domain;
    if (!offer.logo) offer.logo = store.logo || logoForDomain(store.domain);
    const group = storeGroups.get(store.id) || { storeId: store.id, name: store.name, domain: store.domain, status: plannedStores.has(labelKey) ? 'new' : 'existing', offers: 0, codes: 0, deals: 0, affiliateLinks: new Set() };
    group.offers += 1;
    group[offer.type === 'code' ? 'codes' : 'deals'] += 1;
    group.affiliateLinks.add(offer.link);
    storeGroups.set(store.id, group);
  });

  return { items: ready, storesToCreate: [...plannedStores.values()], storeGroups: [...storeGroups.values()].map((group) => ({ ...group, affiliateLinks: group.affiliateLinks.size })), errors, duplicates, total: items.length };
}

function cleanPost(payload, previous = {}) {
  const title = text(payload.title ?? previous.title, 240);
  if (!title) throw new Error('Post title is required.');
  return {
    ...previous,
    id: previous.id || text(payload.id, 100) || identifier('post'),
    title,
    slug: slug(payload.slug ?? previous.slug ?? title),
    excerpt: text(payload.excerpt ?? previous.excerpt, 600),
    content: text(payload.content ?? previous.content, 20_000),
    category: text(payload.category ?? previous.category, 120) || 'Guides',
    brand: text(payload.brand ?? previous.brand, 160),
    image: safeImageUrl(payload.image ?? previous.image),
    sourceUrl: payload.sourceUrl || previous.sourceUrl ? safeUrl(payload.sourceUrl ?? previous.sourceUrl) : '',
    published: payload.published === true,
    featured: payload.featured === true,
    publishedAt: text(payload.publishedAt ?? previous.publishedAt, 40) || new Date().toISOString(),
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase();
  if (value === '::1' || value === '0.0.0.0' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true;
  const ipv4 = value.replace(/^::ffff:/, '');
  const parts = ipv4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

async function validateOfficialUrl(value) {
  const parsed = new URL(safeUrl(value));
  if (parsed.username || parsed.password || parsed.port) throw new Error('Official URL must not contain credentials or a custom port.');
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) throw new Error('Local URLs are not allowed.');
  if (net.isIP(parsed.hostname) && isPrivateAddress(parsed.hostname)) throw new Error('Private network URLs are not allowed.');
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error('The official URL resolves to a private network.');
  return parsed;
}

function decodeHtml(value) {
  return String(value || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
}

function metaValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  return decodeHtml(patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) || '');
}

async function extractOfficialMetadata(sourceUrl) {
  let current = await validateOfficialUrl(sourceUrl);
  let response;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'ReviewHubsBot/1.0 (+official metadata preview)', Accept: 'text/html,application/xhtml+xml' } });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = await validateOfficialUrl(new URL(response.headers.get('location'), current).toString());
      continue;
    }
    break;
  }
  if (!response?.ok) {
    const brand = current.hostname.replace(/^www\./, '');
    const excerpt = `A practical overview of ${brand}, its main features and the details shoppers should review before choosing an offer.`;
    return {
      sourceUrl: current.toString(),
      title: `${brand} Review: Features, Offers and Buying Notes`,
      excerpt,
      content: `${excerpt}\n\nThis Review Hubs guide takes an independent look at the official product experience, who it may suit and the important pricing, availability and offer terms to verify directly on the merchant website.`,
      image: `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(current.hostname)}`,
      brand,
      category: 'Reviews',
      warning: `The official page blocked metadata extraction (HTTP ${response?.status || 'error'}), so a domain-based draft and logo fallback were used.`,
    };
  }
  if (!String(response.headers.get('content-type') || '').includes('text/html')) throw new Error('Official URL must return an HTML page.');
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > 2_000_000) throw new Error('Official page is too large to extract safely.');
  const html = (await response.text()).slice(0, 2_000_000);
  const title = metaValue(html, 'og:title') || metaValue(html, 'twitter:title') || decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const description = metaValue(html, 'og:description') || metaValue(html, 'description') || metaValue(html, 'twitter:description');
  const rawImage = metaValue(html, 'og:image') || metaValue(html, 'twitter:image');
  const image = rawImage ? new URL(rawImage, current).toString() : `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(current.hostname)}`;
  const brand = decodeHtml(metaValue(html, 'og:site_name')) || current.hostname.replace(/^www\./, '');
  const draftTitle = title || `${brand} Review: Features, Offers and Buying Notes`;
  const excerpt = description || `A practical overview of ${brand}, its main features and the details shoppers should review before choosing an offer.`;
  const content = `${excerpt}\n\nThis Review Hubs guide takes an independent look at the official product experience, who it may suit and the important pricing, availability and offer terms to verify directly on the merchant website.`;
  return { sourceUrl: current.toString(), title: draftTitle, excerpt, content, image, brand, category: 'Reviews' };
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
  if (decoded.includes('\0') || decoded.startsWith('/seed/') || decoded.startsWith('/.data/') || /^\/(server\.js|package(?:-lock)?\.json|Procfile|\.env)/i.test(decoded)) return send(res, 404, 'Not found');
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
      return json(res, 200, { ok: true, offers: readArray(offersFile).length, stores: readArray(storesFile).length, adminConfigured: Boolean(adminPassword) });
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

    if (req.method === 'GET' && url.pathname === '/api/blog') {
      const posts = readArray(postsFile).filter((post) => post.published === true).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      return json(res, 200, posts);
    }

    const publicPostMatch = url.pathname.match(/^\/api\/blog\/([^/]+)$/);
    if (req.method === 'GET' && publicPostMatch) {
      const post = readArray(postsFile).find((item) => item.slug === decodeURIComponent(publicPostMatch[1]) && item.published === true);
      return post ? json(res, 200, post) : json(res, 404, { error: 'Post not found.' });
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

    if (req.method === 'GET' && url.pathname === '/api/admin/blog') {
      if (!requireAdmin(req, res)) return;
      return json(res, 200, readArray(postsFile));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/blog/extract') {
      if (!requireAdmin(req, res)) return;
      const payload = await body(req, 30000);
      if (!text(payload.sourceUrl, 1500)) return json(res, 400, { error: 'Official page URL is required.' });
      return json(res, 200, await extractOfficialMetadata(payload.sourceUrl));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/blog') {
      if (!requireAdmin(req, res)) return;
      const posts = readArray(postsFile);
      const post = cleanPost(await body(req, 200000));
      posts.unshift(post);
      writeArray(postsFile, posts);
      return json(res, 201, post);
    }
    const adminPostMatch = url.pathname.match(/^\/api\/admin\/blog\/([^/]+)$/);
    if (adminPostMatch && ['PUT', 'DELETE'].includes(req.method)) {
      if (!requireAdmin(req, res)) return;
      const posts = readArray(postsFile);
      const index = posts.findIndex((item) => item.id === decodeURIComponent(adminPostMatch[1]));
      if (index < 0) return json(res, 404, { error: 'Post not found.' });
      if (req.method === 'DELETE') {
        const [deleted] = posts.splice(index, 1);
        writeArray(postsFile, posts);
        return json(res, 200, deleted);
      }
      posts[index] = cleanPost(await body(req, 200000), posts[index]);
      writeArray(postsFile, posts);
      return json(res, 200, posts[index]);
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/offers') {
      if (!requireAdmin(req, res)) return; return json(res, 200, readArray(offersFile));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/offers') {
      if (!requireAdmin(req, res)) return; const offers = readArray(offersFile); const offer = cleanOffer(await body(req)); offers.unshift(offer); writeArray(offersFile, offers); return json(res, 201, offer);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/offers/batch/preview') {
      if (!requireAdmin(req, res)) return; const payload = await body(req, 5_000_000); const items = Array.isArray(payload) ? payload : payload.items;
      if (!Array.isArray(items) || !items.length || items.length > 500) return json(res, 400, { error: 'Supply between 1 and 500 offers.' });
      return json(res, 200, prepareBatchOffers(items, readArray(offersFile), readArray(storesFile)));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/offers/batch') {
      if (!requireAdmin(req, res)) return; const payload = await body(req, 5_000_000); const items = Array.isArray(payload) ? payload : payload.items;
      if (!Array.isArray(items) || !items.length || items.length > 500) return json(res, 400, { error: 'Supply between 1 and 500 offers.' });
      const offers = readArray(offersFile); const stores = readArray(storesFile); const prepared = prepareBatchOffers(items, offers, stores);
      if (prepared.storesToCreate.length) writeArray(storesFile, [...stores, ...prepared.storesToCreate]);
      if (prepared.items.length) writeArray(offersFile, [...prepared.items, ...offers]);
      return json(res, 201, { created: prepared.items, storesCreated: prepared.storesToCreate, storeGroups: prepared.storeGroups, errors: prepared.errors, duplicates: prepared.duplicates, total: prepared.total, imported: prepared.items.length });
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
