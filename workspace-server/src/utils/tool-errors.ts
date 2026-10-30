/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Wraps McpServer.registerTool so that a tool with an outputSchema whose
 * handler returns no `structuredContent` reports its result as an error.
 *
 * The services answer a failure with only `content` (e.g. `{"error": "..."}`).
 * For a tool with an outputSchema the MCP SDK then refuses the result with
 * `-32602 Output validation error ... no structured content`, which hides the
 * tool's own message. The SDK skips that check when `isError` is true, so the
 * caller sees the real error instead.
 *
 * @param server The McpServer instance to modify.
 */
export function applyToolErrorResults(server: McpServer): void {
  const originalRegisterTool = server.registerTool.bind(server);

  (server as any).registerTool = (
    name: string,
    config: { outputSchema?: unknown },
    handler: (...args: unknown[]) => unknown,
  ) => {
    const wrapped = config?.outputSchema
      ? async (...args: unknown[]) => {
          const result = (await handler(...args)) as
            | Record<string, unknown>
            | undefined;
          if (result && !result['structuredContent'] && !result['isError']) {
            return { ...result, isError: true };
          }
          return result;
        }
      : handler;
    return (originalRegisterTool as (...args: unknown[]) => unknown)(
      name,
      config,
      wrapped,
    );
  };
}
