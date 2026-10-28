/**
 * @license
 * Copyright 2025 Google LLC
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
import { DocsService } from '../../services/DocsService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');

describe('DocsService Comments and Suggestions', () => {
  let docsService: DocsService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockDocsAPI: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    } as any;

    mockDocsAPI = {
      documents: {
        get: jest.fn(),
        create: jest.fn(),
        batchUpdate: jest.fn(),
      },
    };

    (google.docs as jest.Mock) = jest.fn().mockReturnValue(mockDocsAPI);

    docsService = new DocsService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(
      mockAuthClient as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getSuggestions', () => {
    it('should return suggestions as type text with JSON-stringified array', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          title: 'Test Document',
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: 'Suggested insertion',
                        suggestedInsertionIds: ['ins1'],
                      },
                      startIndex: 1,
                      endIndex: 20,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.title).toBe('Test Document');
      const { suggestions } = parsed;
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toEqual({
        type: 'insertion',
        text: 'Suggested insertion',
        suggestionIds: ['ins1'],
        startIndex: 1,
        endIndex: 20,
      });
    });

    it('should extract insertion suggestions correctly', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: 'new text',
                        suggestedInsertionIds: ['sug-1', 'sug-2'],
                      },
                      startIndex: 5,
                      endIndex: 13,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const { suggestions } = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('insertion');
      expect(suggestions[0].suggestionIds).toEqual(['sug-1', 'sug-2']);
    });

    it('should extract deletion suggestions correctly', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: 'deleted text',
                        suggestedDeletionIds: ['del-1'],
                      },
                      startIndex: 1,
                      endIndex: 13,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const { suggestions } = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('deletion');
      expect(suggestions[0].text).toBe('deleted text');
    });

    it('should extract style change suggestions correctly', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: 'styled text',
                        suggestedTextStyleChanges: {
                          'style-1': { textStyle: { bold: true } },
                        },
                        textStyle: { bold: true },
                      },
                      startIndex: 1,
                      endIndex: 12,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const { suggestions } = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('styleChange');
      expect(suggestions[0].suggestionIds).toEqual(['style-1']);
      expect(suggestions[0].textStyle).toEqual({ bold: true });
    });

    it('should extract paragraph style change suggestions', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  paragraphStyle: { namedStyleType: 'HEADING_1' },
                  suggestedParagraphStyleChanges: {
                    'sug-para-1': {
                      paragraphStyle: { namedStyleType: 'HEADING_2' },
                    },
                  },
                  elements: [
                    {
                      textRun: { content: 'Heading Text' },
                      startIndex: 1,
                      endIndex: 13,
                    },
                  ],
                },
                startIndex: 1,
                endIndex: 13,
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const { suggestions } = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('paragraphStyleChange');
      expect(suggestions[0].suggestionIds).toEqual(['sug-para-1']);
      expect(suggestions[0].namedStyleType).toBe('HEADING_2');
      expect(suggestions[0].text).toBe('Heading Text');
    });

    it('should handle tables with recursive element processing', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                table: {
                  tableRows: [
                    {
                      tableCells: [
                        {
                          content: [
                            {
                              paragraph: {
                                elements: [
                                  {
                                    textRun: {
                                      content: 'cell text',
                                      suggestedInsertionIds: ['cell-ins-1'],
                                    },
                                    startIndex: 5,
                                    endIndex: 14,
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const { suggestions } = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('insertion');
      expect(suggestions[0].text).toBe('cell text');
    });

    it('should handle empty document body', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: { body: null },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.suggestions).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      mockDocsAPI.documents.get.mockRejectedValue(new Error('Docs API failed'));

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({ error: 'Docs API failed' });
    });

    it('should create one suggestion entry per paragraph suggestion ID', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  suggestedParagraphStyleChanges: {
                    'sug-1': {
                      paragraphStyle: { namedStyleType: 'HEADING_1' },
                    },
                    'sug-2': {
                      paragraphStyle: { namedStyleType: 'HEADING_2' },
                    },
                  },
                  elements: [
                    {
                      textRun: { content: 'Some heading' },
                      startIndex: 1,
                      endIndex: 13,
                    },
                  ],
                },
                startIndex: 1,
                endIndex: 13,
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const { suggestions } = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(2);
      const types = suggestions.map((s: any) => s.type);
      expect(types).toEqual(['paragraphStyleChange', 'paragraphStyleChange']);
      const ids = suggestions.map((s: any) => s.suggestionIds[0]);
      expect(ids).toContain('sug-1');
      expect(ids).toContain('sug-2');
      const named = suggestions.map((s: any) => s.namedStyleType);
      expect(named).toContain('HEADING_1');
      expect(named).toContain('HEADING_2');
    });

    it('should handle undefined textRun.content with empty string fallback', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: undefined,
                        suggestedInsertionIds: ['ins-undef'],
                      },
                      startIndex: 1,
                      endIndex: 5,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const { suggestions } = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].text).toBe('');
    });
  });

  describe('suggest mode', () => {
    const singleTabDoc = (text: string) => ({
      data: {
        tabs: [
          {
            tabProperties: { tabId: 'tab-1' },
            documentTab: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 1 + text.length,
                          textRun: { content: text },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    it('should not send writeControl when suggest is omitted', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.writeText({ documentId: 'doc-1', text: 'Hi' });

      const call = mockDocsAPI.documents.batchUpdate.mock.calls[0][0];
      expect(call.requestBody).toEqual({
        requests: [{ insertText: { text: 'Hi' } }],
      });
    });

    it('should write text as a suggestion and report the suggestion IDs', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({
        data: {
          suggestionResponses: [{ createdSuggestionIds: ['suggest.abc'] }],
        },
      });

      const result = await docsService.writeText({
        documentId: 'doc-1',
        text: 'Hi',
        position: 'beginning',
        suggest: true,
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'doc-1',
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1, tabId: undefined },
                text: 'Hi',
              },
            },
          ],
          writeControl: { writeMode: 'SUGGEST' },
        },
      });
      expect(result.content[0].text).toContain('as suggestions');
      expect(result.content[0].text).toContain('suggest.abc');
    });

    it('should replace text as a suggestion against the inline-suggestions view', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(
        singleTabDoc('Hello world\n'),
      );
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({
        data: {
          suggestionResponses: [
            { createdSuggestionIds: ['suggest.1'] },
            { createdSuggestionIds: ['suggest.1'] },
          ],
        },
      });

      const result = await docsService.replaceText({
        documentId: 'doc-1',
        findText: 'world',
        replaceText: 'there',
        suggest: true,
      });

      expect(mockDocsAPI.documents.get).toHaveBeenCalledWith(
        expect.objectContaining({ suggestionsViewMode: 'SUGGESTIONS_INLINE' }),
      );
      const call = mockDocsAPI.documents.batchUpdate.mock.calls[0][0];
      expect(call.requestBody.writeControl).toEqual({ writeMode: 'SUGGEST' });
      expect(call.requestBody.requests).toHaveLength(2);
      expect(result.content[0].text).toContain('(suggestion IDs: suggest.1)');
    });

    it('should leave the replaceText read unchanged when suggest is omitted', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(
        singleTabDoc('Hello world\n'),
      );
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.replaceText({
        documentId: 'doc-1',
        findText: 'world',
        replaceText: 'there',
      });

      const getCall = mockDocsAPI.documents.get.mock.calls[0][0];
      expect(getCall).not.toHaveProperty('suggestionsViewMode');
      const call = mockDocsAPI.documents.batchUpdate.mock.calls[0][0];
      expect(call.requestBody).not.toHaveProperty('writeControl');
    });

    it('should format text as a suggestion', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.formatText({
        documentId: 'doc-1',
        formats: [{ startIndex: 1, endIndex: 5, style: 'bold' }],
        suggest: true,
      });

      const call = mockDocsAPI.documents.batchUpdate.mock.calls[0][0];
      expect(call.requestBody.writeControl).toEqual({ writeMode: 'SUGGEST' });
    });
  });

  describe('formatText bullets', () => {
    it('should add bullets, numbering and remove bullets on a range', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.formatText({
        documentId: 'doc-1',
        formats: [
          { startIndex: 1, endIndex: 10, style: 'bullets' },
          { startIndex: 10, endIndex: 20, style: 'numberedList' },
          { startIndex: 20, endIndex: 30, style: 'removeBullets' },
        ],
        tabId: 't.1',
      });

      const call = mockDocsAPI.documents.batchUpdate.mock.calls[0][0];
      expect(call.requestBody.requests).toEqual([
        {
          createParagraphBullets: {
            range: { startIndex: 1, endIndex: 10, tabId: 't.1' },
            bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
          },
        },
        {
          createParagraphBullets: {
            range: { startIndex: 10, endIndex: 20, tabId: 't.1' },
            bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
          },
        },
        {
          deleteParagraphBullets: {
            range: { startIndex: 20, endIndex: 30, tabId: 't.1' },
          },
        },
      ]);
    });
  });

  describe('getStructure', () => {
    const structuredDoc = {
      data: {
        title: 'Plan',
        tabs: [
          {
            tabProperties: { tabId: 't.0', title: 'Tab 1' },
            documentTab: {
              body: {
                content: [
                  { sectionBreak: {}, startIndex: 0, endIndex: 1 },
                  {
                    startIndex: 1,
                    endIndex: 7,
                    paragraph: {
                      paragraphStyle: { namedStyleType: 'HEADING_2' },
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 7,
                          textRun: { content: 'Goals\n', textStyle: {} },
                        },
                      ],
                    },
                  },
                  {
                    startIndex: 7,
                    endIndex: 20,
                    paragraph: {
                      paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
                      bullet: { listId: 'kix.list1', nestingLevel: 1 },
                      elements: [
                        {
                          startIndex: 7,
                          endIndex: 11,
                          textRun: {
                            content: 'Ship',
                            textStyle: { bold: true, italic: true },
                          },
                        },
                        {
                          startIndex: 11,
                          endIndex: 12,
                          person: { personProperties: { name: 'Ana' } },
                        },
                        {
                          startIndex: 12,
                          endIndex: 16,
                          textRun: {
                            content: ' it ',
                            textStyle: {},
                          },
                        },
                        {
                          startIndex: 16,
                          endIndex: 20,
                          textRun: {
                            content: 'doc\n',
                            textStyle: { link: { url: 'https://x.test' } },
                          },
                        },
                      ],
                    },
                  },
                  {
                    startIndex: 20,
                    endIndex: 30,
                    table: {
                      tableRows: [
                        {
                          tableCells: [
                            { content: [] },
                            {
                              content: [
                                {
                                  startIndex: 24,
                                  endIndex: 28,
                                  paragraph: {
                                    paragraphStyle: {
                                      namedStyleType: 'NORMAL_TEXT',
                                    },
                                    elements: [
                                      {
                                        startIndex: 24,
                                        endIndex: 28,
                                        textRun: {
                                          content: 'Cel\n',
                                          textStyle: { underline: true },
                                        },
                                      },
                                    ],
                                  },
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
          {
            tabProperties: { tabId: 't.1', title: 'Tab 2' },
            documentTab: { body: { content: [] } },
          },
        ],
      },
    };

    it('should return paragraphs with indices, style, bullets, tables and styled runs', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(structuredDoc);

      const result = await docsService.getStructure({ documentId: 'doc-1' });

      expect(mockDocsAPI.documents.get).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'doc-1',
          includeTabsContent: true,
          suggestionsViewMode: 'SUGGESTIONS_INLINE',
        }),
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.title).toBe('Plan');
      expect(parsed.tabs).toHaveLength(2);
      expect(parsed.tabs[0].paragraphs).toEqual([
        {
          startIndex: 1,
          endIndex: 7,
          text: 'Goals\n',
          namedStyle: 'HEADING_2',
        },
        {
          startIndex: 7,
          endIndex: 20,
          text: 'Ship￼ it doc\n',
          namedStyle: 'NORMAL_TEXT',
          bullet: { listId: 'kix.list1', nestingLevel: 1 },
          styledRuns: [
            {
              startIndex: 7,
              endIndex: 11,
              text: 'Ship',
              bold: true,
              italic: true,
            },
            {
              startIndex: 16,
              endIndex: 20,
              text: 'doc\n',
              link: 'https://x.test',
            },
          ],
        },
        {
          startIndex: 24,
          endIndex: 28,
          text: 'Cel\n',
          namedStyle: 'NORMAL_TEXT',
          table: { tableStartIndex: 20, row: 0, column: 1 },
          styledRuns: [
            { startIndex: 24, endIndex: 28, text: 'Cel\n', underline: true },
          ],
        },
      ]);
    });

    it('should report nesting level 0 for a top-level bullet', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          tabs: [
            {
              tabProperties: { tabId: 't.0' },
              documentTab: {
                body: {
                  content: [
                    {
                      startIndex: 1,
                      endIndex: 4,
                      paragraph: {
                        bullet: { listId: 'kix.a' },
                        elements: [
                          {
                            startIndex: 1,
                            endIndex: 4,
                            textRun: { content: 'Hi\n' },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });

      const result = await docsService.getStructure({ documentId: 'doc-1' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tabs[0].paragraphs[0].bullet).toEqual({
        listId: 'kix.a',
        nestingLevel: 0,
      });
    });

    it('should return only the requested tab', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(structuredDoc);

      const result = await docsService.getStructure({
        documentId: 'doc-1',
        tabId: 't.1',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tabs).toEqual([
        { tabId: 't.1', title: 'Tab 2', paragraphs: [] },
      ]);
    });

    it('should return an error for an unknown tab', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(structuredDoc);

      const result = await docsService.getStructure({
        documentId: 'doc-1',
        tabId: 'missing',
      });

      expect(result).toHaveProperty('isError', true);
      expect(JSON.parse(result.content[0].text).error).toBe(
        'Tab with ID missing not found.',
      );
    });
  });

  describe('addComment', () => {
    const docWithRuns = {
      data: {
        tabs: [
          {
            tabProperties: { tabId: 'tab-1' },
            documentTab: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 7,
                          textRun: { content: 'Plan: ' },
                        },
                        {
                          startIndex: 7,
                          endIndex: 8,
                          person: { personProperties: { name: 'Ana' } },
                        },
                        {
                          startIndex: 8,
                          endIndex: 30,
                          textRun: { content: ' ships the beta. beta\n' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    };

    it('should anchor the comment to the quoted text', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(docWithRuns);
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({
        data: {
          commentUpdateState: 'ALL_SAVED',
          replies: [
            {
              insertComment: {
                commentThread: {
                  commentId: 'c-1',
                  plainTextQuote: 'the beta',
                },
              },
            },
          ],
        },
      });

      const result = await docsService.addComment({
        documentId: 'doc-1',
        content: 'Which date?',
        quotedText: 'the beta',
      });

      expect(mockDocsAPI.documents.get).toHaveBeenCalledWith(
        expect.objectContaining({ suggestionsViewMode: 'SUGGESTIONS_INLINE' }),
      );
      // ' ships the beta' starts at index 8, so 'the beta' starts at 15.
      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'doc-1',
        requestBody: {
          requests: [
            {
              insertComment: {
                content: 'Which date?',
                range: { startIndex: 15, endIndex: 23, tabId: undefined },
              },
            },
          ],
        },
      });
      expect(result).not.toHaveProperty('isError');
      expect(JSON.parse(result.content[0].text)).toEqual({
        documentId: 'doc-1',
        commentId: 'c-1',
        quotedText: 'the beta',
        startIndex: 15,
        endIndex: 23,
      });
    });

    it('should anchor to the requested occurrence', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(docWithRuns);
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.addComment({
        documentId: 'doc-1',
        content: 'Again?',
        quotedText: 'beta',
        occurrence: 2,
      });

      const call = mockDocsAPI.documents.batchUpdate.mock.calls[0][0];
      expect(call.requestBody.requests[0].insertComment.range).toEqual({
        startIndex: 25,
        endIndex: 29,
        tabId: undefined,
      });
    });

    it('should not match a quote across a smart chip', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(docWithRuns);

      const result = await docsService.addComment({
        documentId: 'doc-1',
        content: 'Hmm',
        quotedText: 'Plan:  ships',
      });

      expect(result).toHaveProperty('isError', true);
      expect(JSON.parse(result.content[0].text).error).toContain(
        'Could not find occurrence 1',
      );
      expect(mockDocsAPI.documents.batchUpdate).not.toHaveBeenCalled();
    });

    it('should search the given tab', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          tabs: [
            {
              tabProperties: { tabId: 'tab-1' },
              documentTab: { body: { content: [] } },
              childTabs: [
                {
                  tabProperties: { tabId: 'tab-2' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          paragraph: {
                            elements: [
                              {
                                startIndex: 1,
                                endIndex: 7,
                                textRun: { content: 'Notes\n' },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      });
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.addComment({
        documentId: 'doc-1',
        content: 'Expand',
        quotedText: 'Notes',
        tabId: 'tab-2',
      });

      const call = mockDocsAPI.documents.batchUpdate.mock.calls[0][0];
      expect(call.requestBody.requests[0].insertComment.range).toEqual({
        startIndex: 1,
        endIndex: 6,
        tabId: 'tab-2',
      });
    });

    it('should accept an explicit index range without reading the document', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.addComment({
        documentId: 'doc-1',
        content: 'Note',
        startIndex: 3,
        endIndex: 9,
      });

      expect(mockDocsAPI.documents.get).not.toHaveBeenCalled();
      const call = mockDocsAPI.documents.batchUpdate.mock.calls[0][0];
      expect(call.requestBody.requests[0].insertComment.range).toEqual({
        startIndex: 3,
        endIndex: 9,
        tabId: undefined,
      });
      expect(call.requestBody).not.toHaveProperty('writeControl');
    });

    it('should refuse a comment with no anchor', async () => {
      const result = await docsService.addComment({
        documentId: 'doc-1',
        content: 'Floating comment',
      });

      expect(result).toHaveProperty('isError', true);
      expect(JSON.parse(result.content[0].text).error).toContain(
        'Provide quotedText',
      );
      expect(mockDocsAPI.documents.batchUpdate).not.toHaveBeenCalled();
    });

    it('should report an error when the API does not save the comment', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({
        data: { commentUpdateState: 'ALL_FAILED_UNKNOWN_REASON' },
      });

      const result = await docsService.addComment({
        documentId: 'doc-1',
        content: 'Note',
        startIndex: 1,
        endIndex: 2,
      });

      expect(result).toHaveProperty('isError', true);
      expect(JSON.parse(result.content[0].text).error).toContain(
        'comment was not saved',
      );
    });
  });

  describe('acceptSuggestion and rejectSuggestion', () => {
    it('should accept a suggestion by ID', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({
        data: {
          suggestionResponses: [{ acceptedSuggestionIds: ['suggest.1'] }],
        },
      });

      const result = await docsService.acceptSuggestion({
        documentId: 'doc-1',
        suggestionId: 'suggest.1',
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'doc-1',
        requestBody: {
          requests: [{ acceptSuggestion: { suggestionId: 'suggest.1' } }],
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        documentId: 'doc-1',
        suggestionId: 'suggest.1',
        acceptedSuggestionIds: ['suggest.1'],
      });
    });

    it('should reject a suggestion by ID', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({
        data: {
          suggestionResponses: [{ rejectedSuggestionIds: ['suggest.2'] }],
        },
      });

      const result = await docsService.rejectSuggestion({
        documentId: 'doc-1',
        suggestionId: 'suggest.2',
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'doc-1',
        requestBody: {
          requests: [{ rejectSuggestion: { suggestionId: 'suggest.2' } }],
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        documentId: 'doc-1',
        suggestionId: 'suggest.2',
        rejectedSuggestionIds: ['suggest.2'],
      });
    });

    it('should return an error when the API refuses', async () => {
      mockDocsAPI.documents.batchUpdate.mockRejectedValue(
        new Error('The caller does not have permission'),
      );

      const result = await docsService.acceptSuggestion({
        documentId: 'doc-1',
        suggestionId: 'suggest.1',
      });

      expect(result).toHaveProperty('isError', true);
      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'The caller does not have permission',
      });
    });
  });
});
