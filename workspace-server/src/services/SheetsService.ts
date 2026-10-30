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
}
