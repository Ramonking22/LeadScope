const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;

const BLOCKED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'css', 'js', 'mjs', 'map',
  'woff', 'woff2', 'ttf', 'eot', 'mp4', 'webm', 'pdf', 'zip',
]);

const BLOCKED_LOCAL_PARTS = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'postmaster', 'webmaster', 'hostmaster', 'abuse', 'newsletter',
]);

const BLOCKED_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'sentry.io', 'wixpress.com',
  'schema.org', 'w3.org', 'googleapis.com', 'gstatic.com', 'cloudflare.com',
  'github.com', 'githubusercontent.com',
]);

function decodeCfEmail(hex: string): string {
  const key = Number.parseInt(hex.slice(0, 2), 16);
  if (Number.isNaN(key)) return '';
  let out = '';
  for (let n = 2; n < hex.length; n += 2) {
    const code = Number.parseInt(hex.slice(n, n + 2), 16);
    if (Number.isNaN(code)) continue;
    out += String.fromCharCode(code ^ key);
  }
  return out;
}

function decodeProtectedEmails(text: string): string {
  return text.replace(/data-cfemail="([0-9a-fA-F]+)"/g, (_match, hex) => {
    const email = decodeCfEmail(hex);
    return email ? ` data-cfemail="${hex}">${email}<` : _match;
  }).replace(/href="\/cdn-cgi\/l\/email-protection#[0-9a-fA-F]+"/g, (match) => {
    const hex = match.split('#')[1]?.replace(/"$/, '') || '';
    const email = decodeCfEmail(hex);
    return email ? `href="mailto:${email}"` : match;
  });
}

export function extractEmails(text: string): string[] {
  const decoded = decodeProtectedEmails(text);
  const matches = decoded.match(EMAIL_RE) || [];
  const unique = new Set<string>();
  for (const raw of matches) {
    const email = raw.toLowerCase().replace(/[.,;:)]+$/, '');
    if (!isUsefulEmail(email)) continue;
    unique.add(email);
  }
  return Array.from(unique);
}

export function toPrivacyPolicyUrl(raw: string): string | null {
  let value = raw.trim();
  if (!/^https?:\/\//i.test(value) && /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) {
    value = `https://${value}`;
  }
  const url = isSafeFetchUrl(value);
  if (!url) return null;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (/\/policies\/privacy-policy$/i.test(path)) return url.toString();
  url.pathname = '/policies/privacy-policy';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function isUsefulEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || domain.length > 253) return false;
  if (email.includes('..')) return false;
  const ext = domain.split('.').pop() || '';
  if (BLOCKED_EXTENSIONS.has(ext)) return false;
  if (BLOCKED_DOMAINS.has(domain)) return false;
  if (BLOCKED_LOCAL_PARTS.has(local)) return false;
  if (local.startsWith('noreply') || local.startsWith('no-reply')) return false;
  if (!/^[a-z0-9._%+-]+$/.test(local)) return false;
  if (!/^[a-z0-9.-]+\.[a-z]{2,24}$/.test(domain)) return false;
  return true;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseSources(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isSafeFetchUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export async function fetchPage(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'LeadScope/1.1 (+https://dimetech.agency)',
        accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.1',
      },
    });
    const text = await response.text();
    return text.slice(0, 600_000);
  } finally {
    clearTimeout(timer);
  }
}
