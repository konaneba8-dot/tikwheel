import test from 'node:test';
import assert from 'node:assert/strict';

import { getStorageMode, getMysqlConfig } from '../src/config.js';

test('storage resolves to mysql when mysql env is configured', () => {
  process.env.TIKWHEEL_STORAGE_BACKEND = 'mysql';
  process.env.TIKWHEEL_DB_HOST = '127.0.0.1';
  process.env.TIKWHEEL_DB_PORT = '3306';
  process.env.TIKWHEEL_DB_USER = 'root';
  process.env.TIKWHEEL_DB_PASSWORD = 'secret';
  process.env.TIKWHEEL_DB_NAME = 'tikwheel';

  assert.equal(getStorageMode(), 'mysql');
  assert.deepEqual(getMysqlConfig(), {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'secret',
    database: 'tikwheel',
    charset: 'utf8mb4',
  });
});
