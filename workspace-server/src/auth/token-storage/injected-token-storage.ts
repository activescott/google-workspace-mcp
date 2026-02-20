/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modifications copyright 2026 Scott Willeke
 * Added InjectedTokenStorage for headless/container credential injection.
 */

import { promises as fs } from 'node:fs';
import { BaseTokenStorage } from './base-token-storage';
import type { OAuthCredentials, OAuthToken } from './types';
import { logToFile } from '../../utils/logger';

/**
 * Format of the injected credentials JSON file.
 * Uses the Google Credentials format for easy interop with external OAuth flows.
 */
interface InjectedCredentialsFile {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expiry_date?: number;
  scope?: string;
}

/**
 * Token storage that reads credentials from a plain JSON file at a
 * path specified by the WORKSPACE_CREDENTIALS_PATH environment variable.
 *
 * Designed for headless/container environments where an external system
 * (e.g., Tinkerbell's MCP Gateway) handles the OAuth flow and injects
 * pre-obtained tokens via a file.
 *
 * - getCredentials: reads from the JSON file
 * - setCredentials: writes back to the same file (for token refresh persistence)
 * - deleteCredentials/clearAll: no-op (lifecycle managed by the external system)
 */
export class InjectedTokenStorage extends BaseTokenStorage {
  private readonly credentialsFilePath: string;

  constructor(serviceName: string, credentialsFilePath: string) {
    super(serviceName);
    this.credentialsFilePath = credentialsFilePath;
  }

  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    try {
      const data = await fs.readFile(this.credentialsFilePath, 'utf-8');
      const injected: InjectedCredentialsFile = JSON.parse(data);

      if (!injected.access_token && !injected.refresh_token) {
        logToFile(
          'Injected credentials file has neither access_token nor refresh_token',
        );
        return null;
      }

      const token: OAuthToken = {
        accessToken: injected.access_token,
        refreshToken: injected.refresh_token,
        tokenType: injected.token_type || 'Bearer',
        expiresAt: injected.expiry_date,
        scope: injected.scope,
      };

      return {
        serverName,
        token,
        updatedAt: Date.now(),
      };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        logToFile(
          `Injected credentials file not found: ${this.credentialsFilePath}`,
        );
        return null;
      }
      throw error;
    }
  }

  async setCredentials(credentials: OAuthCredentials): Promise<void> {
    this.validateCredentials(credentials);

    const fileData: InjectedCredentialsFile = {
      access_token: credentials.token.accessToken,
      refresh_token: credentials.token.refreshToken,
      token_type: credentials.token.tokenType,
      expiry_date: credentials.token.expiresAt,
      scope: credentials.token.scope,
    };

    await fs.writeFile(
      this.credentialsFilePath,
      JSON.stringify(fileData, null, 2),
      { mode: 0o600 },
    );
    logToFile('Wrote updated credentials to injected credentials file');
  }

  async deleteCredentials(_serverName: string): Promise<void> {
    // No-op: lifecycle of the credentials file is managed by the external system
    logToFile(
      'deleteCredentials called on InjectedTokenStorage (no-op — managed externally)',
    );
  }

  async listServers(): Promise<string[]> {
    try {
      await fs.access(this.credentialsFilePath);
      return ['main-account'];
    } catch {
      return [];
    }
  }

  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    const result = new Map<string, OAuthCredentials>();
    const credentials = await this.getCredentials('main-account');
    if (credentials) {
      result.set('main-account', credentials);
    }
    return result;
  }

  async clearAll(): Promise<void> {
    // No-op: lifecycle of the credentials file is managed by the external system
    logToFile(
      'clearAll called on InjectedTokenStorage (no-op — managed externally)',
    );
  }
}
