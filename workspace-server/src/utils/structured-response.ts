import { z } from 'zod';
import { logToFile } from './logger';

/**
 * Creates an MCP tool response with both `content` (backward compat) and
 * `structuredContent` (MCP spec 2025-06-18).
 *
 * Uses safeParse so validation failures never break tool execution — they
 * just omit structuredContent and log a warning.
 */
export function createStructuredResponse(
  data: unknown,
  schema: z.ZodType,
  toolName: string,
): {
  content: [{ type: 'text'; text: string }];
  structuredContent?: Record<string, unknown>;
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

  logToFile(
    `[${toolName}] outputSchema validation failed (structuredContent omitted): ${result.error.message}`,
  );
  return { content };
}
