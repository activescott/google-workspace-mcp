/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { applyToolErrorResults } from '../utils/tool-errors';

async function connected(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe('applyToolErrorResults', () => {
  const outputSchema = { messages: z.array(z.string()) };
  const failure = async () => ({
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: 'client_secret is missing.' }),
      },
    ],
  });

  it('answers a failed tool with an outputSchema with its own error', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    applyToolErrorResults(server);
    server.registerTool('search', { outputSchema }, failure);
    const client = await connected(server);

    const result = await client.callTool({ name: 'search', arguments: {} });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      'client_secret is missing.',
    );
    expect(JSON.stringify(result.content)).not.toContain('Output validation');
  });

  it('leaves a result with structured content as it is', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    applyToolErrorResults(server);
    server.registerTool('search', { outputSchema }, async () => ({
      content: [{ type: 'text' as const, text: '{"messages":["a"]}' }],
      structuredContent: { messages: ['a'] },
    }));
    const client = await connected(server);

    const result = await client.callTool({ name: 'search', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ messages: ['a'] });
  });

  it('leaves a tool with no outputSchema as it is', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    applyToolErrorResults(server);
    server.registerTool('plain', {}, async () => ({
      content: [{ type: 'text' as const, text: 'done' }],
    }));
    const client = await connected(server);

    const result = await client.callTool({ name: 'plain', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: 'text', text: 'done' }]);
  });

  it('passes the arguments through to the handler', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    applyToolErrorResults(server);
    server.registerTool(
      'echo',
      { inputSchema: { query: z.string() }, outputSchema },
      async ({ query }) => ({
        content: [{ type: 'text' as const, text: query }],
        structuredContent: { messages: [query] },
      }),
    );
    const client = await connected(server);

    const result = await client.callTool({
      name: 'echo',
      arguments: { query: 'from:someone' },
    });

    expect(result.structuredContent).toEqual({ messages: ['from:someone'] });
  });
});
