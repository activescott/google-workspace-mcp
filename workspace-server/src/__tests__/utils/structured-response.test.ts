import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createStructuredResponse } from '../../utils/structured-response';
import { z } from 'zod';

jest.mock('../../utils/logger');

describe('createStructuredResponse', () => {
  const schema = z.object({
    id: z.string(),
    name: z.string(),
  });

  it('should return both content and structuredContent when data is valid', () => {
    const data = { id: '123', name: 'Test' };
    const result = createStructuredResponse(data, schema, 'test.tool');

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(data);
    expect(result.structuredContent).toEqual(data);
  });

  it('should omit structuredContent when data fails validation', () => {
    const data = { id: 123, name: 'Test' }; // id is number, not string
    const result = createStructuredResponse(data, schema, 'test.tool');

    expect(result.content).toHaveLength(1);
    expect(JSON.parse(result.content[0].text)).toEqual(data);
    expect(result.structuredContent).toBeUndefined();
  });

  it('should handle passthrough schemas for extra fields', () => {
    const passthroughSchema = z.object({
      id: z.string(),
    }).passthrough();

    const data = { id: '123', extra: 'field' };
    const result = createStructuredResponse(data, passthroughSchema, 'test.tool');

    expect(result.structuredContent).toEqual(data);
  });
});
