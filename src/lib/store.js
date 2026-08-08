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

function seededGameTypes() {
  return [
    {
      id: createId('gt'),
      code: 'QUICK_MONEY',
      name: 'Quick Money',
      description: 'Small-entry fast entertainment rounds.',
      winnerCount: 1,
      defaultEntryPrice: 5,
      defaultPrize: 'Cash prize',
      defaultMaxPlayers: 16,
      isActive: true,
      config: { cadence: 'fast' },
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: createId('gt'),
      code: 'EQUIPMENT',
      name: 'Equipment',
      description: 'Physical prize rounds with configurable items.',
      winnerCount: 1,
      defaultEntryPrice: 25,
      defaultPrize: 'Phone, TV, laptop, or other equipment',
      defaultMaxPlayers: 100,
      isActive: true,
      config: { cadence: 'standard' },
      createdAt: now(),
      updatedAt: now(),
    },
  ];
}

function seedUsers() {
  const adminPass = hashPassword('Admin123!');
  const playerPass = hashPassword('Player123!');
  const superAdminPass = hashPassword('SuperAdmin123!');
  return [
    {
      id: createId('usr'),
      role: ROLES.SUPER_ADMIN,
      fullName: 'Super Admin',
      phone: '+251911234567',
      email: 'konaneba8@gmail.com',
      passwordHash: superAdminPass.hash,
      salt: superAdminPass.salt,
      location: 'Addis Ababa',
      verificationStatus: USER_VERIFICATION_STATUSES.VERIFIED,
      acceptedTermsVersion: '1.0',
      acceptedGameRulesVersion: '1.0',
      acceptedTermsAt: now(),
      acceptedGameRulesAt: now(),
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: createId('usr'),
      role: ROLES.ADMIN,
      fullName: 'Tikwheel Admin',
      phone: '+0000000000',
      email: 'admin@tikwheel.local',
      passwordHash: adminPass.hash,
      salt: adminPass.salt,
      location: 'Addis Ababa',
      verificationStatus: USER_VERIFICATION_STATUSES.VERIFIED,
      acceptedTermsVersion: '1.0',
      acceptedGameRulesVersion: '1.0',
      acceptedTermsAt: now(),
      acceptedGameRulesAt: now(),
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: createId('usr'),
      role: ROLES.PLAYER,
      fullName: 'Test Player',
      phone: '+1111111111',
      email: 'player@tikwheel.local',
      passwordHash: playerPass.hash,
      salt: playerPass.salt,
      location: 'Addis Ababa',
      verificationStatus: USER_VERIFICATION_STATUSES.VERIFIED,
      acceptedTermsVersion: '1.0',
      acceptedGameRulesVersion: '1.0',
      acceptedTermsAt: now(),
      acceptedGameRulesAt: now(),
      createdAt: now(),
      updatedAt: now(),
    },
  ];
}

function seedRounds(gameTypes, users) {
  const quick = gameTypes.find((g) => g.code === 'QUICK_MONEY') || gameTypes[0];
  const player = users.find((u) => u.role === ROLES.PLAYER);
  const round = {
    id: createId('rnd'),
    number: 'ROUND 001',
    gameTypeId: quick.id,
    status: ROUND_STATUSES.OPEN,
    maxPlayers: 16,
    entryPrice: 5,
    prize: 'Cash prize',
    startAt: now(),
    endAt: null,
    liveLink: 'https://live.tikwheel.local/round/001',
    positions: Array.from({ length: 16 }, (_, i) => i + 1),
    entries: [],
    winnerSelection: null,
    winners: [],
    createdAt: now(),
    updatedAt: now(),
  };

  if (player) {
    round.entries.push({
      id: createId('ent'),
      roundId: round.id,
      userId: player.id,
      position: 1,
      paymentStatus: PAYMENT_STATUSES.VERIFIED,
      receiptUrl: null,
      reference: 'VERIFIED',
      lockedAt: now(),
      expiresAt: null,
      verifiedAt: now(),
      rejectedAt: null,
      reason: null,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  return [round];
}

function seedPaymentMethods() {
  return [
    {
      id: createId('pay'),
      name: 'Bank Transfer',
      instructions: 'Send payment to the configured bank account and include your round number in the reference.',
      accountName: 'TikWheel Account',
      accountNumber: '000-000-0000',
      referenceHint: 'Example: ROUND 001 - PLAYER 01',
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: createId('pay'),
      name: 'Mobile Wallet',
      instructions: 'Transfer using the configured wallet number and upload your receipt or transaction reference.',
      accountName: 'TikWheel Wallet',
      accountNumber: '+0000000000',
      referenceHint: 'Wallet transaction reference',
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    },
  ];
}

export function defaultState() {
  const users = seedUsers();
  const gameTypes = seededGameTypes();
  const rounds = seedRounds(gameTypes, users);
  const campaignStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const campaignEnd = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

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
    paymentMethods: seedPaymentMethods(),
    rounds,
    auditLog: [],
    liveBroadcasts: [],
    promotionCampaigns: [
      {
        id: 'cmp_1',
        name: 'Weekend live round push',
        gameTypeId: gameTypes[0]?.id || 'gt_1',
        gameTypeName: gameTypes[0]?.name || 'Quick Money',
        startAt: campaignStart,
        endAt: campaignEnd,
        shareIntervalMinutes: 15,
        targetLiveStreams: 4,
        workflow: 'manual-review',
        channel: 'manual-approval-queue',
        status: 'active',
        createdAt: now(),
        updatedAt: now(),
        analytics: { clicks: 12, joins: 4, conversions: 4, conversionRate: 0.3333 },
        shares: [
          { id: 'share_1', campaignId: 'cmp_1', scheduledFor: new Date(Date.now() - 30 * 60 * 1000).toISOString(), status: 'completed', channel: 'manual-approval-queue', workflow: 'manual-review', message: 'Approved for manual approval queue', errorLog: null, createdAt: now(), updatedAt: now() },
          { id: 'share_2', campaignId: 'cmp_1', scheduledFor: new Date(Date.now() - 15 * 60 * 1000).toISOString(), status: 'failed', channel: 'manual-approval-queue', workflow: 'manual-review', message: 'Blocked by approval hold', errorLog: 'Manual approval rejected by reviewer', createdAt: now(), updatedAt: now() },
        ],
      },
    ],
    promotionLogs: [
      { id: 'log_1', campaignId: 'cmp_1', shareId: 'share_1', status: 'completed', message: 'Approved for manual approval queue', channel: 'manual-approval-queue', workflow: 'manual-review', createdAt: now() },
      { id: 'log_2', campaignId: 'cmp_1', shareId: 'share_2', status: 'failed', message: 'Blocked by approval hold', channel: 'manual-approval-queue', workflow: 'manual-review', errorLog: 'Manual approval rejected by reviewer', createdAt: now() },
    ],
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
