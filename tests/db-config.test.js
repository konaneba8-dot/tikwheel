import test from 'node:test';
import assert from 'node:assert/strict';

import { DATA_STORE, MYSQL_CONFIG, getDataStoreConfig } from '../src/config.js';

test('default store mode uses JSON-backed storage', () => {
  assert.equal(DATA_STORE, 'json');
  assert.deepEqual(MYSQL_CONFIG, {
    host: 'localhost',
    port: 3306,
    user: 'tikwheel',
    password: 'tikwheel',
    database: 'tikwheel',
    connectionLimit: 5,
  });
});

test('mysql config resolves a clean, explicit config object', () => {
  const config = getDataStoreConfig({
    DB_CLIENT: 'mysql',
    MYSQL_HOST: 'db.internal',
    MYSQL_PORT: '3307',
    MYSQL_USER: 'app',
    MYSQL_PASSWORD: 'secret',
    MYSQL_DATABASE: 'app_db',
  });

  assert.equal(config.host, 'db.internal');
  assert.equal(config.port, 3307);
  assert.equal(config.user, 'app');
  assert.equal(config.password, 'secret');
  assert.equal(config.database, 'app_db');
});
