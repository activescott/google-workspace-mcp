/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';

jest.mock('../../utils/logger', () => ({
  logToFile: jest.fn(),
}));

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env['WORKSPACE_CLIENT_ID'];
    delete process.env['WORKSPACE_CLOUD_FUNCTION_URL'];
    delete process.env['WORKSPACE_TOKEN_REFRESH_URL'];
    delete process.env['WORKSPACE_CREDENTIALS_PATH'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default config when no env vars are set', async () => {
    const { loadConfig } = await import('../../utils/config');
    const config = loadConfig();

    expect(config.clientId).toBe(
      '338689075775-o75k922vn5fdl18qergr96rp8g63e4d7.apps.googleusercontent.com',
    );
    expect(config.cloudFunctionUrl).toBe(
      'https://google-workspace-extension.geminicli.com',
    );
    expect(config.tokenRefreshUrl).toBeNull();
    expect(config.credentialsPath).toBeNull();
  });

  it('should use env vars when set', async () => {
    process.env['WORKSPACE_CLIENT_ID'] = 'custom-client-id';
    process.env['WORKSPACE_CLOUD_FUNCTION_URL'] = 'https://custom.example.com';
    process.env['WORKSPACE_TOKEN_REFRESH_URL'] = 'https://refresh.example.com';
    process.env['WORKSPACE_CREDENTIALS_PATH'] = '/tmp/creds.json';

    const { loadConfig } = await import('../../utils/config');
    const config = loadConfig();

    expect(config.clientId).toBe('custom-client-id');
    expect(config.cloudFunctionUrl).toBe('https://custom.example.com');
    expect(config.tokenRefreshUrl).toBe('https://refresh.example.com');
    expect(config.credentialsPath).toBe('/tmp/creds.json');
  });

  it('should fall back to defaults for partial env var configuration', async () => {
    process.env['WORKSPACE_CLIENT_ID'] = 'custom-client-id';

    const { loadConfig } = await import('../../utils/config');
    const config = loadConfig();

    expect(config.clientId).toBe('custom-client-id');
    expect(config.cloudFunctionUrl).toBe(
      'https://google-workspace-extension.geminicli.com',
    );
  });
});
