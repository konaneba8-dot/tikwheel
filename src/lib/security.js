import crypto from 'node:crypto';
import { SESSION_SECRET } from '../config.js';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash: derivedKey };
}

export function verifyPassword(password, salt, hash) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
}

export function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

export function createSignedToken(payload) {
  const body = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

export function verifySignedToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(body)
    .digest('base64url');
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, pair) => {
    const [rawKey, ...rawValue] = pair.trim().split('=');
    if (!rawKey) return acc;
    acc[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.join('=') || '');
    return acc;
  }, {});
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.maxAge) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}
