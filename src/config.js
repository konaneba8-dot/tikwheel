export const APP_NAME = 'TikWheel';
export const PORT = Number(process.env.PORT || 3000);
export const DATA_DIR = new URL('../data/', import.meta.url);
export const STATE_FILE = new URL('../data/state.json', import.meta.url);
export const SESSION_COOKIE = 'tikwheel_session';
export const SESSION_SECRET = process.env.TIKWHEEL_SESSION_SECRET || 'tikwheel-demo-secret-change-me';
export const DEFAULT_ENTRY_LOCK_MINUTES = 15;
export const DEFAULT_COMPLIANCE_MODE = 'demo';

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

