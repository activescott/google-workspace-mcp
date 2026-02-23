/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PROJECT_ROOT } from './paths';

const logFilePath = path.join(PROJECT_ROOT, 'logs', 'server.log');

async function ensureLogDirectoryExists() {
  try {
    await fs.mkdir(path.dirname(logFilePath), { recursive: true });
  } catch (error) {
    // If we can't create the log directory, log to console as a fallback.
    console.error('Could not create log directory:', error);
  }
}

// Ensure the directory exists when the module is loaded.
ensureLogDirectoryExists();

let isLoggingEnabled = false;

export function setLoggingEnabled(enabled: boolean) {
  isLoggingEnabled = enabled;
}

export function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}`;

  // Always log to stderr so container logs are visible in Grafana.
  // Cannot use stdout — it's reserved for MCP protocol messages (stdio transport).
  console.error(logMessage);

  if (!isLoggingEnabled) {
    return;
  }

  fs.appendFile(logFilePath, logMessage + '\n').catch((err) => {
    console.error('Failed to write to log file:', err);
  });
}
