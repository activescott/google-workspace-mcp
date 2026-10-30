/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthManager, refreshFailure } from '../../auth/AuthManager';
import { OAuthCredentialStorage } from '../../auth/token-storage/oauth-credential-storage';
import { google } from 'googleapis';
import { logToFile } from '../../utils/logger';

const REFRESH_URL = 'https://broker.example.test/api/token';

// Injected credentials refreshed through a broker, with no client secret: the
// headless set-up an MCP gateway runs this server in
jest.mock('../../utils/config', () => ({
  loadConfig: () => ({
    clientId: 'client-id.apps.googleusercontent.com',
    clientSecret: null,
    cloudFunctionUrl: 'https://cloud-function.example.test',
    tokenRefreshUrl: 'https://broker.example.test/api/token',
    credentialsPath: '/data/credentials.json',
  }),
}));
jest.mock('../../auth/token-storage/oauth-credential-storage');
jest.mock('googleapis');
jest.mock('../../utils/logger');
jest.mock('../../utils/secure-browser-launcher');

global.fetch = jest.fn();

const SECRET_REFRESH = 'secret-refresh-value';
const SECRET_ACCESS = 'secret-access-value';

function logged(): string {
  return (logToFile as jest.Mock).mock.calls
    .map((c) => String(c[0]))
    .join('\n');
}

describe('AuthManager with a token refresh URL', () => {
  let authManager: AuthManager;
  let mockOAuth2Client: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOAuth2Client = {
      setCredentials: jest.fn().mockImplementation((creds) => {
        mockOAuth2Client.credentials = creds;
      }),
      on: jest.fn(),
      credentials: {},
    };
    (google.auth.OAuth2 as unknown as jest.Mock).mockReturnValue(
      mockOAuth2Client,
    );
    authManager = new AuthManager(['scope1']);
  });

  function brokerAnswers() {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'fresh_token',
        expiry_date: Date.now() + 60 * 60 * 1000,
        token_type: 'Bearer',
      }),
    });
  }

  it('refreshes through the refresh URL a credential with no expiry_date or access_token', async () => {
    // What a host writes on switching to a shared app: a refresh token alone
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
      refresh_token: 'managed_credential',
      token_type: 'Bearer',
      scope: 'scope1',
    });
    brokerAnswers();

    const client = await authManager.getAuthenticatedClient();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      REFRESH_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'managed_credential' }),
      }),
    );
    expect(client.credentials).toMatchObject({
      access_token: 'fresh_token',
      refresh_token: 'managed_credential',
    });
  });

  it('refreshes through the refresh URL an access token with no expiry_date', async () => {
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
      access_token: 'unknown_age_token',
      refresh_token: 'managed_credential',
      scope: 'scope1',
    });
    brokerAnswers();

    await authManager.getAuthenticatedClient();

    expect(global.fetch).toHaveBeenCalledWith(REFRESH_URL, expect.anything());
  });

  it('refreshes through the refresh URL an expiry_date with no access token', async () => {
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
      refresh_token: 'managed_credential',
      expiry_date: Date.now() + 60 * 60 * 1000,
      scope: 'scope1',
    });
    brokerAnswers();

    await authManager.getAuthenticatedClient();

    expect(global.fetch).toHaveBeenCalledWith(REFRESH_URL, expect.anything());
  });

  it('does not refresh an access token that is not near its expiry', async () => {
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
      access_token: 'valid_token',
      refresh_token: 'managed_credential',
      expiry_date: Date.now() + 60 * 60 * 1000,
      scope: 'scope1',
    });

    await authManager.getAuthenticatedClient();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reports the status and error_description of a failed refresh, and no token', async () => {
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
      access_token: SECRET_ACCESS,
      refresh_token: SECRET_REFRESH,
      scope: 'scope1',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Sign in again from your Assistant page.',
        refresh_token: SECRET_REFRESH,
      }),
    });

    // The refresh error, not "no valid credentials", is what the tool reports
    await expect(authManager.getAuthenticatedClient()).rejects.toThrow(
      'Token refresh failed: 400 invalid_grant: Sign in again from your Assistant page.',
    );
    expect(logged()).toContain(
      '400 invalid_grant: Sign in again from your Assistant page.',
    );
    expect(logged()).not.toContain(SECRET_REFRESH);
    expect(logged()).not.toContain(SECRET_ACCESS);
  });
});

describe('refreshFailure', () => {
  function answer(status: number, body: unknown): Response {
    return {
      status,
      json: async () => {
        if (body === undefined) throw new SyntaxError('not JSON');
        return body;
      },
    } as unknown as Response;
  }

  it('gives the status, error and error_description', async () => {
    expect(
      await refreshFailure(
        answer(400, {
          error: 'invalid_request',
          error_description: 'client_secret is missing.',
        }),
      ),
    ).toBe('400 invalid_request: client_secret is missing.');
  });

  it('gives the status and error when there is no description', async () => {
    expect(
      await refreshFailure(answer(503, { error: 'temporarily_unavailable' })),
    ).toBe('503 temporarily_unavailable');
  });

  it('gives only the status for a body that is not an OAuth error', async () => {
    expect(await refreshFailure(answer(502, undefined))).toBe('502');
    expect(
      await refreshFailure(answer(500, { access_token: SECRET_ACCESS })),
    ).toBe('500');
  });
});
