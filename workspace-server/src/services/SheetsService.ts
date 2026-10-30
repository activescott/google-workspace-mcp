/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, sheets_v4 } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { extractDocId } from '../utils/IdUtils';
import { gaxiosOptions } from '../utils/GaxiosConfig';

type CellValue = string | number | boolean;

export class SheetsService {
  constructor(private authManager: AuthManager) {}

  private async getSheetsClient(): Promise<sheets_v4.Sheets> {
    const auth = await this.authManager.getAuthenticatedClient();
    const options = { ...gaxiosOptions, auth };
    return google.sheets({ version: 'v4', ...options });
  }

  public getText = async ({
    spreadsheetId,
    format = 'text',
  }: {
    spreadsheetId: string;
    format?: 'text' | 'csv' | 'json';
  }) => {
    logToFile(
      `[SheetsService] Starting getText for spreadsheet: ${spreadsheetId} with format: ${format}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      // Get spreadsheet metadata
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: id,
        includeGridData: false,
      });

      let content = '';
      const jsonData: Record<string, any[][]> = {};

      // Add spreadsheet title (except for JSON format)
      if (spreadsheet.data.properties?.title && format !== 'json') {
        content += `Spreadsheet Title: ${spreadsheet.data.properties.title}\n\n`;
      }

      // Get all sheet names
      const sheetNames =
        spreadsheet.data.sheets?.map((sheet) => sheet.properties?.title) || [];

      // Get data from all sheets
      for (const sheetName of sheetNames) {
        if (!sheetName) continue;

        try {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: id,
            range: `'${sheetName}'`,
          });

          const values = response.data.values || [];

          if (format === 'json') {
            // Collect data for JSON structure
            jsonData[sheetName] = values;
          } else {
            // Add sheet name as context
            content += `Sheet Name: ${sheetName}\n`;

            if (values.length === 0) {
              content += '(Empty sheet)\n';
            } else {
              // Process each row
              values.forEach((row) => {
                if (format === 'csv') {
                  // Convert to CSV format
                  const csvRow = row
                    .map((cell) => {
                      // Escape quotes and wrap in quotes if contains comma or quotes
                      const cellStr = String(cell || '');
                      if (
                        cellStr.includes(',') ||
                        cellStr.includes('"') ||
                        cellStr.includes('\n')
                      ) {
                        return `"${cellStr.replace(/"/g, '""')}"`;
                      }
                      return cellStr;
                    })
                    .join(',');
                  content += csvRow + '\n';
                } else {
                  // Plain text format with pipe separators for readability
                  content += row.map((cell) => cell || '').join(' | ') + '\n';
                }
              });
            }
            content += '\n';
          }
        } catch (sheetError) {
          logToFile(
            `[SheetsService] Error reading sheet ${sheetName}: ${sheetError}`,
          );
          if (format === 'json') {
            // For JSON format, we'll skip sheets with errors
            logToFile(
              `[SheetsService] Skipping sheet ${sheetName} in JSON output due to error`,
            );
          } else {
            content += `Sheet Name: ${sheetName}\n(Error reading sheet)\n\n`;
          }
        }
      }

      if (format === 'json') {
        // Generate clean JSON output from collected data
        content = JSON.stringify(jsonData, null, 2);
      }

      logToFile(`[SheetsService] Finished getText for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: content.trim(),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[SheetsService] Error during sheets.getText: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  public getRange = async ({
    spreadsheetId,
    range,
  }: {
    spreadsheetId: string;
    range: string;
  }) => {
    logToFile(
      `[SheetsService] Starting getRange for spreadsheet: ${spreadsheetId}, range: ${range}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: range,
      });

      const values = response.data.values || [];

      logToFile(`[SheetsService] Finished getRange for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              range: response.data.range,
              values: values,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SheetsService] Error during sheets.getRange: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  public getMetadata = async ({ spreadsheetId }: { spreadsheetId: string }) => {
    logToFile(
      `[SheetsService] Starting getMetadata for spreadsheet: ${spreadsheetId}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: id,
        includeGridData: false,
      });

      const metadata = {
        spreadsheetId: spreadsheet.data.spreadsheetId,
        title: spreadsheet.data.properties?.title,
        sheets: spreadsheet.data.sheets?.map((sheet) => ({
          sheetId: sheet.properties?.sheetId,
          title: sheet.properties?.title,
          index: sheet.properties?.index,
          rowCount: sheet.properties?.gridProperties?.rowCount,
          columnCount: sheet.properties?.gridProperties?.columnCount,
        })),
        locale: spreadsheet.data.properties?.locale,
        timeZone: spreadsheet.data.properties?.timeZone,
      };

      logToFile(`[SheetsService] Finished getMetadata for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(metadata),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SheetsService] Error during sheets.getMetadata: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  public updateRange = async ({
    spreadsheetId,
    range,
    values,
  }: {
    spreadsheetId: string;
    range: string;
    values: CellValue[][];
  }) => {
    logToFile(
      `[SheetsService] Starting updateRange for spreadsheet: ${spreadsheetId}, range: ${range}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: range,
        valueInputOption: 'RAW',
        requestBody: { range: range, majorDimension: 'ROWS', values: values },
      });

      logToFile(`[SheetsService] Finished updateRange for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              updatedRange: response.data.updatedRange,
              updatedRows: response.data.updatedRows,
              updatedColumns: response.data.updatedColumns,
              updatedCells: response.data.updatedCells,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SheetsService] Error during sheets.updateRange: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  public appendRows = async ({
    spreadsheetId,
    range,
    values,
  }: {
    spreadsheetId: string;
    range: string;
    values: CellValue[][];
  }) => {
    logToFile(
      `[SheetsService] Starting appendRows for spreadsheet: ${spreadsheetId}, range: ${range}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      // INSERT_ROWS so rows below the table are pushed down, not overwritten.
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: id,
        range: range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { majorDimension: 'ROWS', values: values },
      });

      const updates = response.data.updates;
      logToFile(`[SheetsService] Finished appendRows for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              tableRange: response.data.tableRange,
              updatedRange: updates?.updatedRange,
              updatedRows: updates?.updatedRows,
              updatedColumns: updates?.updatedColumns,
              updatedCells: updates?.updatedCells,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SheetsService] Error during sheets.appendRows: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  private errorResult(tool: string, error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logToFile(`[SheetsService] Error during ${tool}: ${errorMessage}`);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: errorMessage }),
        },
      ],
    };
  }

  private jsonResult(body: unknown) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(body) }],
    };
  }

  private async listTabs(
    sheets: sheets_v4.Sheets,
    spreadsheetId: string,
  ): Promise<sheets_v4.Schema$SheetProperties[]> {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(sheetId,title)',
    });
    return (response.data.sheets ?? []).map((s) => s.properties ?? {});
  }

  private requireTab(
    tabs: sheets_v4.Schema$SheetProperties[],
    sheetId: number,
  ): sheets_v4.Schema$SheetProperties {
    const tab = tabs.find((t) => t.sheetId === sheetId);
    if (!tab) {
      const known = tabs.map((t) => `${t.sheetId} ("${t.title}")`).join(', ');
      throw new Error(
        `No sheet with sheetId ${sheetId} in this spreadsheet. Existing sheets: ${known}`,
      );
    }
    return tab;
  }

  private requireUniqueTitle(
    tabs: sheets_v4.Schema$SheetProperties[],
    title: string,
    exceptSheetId?: number,
  ) {
    // Google compares sheet names case-insensitively.
    const clash = tabs.find(
      (t) =>
        t.sheetId !== exceptSheetId &&
        t.title?.toLowerCase() === title.toLowerCase(),
    );
    if (clash) {
      throw new Error(
        `A sheet titled "${clash.title}" already exists (sheetId ${clash.sheetId}); sheet titles must be unique.`,
      );
    }
  }

  private parseTabColor(hex: string): sheets_v4.Schema$Color {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!match) {
      throw new Error(
        `Invalid tabColor "${hex}": expected a hex color like "#FF9900".`,
      );
    }
    const n = parseInt(match[1], 16);
    return {
      red: ((n >> 16) & 255) / 255,
      green: ((n >> 8) & 255) / 255,
      blue: (n & 255) / 255,
    };
  }

  public addSheet = async ({
    spreadsheetId,
    title,
    index,
    rowCount,
    columnCount,
  }: {
    spreadsheetId: string;
    title: string;
    index?: number;
    rowCount?: number;
    columnCount?: number;
  }) => {
    logToFile(
      `[SheetsService] Starting addSheet for spreadsheet: ${spreadsheetId}, title: ${title}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;
      const sheets = await this.getSheetsClient();
      this.requireUniqueTitle(await this.listTabs(sheets, id), title);

      const properties: sheets_v4.Schema$SheetProperties = { title };
      if (index !== undefined) properties.index = index;
      if (rowCount !== undefined || columnCount !== undefined) {
        properties.gridProperties = {};
        if (rowCount !== undefined)
          properties.gridProperties.rowCount = rowCount;
        if (columnCount !== undefined)
          properties.gridProperties.columnCount = columnCount;
      }

      const response = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: { requests: [{ addSheet: { properties } }] },
      });
      const added = response.data.replies?.[0]?.addSheet?.properties;
      logToFile(`[SheetsService] Finished addSheet for spreadsheet: ${id}`);
      return this.jsonResult({
        sheetId: added?.sheetId,
        title: added?.title,
        index: added?.index,
      });
    } catch (error) {
      return this.errorResult('sheets.addSheet', error);
    }
  };

  public deleteSheet = async ({
    spreadsheetId,
    sheetId,
  }: {
    spreadsheetId: string;
    sheetId: number;
  }) => {
    logToFile(
      `[SheetsService] Starting deleteSheet for spreadsheet: ${spreadsheetId}, sheetId: ${sheetId}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;
      const sheets = await this.getSheetsClient();
      const tab = this.requireTab(await this.listTabs(sheets, id), sheetId);

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: { requests: [{ deleteSheet: { sheetId } }] },
      });
      logToFile(`[SheetsService] Finished deleteSheet for spreadsheet: ${id}`);
      return this.jsonResult({ deleted: true, sheetId, title: tab.title });
    } catch (error) {
      return this.errorResult('sheets.deleteSheet', error);
    }
  };

  public renameSheet = async ({
    spreadsheetId,
    sheetId,
    title,
  }: {
    spreadsheetId: string;
    sheetId: number;
    title: string;
  }) => {
    logToFile(
      `[SheetsService] Starting renameSheet for spreadsheet: ${spreadsheetId}, sheetId: ${sheetId}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;
      const sheets = await this.getSheetsClient();
      const tabs = await this.listTabs(sheets, id);
      this.requireTab(tabs, sheetId);
      this.requireUniqueTitle(tabs, title, sheetId);

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: { sheetId, title },
                fields: 'title',
              },
            },
          ],
        },
      });
      logToFile(`[SheetsService] Finished renameSheet for spreadsheet: ${id}`);
      return this.jsonResult({ sheetId, title });
    } catch (error) {
      return this.errorResult('sheets.renameSheet', error);
    }
  };

  public updateSheetProperties = async ({
    spreadsheetId,
    sheetId,
    index,
    frozenRowCount,
    frozenColumnCount,
    hidden,
    tabColor,
  }: {
    spreadsheetId: string;
    sheetId: number;
    index?: number;
    frozenRowCount?: number;
    frozenColumnCount?: number;
    hidden?: boolean;
    tabColor?: string;
  }) => {
    logToFile(
      `[SheetsService] Starting updateSheetProperties for spreadsheet: ${spreadsheetId}, sheetId: ${sheetId}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const properties: sheets_v4.Schema$SheetProperties = { sheetId };
      const fields: string[] = [];
      if (index !== undefined) {
        properties.index = index;
        fields.push('index');
      }
      if (hidden !== undefined) {
        properties.hidden = hidden;
        fields.push('hidden');
      }
      if (tabColor !== undefined) {
        properties.tabColor = this.parseTabColor(tabColor);
        fields.push('tabColor');
      }
      if (frozenRowCount !== undefined) {
        properties.gridProperties = {
          ...properties.gridProperties,
          frozenRowCount,
        };
        fields.push('gridProperties.frozenRowCount');
      }
      if (frozenColumnCount !== undefined) {
        properties.gridProperties = {
          ...properties.gridProperties,
          frozenColumnCount,
        };
        fields.push('gridProperties.frozenColumnCount');
      }
      if (fields.length === 0) {
        throw new Error(
          'Nothing to update: provide at least one of index, frozenRowCount, frozenColumnCount, hidden, tabColor.',
        );
      }

      const sheets = await this.getSheetsClient();
      this.requireTab(await this.listTabs(sheets, id), sheetId);

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: {
          requests: [
            {
              updateSheetProperties: { properties, fields: fields.join(',') },
            },
          ],
        },
      });
      logToFile(
        `[SheetsService] Finished updateSheetProperties for spreadsheet: ${id}`,
      );
      return this.jsonResult({ sheetId, updated: fields });
    } catch (error) {
      return this.errorResult('sheets.updateSheetProperties', error);
    }
  };

  private columnToIndex(letters: string): number {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  /**
   * Converts an A1 range without a sheet name ("A1:C10", "A:B", "2:5", "D4")
   * into a zero-based, end-exclusive GridRange. Omitted bounds stay unset,
   * which the API treats as unbounded.
   */
  private toGridRange(
    sheetId: number,
    range: string,
  ): sheets_v4.Schema$GridRange {
    const cell = /^([A-Za-z]{1,3})?(\d+)?$/;
    const parts = range.trim().split(':');
    const parsed = parts.map((p) => cell.exec(p));
    if (parts.length > 2 || parsed.some((m) => !m || (!m[1] && !m[2]))) {
      throw new Error(
        `Invalid range "${range}": expected A1 notation without a sheet name, e.g. "A1:C10", "A:B" or "2:5".`,
      );
    }
    const [start, end = start] = parsed as RegExpExecArray[];
    const grid: sheets_v4.Schema$GridRange = { sheetId };
    if (start[1]) grid.startColumnIndex = this.columnToIndex(start[1]);
    if (end[1]) grid.endColumnIndex = this.columnToIndex(end[1]) + 1;
    if (start[2]) grid.startRowIndex = parseInt(start[2], 10) - 1;
    if (end[2]) grid.endRowIndex = parseInt(end[2], 10);
    return grid;
  }

  private async runBatch(
    tool: string,
    spreadsheetId: string,
    sheetId: number,
    build: (
      tabs: sheets_v4.Schema$SheetProperties[],
    ) => sheets_v4.Schema$Request,
    result: (data: sheets_v4.Schema$BatchUpdateSpreadsheetResponse) => unknown,
  ) {
    logToFile(
      `[SheetsService] Starting ${tool} for spreadsheet: ${spreadsheetId}, sheetId: ${sheetId}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;
      const sheets = await this.getSheetsClient();
      const tabs = await this.listTabs(sheets, id);
      this.requireTab(tabs, sheetId);
      const request = build(tabs);
      const response = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: { requests: [request] },
      });
      logToFile(`[SheetsService] Finished ${tool} for spreadsheet: ${id}`);
      return this.jsonResult(result(response.data));
    } catch (error) {
      return this.errorResult(`sheets.${tool}`, error);
    }
  }

  public createSpreadsheet = async ({
    title,
    sheetTitles,
  }: {
    title: string;
    sheetTitles?: string[];
  }) => {
    logToFile(`[SheetsService] Starting createSpreadsheet, title: ${title}`);
    try {
      const lower = (sheetTitles ?? []).map((t) => t.toLowerCase());
      if (new Set(lower).size !== lower.length) {
        throw new Error('sheetTitles must be unique.');
      }
      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title },
          ...(sheetTitles?.length && {
            sheets: sheetTitles.map((t) => ({ properties: { title: t } })),
          }),
        },
        fields: 'spreadsheetId,spreadsheetUrl,sheets.properties(sheetId,title)',
      });
      return this.jsonResult({
        spreadsheetId: response.data.spreadsheetId,
        url: response.data.spreadsheetUrl,
        sheets: (response.data.sheets ?? []).map((s) => ({
          sheetId: s.properties?.sheetId,
          title: s.properties?.title,
        })),
      });
    } catch (error) {
      return this.errorResult('sheets.createSpreadsheet', error);
    }
  };

  public duplicateSheet = async ({
    spreadsheetId,
    sheetId,
    newTitle,
    index,
  }: {
    spreadsheetId: string;
    sheetId: number;
    newTitle?: string;
    index?: number;
  }) =>
    this.runBatch(
      'duplicateSheet',
      spreadsheetId,
      sheetId,
      (tabs) => {
        if (newTitle !== undefined) this.requireUniqueTitle(tabs, newTitle);
        return {
          duplicateSheet: {
            sourceSheetId: sheetId,
            ...(newTitle !== undefined && { newSheetName: newTitle }),
            ...(index !== undefined && { insertSheetIndex: index }),
          },
        };
      },
      (data) => {
        const p = data.replies?.[0]?.duplicateSheet?.properties;
        return { sheetId: p?.sheetId, title: p?.title, index: p?.index };
      },
    );

  public clearRange = async ({
    spreadsheetId,
    range,
  }: {
    spreadsheetId: string;
    range: string;
  }) => {
    logToFile(
      `[SheetsService] Starting clearRange for spreadsheet: ${spreadsheetId}, range: ${range}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;
      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.values.clear({
        spreadsheetId: id,
        range,
      });
      logToFile(`[SheetsService] Finished clearRange for spreadsheet: ${id}`);
      return this.jsonResult({ clearedRange: response.data.clearedRange });
    } catch (error) {
      return this.errorResult('sheets.clearRange', error);
    }
  };

  public formatRange = async ({
    spreadsheetId,
    sheetId,
    range,
    bold,
    numberFormat,
  }: {
    spreadsheetId: string;
    sheetId: number;
    range: string;
    bold?: boolean;
    numberFormat?: { type: string; pattern?: string };
  }) =>
    this.runBatch(
      'formatRange',
      spreadsheetId,
      sheetId,
      () => {
        const userEnteredFormat: sheets_v4.Schema$CellFormat = {};
        const fields: string[] = [];
        if (bold !== undefined) {
          userEnteredFormat.textFormat = { bold };
          fields.push('userEnteredFormat.textFormat.bold');
        }
        if (numberFormat) {
          userEnteredFormat.numberFormat = numberFormat;
          fields.push('userEnteredFormat.numberFormat');
        }
        if (fields.length === 0) {
          throw new Error('Nothing to format: provide bold or numberFormat.');
        }
        return {
          repeatCell: {
            range: this.toGridRange(sheetId, range),
            cell: { userEnteredFormat },
            fields: fields.join(','),
          },
        };
      },
      () => ({ sheetId, range, formatted: true }),
    );

  public setColumnWidth = async ({
    spreadsheetId,
    sheetId,
    columns,
    pixelSize,
  }: {
    spreadsheetId: string;
    sheetId: number;
    columns: string;
    pixelSize: number;
  }) =>
    this.runBatch(
      'setColumnWidth',
      spreadsheetId,
      sheetId,
      () => {
        if (!/^[A-Za-z]{1,3}(:[A-Za-z]{1,3})?$/.test(columns.trim())) {
          throw new Error(
            `Invalid columns "${columns}": expected a letter or letter range like "B" or "A:C".`,
          );
        }
        const { startColumnIndex, endColumnIndex } = this.toGridRange(
          sheetId,
          columns.trim(),
        );
        return {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: startColumnIndex,
              endIndex: endColumnIndex,
            },
            properties: { pixelSize },
            fields: 'pixelSize',
          },
        };
      },
      () => ({ sheetId, columns, pixelSize }),
    );

  public insertDimension = async ({
    spreadsheetId,
    sheetId,
    dimension,
    startIndex,
    count,
  }: {
    spreadsheetId: string;
    sheetId: number;
    dimension: 'ROWS' | 'COLUMNS';
    startIndex: number;
    count: number;
  }) =>
    this.runBatch(
      'insertDimension',
      spreadsheetId,
      sheetId,
      () => ({
        insertDimension: {
          range: {
            sheetId,
            dimension,
            startIndex,
            endIndex: startIndex + count,
          },
          // Inherit formatting from the row/column before, except at the very start.
          inheritFromBefore: startIndex > 0,
        },
      }),
      () => ({ sheetId, dimension, startIndex, inserted: count }),
    );

  public deleteDimension = async ({
    spreadsheetId,
    sheetId,
    dimension,
    startIndex,
    count,
  }: {
    spreadsheetId: string;
    sheetId: number;
    dimension: 'ROWS' | 'COLUMNS';
    startIndex: number;
    count: number;
  }) =>
    this.runBatch(
      'deleteDimension',
      spreadsheetId,
      sheetId,
      () => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension,
            startIndex,
            endIndex: startIndex + count,
          },
        },
      }),
      () => ({ sheetId, dimension, startIndex, deleted: count }),
    );

  public sortRange = async ({
    spreadsheetId,
    sheetId,
    range,
    sortColumn,
    descending = false,
  }: {
    spreadsheetId: string;
    sheetId: number;
    range: string;
    sortColumn: string;
    descending?: boolean;
  }) =>
    this.runBatch(
      'sortRange',
      spreadsheetId,
      sheetId,
      () => {
        if (!/^[A-Za-z]{1,3}$/.test(sortColumn)) {
          throw new Error(
            `Invalid sortColumn "${sortColumn}": expected a column letter like "C".`,
          );
        }
        const grid = this.toGridRange(sheetId, range);
        const dimensionIndex = this.columnToIndex(sortColumn);
        if (
          (grid.startColumnIndex != null &&
            dimensionIndex < grid.startColumnIndex) ||
          (grid.endColumnIndex != null &&
            dimensionIndex >= grid.endColumnIndex)
        ) {
          throw new Error(
            `sortColumn ${sortColumn} is outside the range ${range}.`,
          );
        }
        return {
          sortRange: {
            range: grid,
            sortSpecs: [
              {
                dimensionIndex,
                sortOrder: descending ? 'DESCENDING' : 'ASCENDING',
              },
            ],
          },
        };
      },
      () => ({ sheetId, range, sortColumn, descending }),
    );
}
