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
import { SheetsService } from '../../services/SheetsService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');

describe('SheetsService', () => {
  let sheetsService: SheetsService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockSheetsAPI: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock AuthManager
    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    } as any;

    // Create mock Sheets API
    mockSheetsAPI = {
      spreadsheets: {
        get: jest.fn(),
        create: jest.fn(),
        batchUpdate: jest.fn(),
        values: {
          get: jest.fn(),
          update: jest.fn(),
          append: jest.fn(),
          clear: jest.fn(),
        },
      },
    };

    // Mock the google constructors
    (google.sheets as jest.Mock) = jest.fn().mockReturnValue(mockSheetsAPI);

    // Create SheetsService instance
    sheetsService = new SheetsService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(
      mockAuthClient as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getText', () => {
    it('should extract text from a spreadsheet in default format', async () => {
      const mockSpreadsheet = {
        data: {
          properties: {
            title: 'Test Spreadsheet',
          },
          sheets: [
            { properties: { title: 'Sheet1' } },
            { properties: { title: 'Sheet2' } },
          ],
        },
      };

      const mockSheet1Data = {
        data: {
          values: [
            ['Header1', 'Header2', 'Header3'],
            ['Row1Col1', 'Row1Col2', 'Row1Col3'],
            ['Row2Col1', 'Row2Col2', 'Row2Col3'],
          ],
        },
      };

      const mockSheet2Data = {
        data: {
          values: [
            ['A', 'B'],
            ['1', '2'],
          ],
        },
      };

      mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);
      mockSheetsAPI.spreadsheets.values.get
        .mockResolvedValueOnce(mockSheet1Data)
        .mockResolvedValueOnce(mockSheet2Data);

      const result = await sheetsService.getText({
        spreadsheetId: 'test-spreadsheet-id',
      });

      expect(mockSheetsAPI.spreadsheets.get).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet-id',
        includeGridData: false,
      });

      expect(mockSheetsAPI.spreadsheets.values.get).toHaveBeenCalledTimes(2);
      expect(mockSheetsAPI.spreadsheets.values.get).toHaveBeenNthCalledWith(1, {
        spreadsheetId: 'test-spreadsheet-id',
        range: "'Sheet1'",
      });
      expect(mockSheetsAPI.spreadsheets.values.get).toHaveBeenNthCalledWith(2, {
        spreadsheetId: 'test-spreadsheet-id',
        range: "'Sheet2'",
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Test Spreadsheet');
      expect(result.content[0].text).toContain('Sheet1');
      expect(result.content[0].text).toContain('Header1 | Header2 | Header3');
      expect(result.content[0].text).toContain('Sheet2');
      expect(result.content[0].text).toContain('A | B');
    });

    it('should extract text in CSV format', async () => {
      const mockSpreadsheet = {
        data: {
          properties: {
            title: 'CSV Test',
          },
          sheets: [{ properties: { title: 'Sheet1' } }],
        },
      };

      const mockSheetData = {
        data: {
          values: [
            ['Name', 'Age', 'City'],
            ['John, Jr.', '25', 'New York'],
            ['Jane', '30', 'San Francisco'],
          ],
        },
      };

      mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);
      mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockSheetData);

      const result = await sheetsService.getText({
        spreadsheetId: 'test-spreadsheet-id',
        format: 'csv',
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Name,Age,City');
      expect(result.content[0].text).toContain('"John, Jr.",25,New York');
    });

    it('should extract text in JSON format', async () => {
      const mockSpreadsheet = {
        data: {
          properties: {
            title: 'JSON Test',
          },
          sheets: [{ properties: { title: 'Sheet1' } }],
        },
      };

      const mockSheetData = {
        data: {
          values: [
            ['A', 'B'],
            ['1', '2'],
          ],
        },
      };

      mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);
      mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockSheetData);

      const result = await sheetsService.getText({
        spreadsheetId: 'test-spreadsheet-id',
        format: 'json',
      });

      expect(result.content[0].type).toBe('text');
      const jsonResult = JSON.parse(result.content[0].text);
      expect(jsonResult.Sheet1).toEqual([
        ['A', 'B'],
        ['1', '2'],
      ]);
    });

    it('should handle empty sheets', async () => {
      const mockSpreadsheet = {
        data: {
          properties: {
            title: 'Empty Test',
          },
          sheets: [{ properties: { title: 'EmptySheet' } }],
        },
      };

      const mockSheetData = {
        data: {
          values: [],
        },
      };

      mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);
      mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockSheetData);

      const result = await sheetsService.getText({
        spreadsheetId: 'test-spreadsheet-id',
      });

      expect(result.content[0].text).toContain('EmptySheet');
      expect(result.content[0].text).toContain('(Empty sheet)');
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.get.mockRejectedValue(new Error('API Error'));

      const result = await sheetsService.getText({
        spreadsheetId: 'error-spreadsheet-id',
      });

      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('API Error');
    });
  });

  describe('getRange', () => {
    it('should get values from a specific range', async () => {
      const mockRangeData = {
        data: {
          range: 'Sheet1!A1:B3',
          values: [
            ['A1', 'B1'],
            ['A2', 'B2'],
            ['A3', 'B3'],
          ],
        },
      };

      mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockRangeData);

      const result = await sheetsService.getRange({
        spreadsheetId: 'test-spreadsheet-id',
        range: 'Sheet1!A1:B3',
      });

      expect(mockSheetsAPI.spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet-id',
        range: 'Sheet1!A1:B3',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.range).toBe('Sheet1!A1:B3');
      expect(response.values).toHaveLength(3);
      expect(response.values[0]).toEqual(['A1', 'B1']);
    });

    it('should handle empty ranges', async () => {
      const mockRangeData = {
        data: {
          range: 'Sheet1!Z100:Z200',
          values: [],
        },
      };

      mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockRangeData);

      const result = await sheetsService.getRange({
        spreadsheetId: 'test-spreadsheet-id',
        range: 'Sheet1!Z100:Z200',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.values).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.values.get.mockRejectedValue(
        new Error('Range Error'),
      );

      const result = await sheetsService.getRange({
        spreadsheetId: 'error-id',
        range: 'InvalidRange',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Range Error');
    });
  });

  describe('getMetadata', () => {
    it('should retrieve spreadsheet metadata', async () => {
      const mockSpreadsheet = {
        data: {
          spreadsheetId: 'test-id',
          properties: {
            title: 'Test Spreadsheet',
            locale: 'en_US',
            timeZone: 'America/New_York',
          },
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: 'Sheet1',
                index: 0,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 26,
                },
              },
            },
            {
              properties: {
                sheetId: 1,
                title: 'Sheet2',
                index: 1,
                gridProperties: {
                  rowCount: 500,
                  columnCount: 10,
                },
              },
            },
          ],
        },
      };

      mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);

      const result = await sheetsService.getMetadata({
        spreadsheetId: 'test-id',
      });
      const metadata = JSON.parse(result.content[0].text);

      expect(mockSheetsAPI.spreadsheets.get).toHaveBeenCalledWith({
        spreadsheetId: 'test-id',
        includeGridData: false,
      });

      expect(metadata.spreadsheetId).toBe('test-id');
      expect(metadata.title).toBe('Test Spreadsheet');
      expect(metadata.locale).toBe('en_US');
      expect(metadata.timeZone).toBe('America/New_York');
      expect(metadata.sheets).toHaveLength(2);
      expect(metadata.sheets[0].title).toBe('Sheet1');
      expect(metadata.sheets[0].rowCount).toBe(1000);
      expect(metadata.sheets[0].columnCount).toBe(26);
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.get.mockRejectedValue(
        new Error('Metadata Error'),
      );

      const result = await sheetsService.getMetadata({
        spreadsheetId: 'error-id',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe('Metadata Error');
    });
  });

  describe('updateRange', () => {
    it('should default to USER_ENTERED so formulas are evaluated', async () => {
      mockSheetsAPI.spreadsheets.values.update.mockResolvedValue({
        data: {
          updatedRange: 'Vendors!A2:C2',
          updatedRows: 1,
          updatedColumns: 3,
          updatedCells: 3,
        },
      });

      const result = await sheetsService.updateRange({
        spreadsheetId: 'https://docs.google.com/spreadsheets/d/test-id/edit',
        range: 'Vendors!A2:C2',
        values: [['Acme', '=1+1', 120]],
      });

      expect(mockSheetsAPI.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: 'test-id',
        range: 'Vendors!A2:C2',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          range: 'Vendors!A2:C2',
          majorDimension: 'ROWS',
          values: [['Acme', '=1+1', 120]],
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        updatedRange: 'Vendors!A2:C2',
        updatedRows: 1,
        updatedColumns: 3,
        updatedCells: 3,
      });
    });

    it('should pass through an explicit RAW valueInputOption', async () => {
      mockSheetsAPI.spreadsheets.values.update.mockResolvedValue({ data: {} });

      await sheetsService.updateRange({
        spreadsheetId: 'test-id',
        range: 'A1',
        values: [['=1+1']],
        valueInputOption: 'RAW',
      });

      expect(mockSheetsAPI.spreadsheets.values.update).toHaveBeenCalledWith(
        expect.objectContaining({ valueInputOption: 'RAW' }),
      );
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.values.update.mockRejectedValue(
        new Error('The caller does not have permission'),
      );

      const result = await sheetsService.updateRange({
        spreadsheetId: 'test-id',
        range: 'A1',
        values: [['x']],
      });

      expect(JSON.parse(result.content[0].text).error).toBe(
        'The caller does not have permission',
      );
    });
  });

  describe('appendRows', () => {
    it('should insert rows after the table rather than overwrite, as USER_ENTERED', async () => {
      mockSheetsAPI.spreadsheets.values.append.mockResolvedValue({
        data: {
          tableRange: 'Vendors!A1:C4',
          updates: {
            updatedRange: 'Vendors!A5:C6',
            updatedRows: 2,
            updatedColumns: 3,
            updatedCells: 6,
          },
        },
      });

      const result = await sheetsService.appendRows({
        spreadsheetId: 'test-id',
        range: 'Vendors!A1',
        values: [
          ['Acme', 'acme@example.com', true],
          ['Bolt', 'bolt@example.com', false],
        ],
      });

      expect(mockSheetsAPI.spreadsheets.values.append).toHaveBeenCalledWith({
        spreadsheetId: 'test-id',
        range: 'Vendors!A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          majorDimension: 'ROWS',
          values: [
            ['Acme', 'acme@example.com', true],
            ['Bolt', 'bolt@example.com', false],
          ],
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        tableRange: 'Vendors!A1:C4',
        updatedRange: 'Vendors!A5:C6',
        updatedRows: 2,
        updatedColumns: 3,
        updatedCells: 6,
      });
    });

    it('should pass through an explicit RAW valueInputOption', async () => {
      mockSheetsAPI.spreadsheets.values.append.mockResolvedValue({ data: {} });

      await sheetsService.appendRows({
        spreadsheetId: 'test-id',
        range: 'A1',
        values: [['=1+1']],
        valueInputOption: 'RAW',
      });

      expect(mockSheetsAPI.spreadsheets.values.append).toHaveBeenCalledWith(
        expect.objectContaining({ valueInputOption: 'RAW' }),
      );
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.values.append.mockRejectedValue(
        new Error('Unable to parse range: Nope!A1'),
      );

      const result = await sheetsService.appendRows({
        spreadsheetId: 'test-id',
        range: 'Nope!A1',
        values: [['x']],
      });

      expect(JSON.parse(result.content[0].text).error).toBe(
        'Unable to parse range: Nope!A1',
      );
    });
  });

  describe('tab tools', () => {
    const existing = {
      data: {
        sheets: [
          { properties: { sheetId: 0, title: 'Sheet1' } },
          { properties: { sheetId: 42, title: 'Vendors' } },
        ],
      },
    };

    beforeEach(() => {
      mockSheetsAPI.spreadsheets.get.mockResolvedValue(existing);
      mockSheetsAPI.spreadsheets.batchUpdate.mockResolvedValue({ data: {} });
    });

    describe('addSheet', () => {
      it('should add a sheet and return its id and title', async () => {
        mockSheetsAPI.spreadsheets.batchUpdate.mockResolvedValue({
          data: {
            replies: [
              {
                addSheet: { properties: { sheetId: 7, title: 'Q3', index: 1 } },
              },
            ],
          },
        });

        const result = await sheetsService.addSheet({
          spreadsheetId: 'https://docs.google.com/spreadsheets/d/test-id/edit',
          title: 'Q3',
          index: 1,
          rowCount: 50,
          columnCount: 5,
        });

        expect(mockSheetsAPI.spreadsheets.batchUpdate).toHaveBeenCalledWith({
          spreadsheetId: 'test-id',
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: 'Q3',
                    index: 1,
                    gridProperties: { rowCount: 50, columnCount: 5 },
                  },
                },
              },
            ],
          },
        });
        expect(JSON.parse(result.content[0].text)).toEqual({
          sheetId: 7,
          title: 'Q3',
          index: 1,
        });
      });

      it('should reject a duplicate title, ignoring case', async () => {
        const result = await sheetsService.addSheet({
          spreadsheetId: 'test-id',
          title: 'vendors',
        });

        expect(JSON.parse(result.content[0].text).error).toContain(
          'already exists (sheetId 42)',
        );
        expect(mockSheetsAPI.spreadsheets.batchUpdate).not.toHaveBeenCalled();
      });
    });

    describe('deleteSheet', () => {
      it('should delete a sheet', async () => {
        const result = await sheetsService.deleteSheet({
          spreadsheetId: 'test-id',
          sheetId: 42,
        });

        expect(mockSheetsAPI.spreadsheets.batchUpdate).toHaveBeenCalledWith({
          spreadsheetId: 'test-id',
          requestBody: { requests: [{ deleteSheet: { sheetId: 42 } }] },
        });
        expect(JSON.parse(result.content[0].text)).toEqual({
          deleted: true,
          sheetId: 42,
          title: 'Vendors',
        });
      });

      it('should report an unknown sheetId', async () => {
        const result = await sheetsService.deleteSheet({
          spreadsheetId: 'test-id',
          sheetId: 99,
        });

        const error = JSON.parse(result.content[0].text).error;
        expect(error).toContain('No sheet with sheetId 99');
        expect(error).toContain('42 ("Vendors")');
        expect(mockSheetsAPI.spreadsheets.batchUpdate).not.toHaveBeenCalled();
      });
    });

    describe('renameSheet', () => {
      it('should rename with a title-only field mask', async () => {
        const result = await sheetsService.renameSheet({
          spreadsheetId: 'test-id',
          sheetId: 42,
          title: 'Suppliers',
        });

        expect(mockSheetsAPI.spreadsheets.batchUpdate).toHaveBeenCalledWith({
          spreadsheetId: 'test-id',
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: { sheetId: 42, title: 'Suppliers' },
                  fields: 'title',
                },
              },
            ],
          },
        });
        expect(JSON.parse(result.content[0].text)).toEqual({
          sheetId: 42,
          title: 'Suppliers',
        });
      });

      it('should allow renaming a sheet to its own title', async () => {
        const result = await sheetsService.renameSheet({
          spreadsheetId: 'test-id',
          sheetId: 42,
          title: 'VENDORS',
        });

        expect(JSON.parse(result.content[0].text).error).toBeUndefined();
      });

      it('should reject a title used by another sheet', async () => {
        const result = await sheetsService.renameSheet({
          spreadsheetId: 'test-id',
          sheetId: 42,
          title: 'Sheet1',
        });

        expect(JSON.parse(result.content[0].text).error).toContain(
          'already exists (sheetId 0)',
        );
      });

      it('should report an unknown sheetId', async () => {
        const result = await sheetsService.renameSheet({
          spreadsheetId: 'test-id',
          sheetId: 99,
          title: 'X',
        });

        expect(JSON.parse(result.content[0].text).error).toContain(
          'No sheet with sheetId 99',
        );
      });
    });

    describe('updateSheetProperties', () => {
      it('should build a field mask from only the provided properties', async () => {
        const result = await sheetsService.updateSheetProperties({
          spreadsheetId: 'test-id',
          sheetId: 42,
          index: 0,
          frozenRowCount: 1,
          frozenColumnCount: 2,
          hidden: false,
          tabColor: '#FF0000',
        });

        expect(mockSheetsAPI.spreadsheets.batchUpdate).toHaveBeenCalledWith({
          spreadsheetId: 'test-id',
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: 42,
                    index: 0,
                    hidden: false,
                    tabColor: { red: 1, green: 0, blue: 0 },
                    gridProperties: { frozenRowCount: 1, frozenColumnCount: 2 },
                  },
                  fields:
                    'index,hidden,tabColor,gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
                },
              },
            ],
          },
        });
        expect(JSON.parse(result.content[0].text).sheetId).toBe(42);
      });

      it('should leave unspecified properties out of the mask', async () => {
        await sheetsService.updateSheetProperties({
          spreadsheetId: 'test-id',
          sheetId: 42,
          frozenRowCount: 0,
        });

        const call = mockSheetsAPI.spreadsheets.batchUpdate.mock.calls[0][0];
        expect(call.requestBody.requests[0].updateSheetProperties.fields).toBe(
          'gridProperties.frozenRowCount',
        );
      });

      it('should reject an invalid tab color', async () => {
        const result = await sheetsService.updateSheetProperties({
          spreadsheetId: 'test-id',
          sheetId: 42,
          tabColor: 'red',
        });

        expect(JSON.parse(result.content[0].text).error).toContain(
          'Invalid tabColor',
        );
      });

      it('should reject a call with nothing to update', async () => {
        const result = await sheetsService.updateSheetProperties({
          spreadsheetId: 'test-id',
          sheetId: 42,
        });

        expect(JSON.parse(result.content[0].text).error).toContain(
          'Nothing to update',
        );
      });

      it('should report an unknown sheetId', async () => {
        const result = await sheetsService.updateSheetProperties({
          spreadsheetId: 'test-id',
          sheetId: 99,
          hidden: true,
        });

        expect(JSON.parse(result.content[0].text).error).toContain(
          'No sheet with sheetId 99',
        );
        expect(mockSheetsAPI.spreadsheets.batchUpdate).not.toHaveBeenCalled();
      });
    });
  });

  describe('structure and formatting tools', () => {
    const body = (r: { content: { text: string }[] }) =>
      JSON.parse(r.content[0].text);
    const lastRequest = () =>
      mockSheetsAPI.spreadsheets.batchUpdate.mock.calls[0][0].requestBody
        .requests[0];

    beforeEach(() => {
      mockSheetsAPI.spreadsheets.get.mockResolvedValue({
        data: {
          sheets: [
            { properties: { sheetId: 0, title: 'Sheet1' } },
            { properties: { sheetId: 42, title: 'Vendors' } },
          ],
        },
      });
      mockSheetsAPI.spreadsheets.batchUpdate.mockResolvedValue({ data: {} });
    });

    it('createSpreadsheet creates named tabs and returns ids', async () => {
      mockSheetsAPI.spreadsheets.create.mockResolvedValue({
        data: {
          spreadsheetId: 'new-id',
          spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/new-id',
          sheets: [{ properties: { sheetId: 0, title: 'Q1' } }],
        },
      });
      const result = await sheetsService.createSpreadsheet({
        title: 'Budget',
        sheetTitles: ['Q1'],
      });
      expect(
        mockSheetsAPI.spreadsheets.create.mock.calls[0][0].requestBody,
      ).toEqual({
        properties: { title: 'Budget' },
        sheets: [{ properties: { title: 'Q1' } }],
      });
      expect(body(result)).toEqual({
        spreadsheetId: 'new-id',
        url: 'https://docs.google.com/spreadsheets/d/new-id',
        sheets: [{ sheetId: 0, title: 'Q1' }],
      });
    });

    it('createSpreadsheet rejects duplicate tab titles', async () => {
      const result = await sheetsService.createSpreadsheet({
        title: 'Budget',
        sheetTitles: ['A', 'a'],
      });
      expect(body(result).error).toContain('unique');
      expect(mockSheetsAPI.spreadsheets.create).not.toHaveBeenCalled();
    });

    it('duplicateSheet sends the source, title and index', async () => {
      mockSheetsAPI.spreadsheets.batchUpdate.mockResolvedValue({
        data: {
          replies: [
            {
              duplicateSheet: {
                properties: { sheetId: 9, title: 'V2', index: 1 },
              },
            },
          ],
        },
      });
      const result = await sheetsService.duplicateSheet({
        spreadsheetId: 'test-id',
        sheetId: 42,
        newTitle: 'V2',
        index: 1,
      });
      expect(lastRequest()).toEqual({
        duplicateSheet: {
          sourceSheetId: 42,
          newSheetName: 'V2',
          insertSheetIndex: 1,
        },
      });
      expect(body(result)).toEqual({ sheetId: 9, title: 'V2', index: 1 });
    });

    it('duplicateSheet rejects a title that is already taken', async () => {
      const result = await sheetsService.duplicateSheet({
        spreadsheetId: 'test-id',
        sheetId: 42,
        newTitle: 'sheet1',
      });
      expect(body(result).error).toContain('already exists');
      expect(mockSheetsAPI.spreadsheets.batchUpdate).not.toHaveBeenCalled();
    });

    it('clearRange clears values only', async () => {
      mockSheetsAPI.spreadsheets.values.clear.mockResolvedValue({
        data: { clearedRange: 'Sheet1!A2:D100' },
      });
      const result = await sheetsService.clearRange({
        spreadsheetId: 'test-id',
        range: 'Sheet1!A2:D100',
      });
      expect(mockSheetsAPI.spreadsheets.values.clear).toHaveBeenCalledWith({
        spreadsheetId: 'test-id',
        range: 'Sheet1!A2:D100',
      });
      expect(body(result)).toEqual({ clearedRange: 'Sheet1!A2:D100' });
    });

    it('formatRange bolds a header row with a field mask', async () => {
      await sheetsService.formatRange({
        spreadsheetId: 'test-id',
        sheetId: 42,
        range: '1:1',
        bold: true,
      });
      expect(lastRequest()).toEqual({
        repeatCell: {
          range: { sheetId: 42, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      });
    });

    it('formatRange applies a currency format to A1 columns', async () => {
      await sheetsService.formatRange({
        spreadsheetId: 'test-id',
        sheetId: 0,
        range: 'C2:D10',
        numberFormat: { type: 'CURRENCY', pattern: '$#,##0.00' },
      });
      expect(lastRequest().repeatCell).toEqual({
        range: {
          sheetId: 0,
          startRowIndex: 1,
          endRowIndex: 10,
          startColumnIndex: 2,
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'CURRENCY', pattern: '$#,##0.00' },
          },
        },
        fields: 'userEnteredFormat.numberFormat',
      });
    });

    it('formatRange rejects bad ranges and empty formats', async () => {
      const bad = await sheetsService.formatRange({
        spreadsheetId: 'test-id',
        sheetId: 0,
        range: 'Sheet1!A1',
        bold: true,
      });
      expect(body(bad).error).toContain('Invalid range');
      const empty = await sheetsService.formatRange({
        spreadsheetId: 'test-id',
        sheetId: 0,
        range: 'A1',
      });
      expect(body(empty).error).toContain('Nothing to format');
      expect(mockSheetsAPI.spreadsheets.batchUpdate).not.toHaveBeenCalled();
    });

    it('setColumnWidth converts letters to a dimension range', async () => {
      await sheetsService.setColumnWidth({
        spreadsheetId: 'test-id',
        sheetId: 0,
        columns: 'A:C',
        pixelSize: 180,
      });
      expect(lastRequest()).toEqual({
        updateDimensionProperties: {
          range: {
            sheetId: 0,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: 3,
          },
          properties: { pixelSize: 180 },
          fields: 'pixelSize',
        },
      });
    });

    it('insertDimension inserts rows, inheriting from the row before', async () => {
      await sheetsService.insertDimension({
        spreadsheetId: 'test-id',
        sheetId: 0,
        dimension: 'ROWS',
        startIndex: 2,
        count: 3,
      });
      expect(lastRequest()).toEqual({
        insertDimension: {
          range: { sheetId: 0, dimension: 'ROWS', startIndex: 2, endIndex: 5 },
          inheritFromBefore: true,
        },
      });
    });

    it('deleteDimension deletes columns', async () => {
      const result = await sheetsService.deleteDimension({
        spreadsheetId: 'test-id',
        sheetId: 0,
        dimension: 'COLUMNS',
        startIndex: 1,
        count: 2,
      });
      expect(lastRequest()).toEqual({
        deleteDimension: {
          range: {
            sheetId: 0,
            dimension: 'COLUMNS',
            startIndex: 1,
            endIndex: 3,
          },
        },
      });
      expect(body(result).deleted).toBe(2);
    });

    it('deleteDimension reports an unknown sheetId without calling the API', async () => {
      const result = await sheetsService.deleteDimension({
        spreadsheetId: 'test-id',
        sheetId: 99,
        dimension: 'ROWS',
        startIndex: 0,
        count: 1,
      });
      expect(body(result).error).toContain('No sheet with sheetId 99');
      expect(mockSheetsAPI.spreadsheets.batchUpdate).not.toHaveBeenCalled();
    });

    it('sortRange sorts by an absolute column index', async () => {
      await sheetsService.sortRange({
        spreadsheetId: 'test-id',
        sheetId: 0,
        range: 'A2:D50',
        sortColumn: 'C',
        descending: true,
      });
      expect(lastRequest()).toEqual({
        sortRange: {
          range: {
            sheetId: 0,
            startRowIndex: 1,
            endRowIndex: 50,
            startColumnIndex: 0,
            endColumnIndex: 4,
          },
          sortSpecs: [{ dimensionIndex: 2, sortOrder: 'DESCENDING' }],
        },
      });
    });

    it('sortRange rejects a sort column outside the range', async () => {
      const result = await sheetsService.sortRange({
        spreadsheetId: 'test-id',
        sheetId: 0,
        range: 'A2:D50',
        sortColumn: 'F',
      });
      expect(body(result).error).toContain('outside the range');
      expect(mockSheetsAPI.spreadsheets.batchUpdate).not.toHaveBeenCalled();
    });
  });
});
