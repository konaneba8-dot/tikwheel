export const APP_NAME = 'TikWheel';
export const PORT = Number(process.env.PORT || 3000);
export const DATA_DIR = new URL('../data/', import.meta.url);
export const STATE_FILE = new URL('../data/state.json', import.meta.url);
export const SESSION_COOKIE = 'tikwheel_session';
export const SESSION_SECRET = process.env.TIKWHEEL_SESSION_SECRET || 'tikwheel-production-secret-change-in-production';
export const DEFAULT_ENTRY_LOCK_MINUTES = 15;
export const DEFAULT_COMPLIANCE_MODE = 'production';

// OAuth Configuration
export const OAUTH_CONFIG = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback/google',
    scope: 'profile email',
  },
  facebook: {
    clientId: process.env.FACEBOOK_CLIENT_ID || '',
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
    redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3000/auth/callback/facebook',
    scope: 'email public_profile',
  },
  instagram: {
    clientId: process.env.INSTAGRAM_CLIENT_ID || '',
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || '',
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3000/auth/callback/instagram',
    scope: 'user_profile',
  },
  tiktok: {
    clientId: process.env.TIKTOK_CLIENT_ID || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3000/auth/callback/tiktok',
    scope: 'user.info.basic',
  },
  twitter: {
    clientId: process.env.TWITTER_CLIENT_ID || '',
    clientSecret: process.env.TWITTER_CLIENT_SECRET || '',
    redirectUri: process.env.TWITTER_REDIRECT_URI || 'http://localhost:3000/auth/callback/twitter',
    scope: 'tweet.read users.read',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    redirectUri: process.env.TELEGRAM_REDIRECT_URI || 'http://localhost:3000/auth/callback/telegram',
  },
};

export function getStorageMode() {
  const configuredMode = (process.env.TIKWHEEL_STORAGE_BACKEND || '').trim().toLowerCase();
  if (configuredMode === 'mysql') return 'mysql';
  if (process.env.TIKWHEEL_DB_HOST) return 'mysql';
  return 'json';
}

export function getMysqlConfig() {
  if (!process.env.TIKWHEEL_DB_HOST) return null;

  return {
    host: process.env.TIKWHEEL_DB_HOST,
    port: Number(process.env.TIKWHEEL_DB_PORT || 3306),
    user: process.env.TIKWHEEL_DB_USER || 'root',
    password: process.env.TIKWHEEL_DB_PASSWORD || '',
    database: process.env.TIKWHEEL_DB_NAME || 'tikwheel',
    charset: 'utf8mb4',
  };
}

