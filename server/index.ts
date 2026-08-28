import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pool, ensureSchema } from './db.ts';
import { extractEmails, isHttpUrl, parseSources, isSafeFetchUrl, fetchPage } from './extract.ts';

const PORT = Number(process.env.WEBSERVER_PORT ?? 3001);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'leadscope');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FREE_LIMIT = 80;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

type User = {
  id: string;
  email: string;
  name: string;
  plan: string;
};

function send(res: http.ServerResponse, status: number, body: string | Buffer, contentType: string, extra: Record<string, string> = {}) {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    ...extra,
  });
  res.end(body);
}

function json(res: http.ServerResponse, status: number, payload: unknown, extra?: Record<string, string>) {
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8', extra);
}

function serveFile(res: http.ServerResponse, filePath: string) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PUBLIC))) {
    send(res, 403, 'Forbidden', 'text/plain');
    return;
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      send(res, 404, 'Not found', 'text/plain');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    send(res, 200, data, MIME[ext] ?? 'application/octet-stream');
  });
}

function readBody(req: http.IncomingMessage, limit = 200_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const next = crypto.scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, 'hex');
  if (prev.length !== next.length) return false;
  return crypto.timingSafeEqual(prev, next);
}

function sessionCookie(token: string): string {
  return `ls_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, expires]);
  return token;
}

async function currentUser(req: http.IncomingMessage): Promise<User | null> {
  const token = parseCookies(req.headers.cookie).ls_session;
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.plan
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  return rows[0] ?? null;
}

function publicUser(user: User) {
  return { id: user.id, email: user.email, name: user.name, plan: user.plan };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function handleRegister(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req)) as { email?: string; password?: string; name?: string };
  const email = normalizeEmail(body.email || '');
  const password = String(body.password || '');
  const name = String(body.name || '').trim() || email.split('@')[0];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    json(res, 400, { error: 'Use a valid email and a password of at least 8 characters' });
    return;
  }
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount) {
    json(res, 409, { error: 'An account with that email already exists' });
    return;
  }
  const { rows } = await pool.query(
    'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, plan',
    [email, name, hashPassword(password)],
  );
  const token = await createSession(rows[0].id);
  json(res, 201, { user: publicUser(rows[0]) }, { 'set-cookie': sessionCookie(token) });
}

async function handleLogin(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = JSON.parse(await readBody(req)) as { email?: string; password?: string };
  const email = normalizeEmail(body.email || '');
  const password = String(body.password || '');
  const { rows } = await pool.query('SELECT id, email, name, plan, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
    json(res, 401, { error: 'Invalid email or password' });
    return;
  }
  const token = await createSession(user.id);
  json(res, 200, { user: publicUser(user) }, { 'set-cookie': sessionCookie(token) });
}

async function handleLogout(req: http.IncomingMessage, res: http.ServerResponse) {
  const token = parseCookies(req.headers.cookie).ls_session;
  if (token) await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  json(res, 200, { ok: true }, { 'set-cookie': 'ls_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
}

async function handleMe(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, { error: 'Not signed in' });
    return;
  }
  json(res, 200, { user: publicUser(user) });
}

async function handleScan(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, { error: 'Sign in to scan' });
    return;
  }
  const body = JSON.parse(await readBody(req, 400_000)) as { input?: string };
  const sources = parseSources(String(body.input || '')).slice(0, 25);
  if (!sources.length) {
    json(res, 400, { error: 'Paste URLs or text first' });
    return;
  }

  const countRes = await pool.query('SELECT COUNT(*)::int AS n FROM scans WHERE user_id = $1', [user.id]);
  const existingCount = countRes.rows[0].n as number;
  if (user.plan !== 'pro' && existingCount >= FREE_LIMIT) {
    json(res, 402, { error: `Free plan is capped at ${FREE_LIMIT} saved emails. Upgrade to keep scanning.` });
    return;
  }

  const found: { email: string; domain: string; sourceUrl: string }[] = [];
  const errors: string[] = [];

  for (const source of sources) {
    if (isHttpUrl(source)) {
      const url = isSafeFetchUrl(source);
      if (!url) {
        errors.push(`Blocked URL: ${source}`);
        continue;
      }
      try {
        const text = await fetchPage(url);
        for (const email of extractEmails(text)) {
          found.push({ email, domain: email.split('@')[1], sourceUrl: source });
        }
      } catch {
        errors.push(`Could not fetch ${source}`);
      }
    } else {
      for (const email of extractEmails(source)) {
        found.push({ email, domain: email.split('@')[1], sourceUrl: 'Pasted Text' });
      }
    }
  }

  const unique = new Map<string, { email: string; domain: string; sourceUrl: string }>();
  for (const row of found) unique.set(`${row.email}\0${row.sourceUrl}`, row);
  let records = Array.from(unique.values());
  if (user.plan !== 'pro') {
    const remaining = Math.max(0, FREE_LIMIT - existingCount);
    records = records.slice(0, remaining);
  }

  const inserted: { email: string; domain: string; source_url: string; scanned_at: string }[] = [];
  for (const row of records) {
    const result = await pool.query(
      `INSERT INTO scans (user_id, email, domain, source_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, email, source_url) DO NOTHING
       RETURNING email, domain, source_url, scanned_at`,
      [user.id, row.email, row.domain, row.sourceUrl],
    );
    if (result.rows[0]) inserted.push(result.rows[0]);
  }

  json(res, 200, {
    added: inserted.length,
    scanned: sources.length,
    results: inserted.map((row) => ({
      email: row.email,
      domain: row.domain,
      sourceUrl: row.source_url,
      scannedAt: row.scanned_at,
    })),
    errors,
  });
}

async function handleList(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, { error: 'Sign in to view results' });
    return;
  }
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const params: unknown[] = [user.id];
  let where = 'user_id = $1';
  if (q) {
    params.push(`%${q}%`);
    where += ` AND email ILIKE $${params.length}`;
  }
  if (from) {
    params.push(from);
    where += ` AND scanned_at >= $${params.length}::date`;
  }
  if (to) {
    params.push(to);
    where += ` AND scanned_at < ($${params.length}::date + interval '1 day')`;
  }
  const { rows } = await pool.query(
    `SELECT email, domain, source_url AS "sourceUrl", scanned_at AS "scannedAt"
     FROM scans WHERE ${where}
     ORDER BY scanned_at DESC
     LIMIT 500`,
    params,
  );
  const domains = new Set(rows.map((row: { domain: string }) => row.domain));
  json(res, 200, {
    results: rows,
    totals: {
      emails: rows.length,
      domains: domains.size,
      lastScan: rows[0]?.scannedAt ?? null,
    },
  });
}

async function handleClear(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, { error: 'Sign in first' });
    return;
  }
  await pool.query('DELETE FROM scans WHERE user_id = $1', [user.id]);
  json(res, 200, { ok: true });
}

async function handleUpgrade(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, { error: 'Sign in first' });
    return;
  }
  const { rows } = await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1 RETURNING id, email, name, plan", [user.id]);
  json(res, 200, { user: publicUser(rows[0]) });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, 'ok', 'text/plain');
      return;
    }

    await ensureSchema();

    if (req.method === 'POST' && url.pathname === '/api/register') {
      await handleRegister(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/login') {
      await handleLogin(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      await handleLogout(req, res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/me') {
      await handleMe(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/scan') {
      await handleScan(req, res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/scans') {
      await handleList(req, res, url);
      return;
    }
    if (req.method === 'DELETE' && url.pathname === '/api/scans') {
      await handleClear(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/upgrade') {
      await handleUpgrade(req, res);
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/leadscope' || url.pathname === '/leadscope/')) {
      serveFile(res, path.join(PUBLIC, 'index.html'));
      return;
    }
    if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
      serveFile(res, path.join(PUBLIC, 'admin.html'));
      return;
    }
    if (req.method === 'GET') {
      const relative = url.pathname.replace(/^\/leadscope\/?/, '/');
      serveFile(res, path.join(PUBLIC, relative === '/' ? 'index.html' : relative));
      return;
    }

    send(res, 404, 'Not found', 'text/plain');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'Something went wrong' });
  }
});

ensureSchema()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[webserver] LeadScope on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error('schema failed', err);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[webserver] LeadScope on :${PORT} (schema pending)`);
    });
  });
