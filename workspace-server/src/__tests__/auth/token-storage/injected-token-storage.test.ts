/**
 * @license
 * Copyright 2026 Scott Willeke
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { InjectedTokenStorage } from '../../../auth/token-storage/injected-token-storage';

describe('InjectedTokenStorage', () => {
  let tmpDir: string;
  let credentialsPath: string;
  let storage: InjectedTokenStorage;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'injected-test-'));
    credentialsPath = path.join(tmpDir, 'credentials.json');
    storage = new InjectedTokenStorage('test-service', credentialsPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getCredentials', () => {
    it('should return null when file does not exist', async () => {
      const result = await storage.getCredentials('main-account');
      expect(result).toBeNull();
    });

    it('should load credentials from a valid JSON file', async () => {
      fs.writeFileSync(
        credentialsPath,
        JSON.stringify({
          access_token: 'ya29.test-access-token',
          refresh_token: '1//test-refresh-token',
          token_type: 'Bearer',
          expiry_date: 1700000000000,
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        }),
      );

      const result = await storage.getCredentials('main-account');
      expect(result).not.toBeNull();
      expect(result!.serverName).toBe('main-account');
      expect(result!.token.accessToken).toBe('ya29.test-access-token');
      expect(result!.token.refreshToken).toBe('1//test-refresh-token');
      expect(result!.token.tokenType).toBe('Bearer');
      expect(result!.token.expiresAt).toBe(1700000000000);
      expect(result!.token.scope).toBe(
        'https://www.googleapis.com/auth/gmail.readonly',
      );
    });

    it('should return null when file has no tokens', async () => {
      fs.writeFileSync(credentialsPath, JSON.stringify({}));
      const result = await storage.getCredentials('main-account');
      expect(result).toBeNull();
    });

    it('should handle file with only refresh_token', async () => {
      fs.writeFileSync(
        credentialsPath,
        JSON.stringify({
          refresh_token: '1//test-refresh-token',
          token_type: 'Bearer',
        }),
      );

      const result = await storage.getCredentials('main-account');
      expect(result).not.toBeNull();
      expect(result!.token.refreshToken).toBe('1//test-refresh-token');
      expect(result!.token.accessToken).toBeUndefined();
    });
  });

  describe('setCredentials', () => {
    it('should write credentials back to the file', async () => {
      await storage.setCredentials({
        serverName: 'main-account',
        token: {
          accessToken: 'ya29.new-token',
          refreshToken: '1//new-refresh',
          tokenType: 'Bearer',
          expiresAt: 1800000000000,
          scope: 'https://www.googleapis.com/auth/calendar',
        },
        updatedAt: Date.now(),
      });

      const written = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
      expect(written.access_token).toBe('ya29.new-token');
      expect(written.refresh_token).toBe('1//new-refresh');
      expect(written.token_type).toBe('Bearer');
      expect(written.expiry_date).toBe(1800000000000);
      expect(written.scope).toBe(
        'https://www.googleapis.com/auth/calendar',
      );
    });

    it('should write file with mode 0600', async () => {
      await storage.setCredentials({
        serverName: 'main-account',
        token: {
          accessToken: 'ya29.test',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      });

      const stat = fs.statSync(credentialsPath);
      // 0o600 = owner read+write only (octal 33024 on some systems)
      expect(stat.mode & 0o777).toBe(0o600);
    });
  });

  describe('deleteCredentials', () => {
    it('should be a no-op (does not throw)', async () => {
      await expect(
        storage.deleteCredentials('main-account'),
      ).resolves.toBeUndefined();
    });
  });

  describe('listServers', () => {
    it('should return main-account when file exists', async () => {
      fs.writeFileSync(
        credentialsPath,
        JSON.stringify({ access_token: 'test' }),
      );
      const servers = await storage.listServers();
      expect(servers).toEqual(['main-account']);
    });

    it('should return empty array when file does not exist', async () => {
      const servers = await storage.listServers();
      expect(servers).toEqual([]);
    });
  });

  describe('getAllCredentials', () => {
    it('should return map with credentials when file exists', async () => {
      fs.writeFileSync(
        credentialsPath,
        JSON.stringify({
          access_token: 'ya29.test',
          token_type: 'Bearer',
        }),
      );

      const all = await storage.getAllCredentials();
      expect(all.size).toBe(1);
      expect(all.has('main-account')).toBe(true);
    });

    it('should return empty map when file does not exist', async () => {
      const all = await storage.getAllCredentials();
      expect(all.size).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should be a no-op (does not throw)', async () => {
      await expect(storage.clearAll()).resolves.toBeUndefined();
    });
  });
});
