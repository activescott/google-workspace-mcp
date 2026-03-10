import { z } from 'zod';
import { logToFile } from './logger';

/**
 * Creates an MCP tool response with both `content` (backward compat) and
 * `structuredContent` (MCP spec 2025-06-18).
 *
 * Always includes `structuredContent` because the MCP SDK requires it when
 * a tool has an `outputSchema`. If Zod validation fails, the raw data is
 * used as `structuredContent` and detailed errors are logged.
 */
export function createStructuredResponse(
  data: unknown,
  schema: z.ZodType,
  toolName: string,
): {
  content: [{ type: 'text'; text: string }];
  structuredContent: Record<string, unknown>;
} {
  const jsonText = JSON.stringify(data, null, 2);
  const content: [{ type: 'text'; text: string }] = [
    { type: 'text' as const, text: jsonText },
  ];

  const result = schema.safeParse(data);
  if (result.success) {
    return {
      content,
      structuredContent: result.data as Record<string, unknown>,
    };
  }

  const issues = result.error.issues
    .map(
      (issue) =>
        `  path: ${issue.path.join('.')}, code: ${issue.code}, message: ${issue.message}`,
    )
    .join('\n');
  logToFile(
    `[${toolName}] outputSchema validation failed (using raw data as structuredContent):\n${issues}`,
  );

  // Always include structuredContent — the MCP SDK rejects responses that
  // have an outputSchema but no structuredContent.
  return {
    content,
    structuredContent: (data ?? {}) as Record<string, unknown>,
  };
}
