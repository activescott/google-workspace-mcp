/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logToFile } from './logger';

export interface WorkspaceConfig {
  clientId: string;
  /** OAuth client secret. When set, enables direct Google token refresh instead of using the cloud function. */
  clientSecret: string | null;
  cloudFunctionUrl: string;
  /** Override the token refresh endpoint. When set, token refresh requests go here instead of the cloud function. */
  tokenRefreshUrl: string | null;
  /** Path to a pre-obtained credentials JSON file for headless/container use. */
  credentialsPath: string | null;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  clientId:
    '338689075775-o75k922vn5fdl18qergr96rp8g63e4d7.apps.googleusercontent.com',
  clientSecret: null,
  cloudFunctionUrl: 'https://google-workspace-extension.geminicli.com',
  // These are null by default — only set when running in headless/container mode
  // where an external system (e.g., an MCP gateway) handles OAuth and injects tokens.
  tokenRefreshUrl: null,
  credentialsPath: null,
};

/**
 * Loads the configuration. Currently uses defaults, but can be extended
 * to read from environment variables or a configuration file.
 */
export function loadConfig(): WorkspaceConfig {
  const config: WorkspaceConfig = {
    clientId: process.env['WORKSPACE_CLIENT_ID'] || DEFAULT_CONFIG.clientId,
    clientSecret: process.env['WORKSPACE_CLIENT_SECRET'] || DEFAULT_CONFIG.clientSecret,
    cloudFunctionUrl:
      process.env['WORKSPACE_CLOUD_FUNCTION_URL'] ||
      DEFAULT_CONFIG.cloudFunctionUrl,
    tokenRefreshUrl:
      process.env['WORKSPACE_TOKEN_REFRESH_URL'] || DEFAULT_CONFIG.tokenRefreshUrl,
    credentialsPath:
      process.env['WORKSPACE_CREDENTIALS_PATH'] || DEFAULT_CONFIG.credentialsPath,
  };

  const maskedClientId =
    config.clientId.length > 2
      ? `...${config.clientId.slice(-2)}`
      : config.clientId;
  logToFile(
    `Loaded config: clientId=${maskedClientId}, cloudFunctionUrl=${config.cloudFunctionUrl}` +
    (config.credentialsPath ? `, credentialsPath=${config.credentialsPath}` : '') +
    (config.tokenRefreshUrl ? `, tokenRefreshUrl=${config.tokenRefreshUrl}` : ''),
  );
  return config;
}
