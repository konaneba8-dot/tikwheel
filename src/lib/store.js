import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { DEFAULT_COMPLIANCE_MODE, DEFAULT_ENTRY_LOCK_MINUTES, STATE_FILE, getMysqlConfig, getStorageMode } from '../config.js';
import { ROLES, ROUND_STATUSES, PAYMENT_STATUSES, USER_VERIFICATION_STATUSES } from '../domain/statuses.js';
import { hashPassword } from './security.js';

const now = () => new Date().toISOString();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const DEFAULT_STATE_PATH = fileURLToPath(STATE_FILE);

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function initializeGameTypes() {
  // No game types for production - will be configured by admin
  return [];
}

function initializeUsers() {
  // No admin accounts for production - first admin must be created manually
  return [];
}

function initializeRounds(gameTypes, users) {
  // No rounds for production - rounds will be created by admin
  return [];
}

function initializePaymentMethods() {
  // No payment methods for production - will be configured by admin
  return [];
}

export function defaultState() {
  const users = initializeUsers();
  const gameTypes = initializeGameTypes();
  const rounds = initializeRounds(gameTypes, users);

  return {
    meta: {
      appName: 'TikWheel',
      complianceMode: DEFAULT_COMPLIANCE_MODE,
      entryLockMinutes: DEFAULT_ENTRY_LOCK_MINUTES,
      termsVersion: '1.0',
      gameRulesVersion: '1.0',
      termsEffectiveDate: '2026-07-31',
      gameRulesEffectiveDate: '2026-07-31',
    },
    users,
    gameTypes,
    paymentMethods: initializePaymentMethods(),
    rounds,
    auditLog: [],
    liveBroadcasts: [],
    promotionCampaigns: [],
    promotionLogs: [],
  };
}

async function ensureMysqlState() {
  const config = getMysqlConfig();
  if (!config || getStorageMode() !== 'mysql') return false;

  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'Z',
  });

  const tableName = 'tikwheel_state';
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      state_json JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [rows] = await pool.execute(`SELECT state_json FROM ${tableName} WHERE id = ? LIMIT 1`, ['default']);
  if (!rows.length) {
    await pool.execute(`INSERT INTO ${tableName} (id, state_json) VALUES (?, ?)`, ['default', JSON.stringify(defaultState())]);
  }

  return true;
}

export async function ensureStateFile() {
  if (getStorageMode() === 'mysql') {
    await ensureMysqlState();
    return;
  }

  await fs.mkdir(path.dirname(DEFAULT_STATE_PATH), { recursive: true });
  try {
    await fs.access(DEFAULT_STATE_PATH);
  } catch {
    await fs.writeFile(DEFAULT_STATE_PATH, JSON.stringify(defaultState(), null, 2), 'utf8');
  }
}

export async function readState() {
  if (getStorageMode() === 'mysql') {
    const config = getMysqlConfig();
    if (!config) {
      return defaultState();
    }

    const pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: 'Z',
    });

    const [rows] = await pool.execute('SELECT state_json FROM tikwheel_state WHERE id = ? LIMIT 1', ['default']);
    if (!rows.length) {
      const seed = defaultState();
      await pool.execute('INSERT INTO tikwheel_state (id, state_json) VALUES (?, ?)', ['default', JSON.stringify(seed)]);
      return seed;
    }

    const persisted = rows[0].state_json;
    return typeof persisted === 'string' ? JSON.parse(persisted) : persisted;
  }

  await ensureStateFile();
  const raw = await fs.readFile(DEFAULT_STATE_PATH, 'utf8');
  return JSON.parse(raw);
}

export async function writeState(state) {
  if (getStorageMode() === 'mysql') {
    const config = getMysqlConfig();
    if (!config) {
      await fs.mkdir(path.dirname(DEFAULT_STATE_PATH), { recursive: true });
      await fs.writeFile(DEFAULT_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
      return;
    }

    const pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: 'Z',
    });

    await pool.execute('INSERT INTO tikwheel_state (id, state_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = CURRENT_TIMESTAMP', ['default', JSON.stringify(state)]);
    return;
  }

  await fs.mkdir(path.dirname(DEFAULT_STATE_PATH), { recursive: true });
  await fs.writeFile(DEFAULT_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

export function createIdFactory(prefix) {
  return () => createId(prefix);
}

export function getRootDir() {
  return ROOT_DIR;
}
