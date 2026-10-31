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
import { DriveService } from '../../services/DriveService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');
jest.mock('node:fs', () => {
  const actualFs = jest.requireActual('node:fs') as any;
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      mkdir: jest.fn(),
      writeFile: jest.fn(),
      stat: jest.fn(),
    },
    createReadStream: jest.fn(),
    existsSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
  };
});
jest.mock('node:path', () => {
  const actualPath = jest.requireActual('node:path') as any;
  return {
    ...actualPath,
    resolve: jest.fn((...args: string[]) => args.join('/')),
    dirname: jest.fn((p: string) => p.substring(0, p.lastIndexOf('/'))),
    isAbsolute: jest.fn((p: string) => p.startsWith('/')),
  };
});
jest.mock('../../utils/paths', () => ({
  PROJECT_ROOT: '/mock/project/root',
  ENCRYPTED_TOKEN_PATH: '/mock/project/root/token.json',
  ENCRYPTION_MASTER_KEY_PATH: '/mock/project/root/key',
}));

import * as fs from 'node:fs';

describe('DriveService', () => {
  let driveService: DriveService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockDriveAPI: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock AuthManager
    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    } as any;

    // Create mock Drive API
    mockDriveAPI = {
      files: {
        list: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      comments: {
        list: jest.fn(),
      },
      replies: {
        create: jest.fn(),
      },
    };

    // Mock the google.drive constructor
    (google.drive as jest.Mock) = jest.fn().mockReturnValue(mockDriveAPI);

    // Create DriveService instance
    driveService = new DriveService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(
      mockAuthClient as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findFolder', () => {
    it('should find folders by name', async () => {
      const mockFolders = [
        { id: 'folder1', name: 'TestFolder' },
        { id: 'folder2', name: 'TestFolder' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFolders,
        },
      });

      const result = await driveService.findFolder({
        folderName: 'TestFolder',
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "mimeType='application/vnd.google-apps.folder' and name = 'TestFolder'",
        fields: 'files(id, name)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockFolders);
    });

    it('should return empty array when no folders found', async () => {
      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: [],
        },
      });

      const result = await driveService.findFolder({
        folderName: 'NonExistentFolder',
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledTimes(1);
      expect(mockDriveAPI.files.list).toHaveBeenCalledWith(
        expect.objectContaining({
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        }),
      );
      expect(JSON.parse(result.content[0].text)).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('API request failed');
      mockDriveAPI.files.list.mockRejectedValue(apiError);

      const result = await driveService.findFolder({
        folderName: 'TestFolder',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'API request failed',
      });
    });
  });

  describe('createFolder', () => {
    it('should create a folder successfully', async () => {
      const mockFolder = { id: 'new-folder-id', name: 'New Folder' };

      mockDriveAPI.files.create.mockResolvedValue({
        data: mockFolder,
      });

      const result = await driveService.createFolder({ name: 'New Folder' });

      expect(mockDriveAPI.files.create).toHaveBeenCalledWith({
        requestBody: {
          name: 'New Folder',
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id, name',
        supportsAllDrives: true,
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockFolder);
    });

    it('should create a folder in a parent folder', async () => {
      const mockFolder = { id: 'new-folder-id', name: 'New Folder' };

      mockDriveAPI.files.create.mockResolvedValue({
        data: mockFolder,
      });

      const result = await driveService.createFolder({
        name: 'New Folder',
        parentId: 'parent-id',
      });

      expect(mockDriveAPI.files.create).toHaveBeenCalledWith({
        requestBody: {
          name: 'New Folder',
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['parent-id'],
        },
        fields: 'id, name',
        supportsAllDrives: true,
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockFolder);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('API request failed');
      mockDriveAPI.files.create.mockRejectedValue(apiError);

      const result = await driveService.createFolder({ name: 'New Folder' });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'API request failed',
      });
    });
  });

  describe('uploadFile', () => {
    const stat = fs.promises.stat as unknown as jest.Mock<any>;
    const createReadStream = fs.createReadStream as unknown as jest.Mock<any>;

    beforeEach(() => {
      stat.mockReset();
      createReadStream.mockReset();
      stat.mockResolvedValue({ isFile: () => true, size: 1024 });
      createReadStream.mockReturnValue('stream');
    });

    it('uploads a file with defaults derived from the path', async () => {
      const created = {
        id: 'f1',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        webViewLink: 'https://drive.google.com/file/d/f1/view',
      };
      mockDriveAPI.files.create.mockResolvedValue({ data: created });

      const result = await driveService.uploadFile({
        filePath: '/tmp/report.pdf',
      });

      expect(mockDriveAPI.files.create).toHaveBeenCalledWith({
        requestBody: { name: 'report.pdf' },
        media: { mimeType: 'application/pdf', body: 'stream' },
        fields: 'id, name, mimeType, webViewLink',
        supportsAllDrives: true,
      });
      expect(JSON.parse(result.content[0].text)).toEqual(created);
    });

    it('honors name, parentFolderId and mimeType', async () => {
      mockDriveAPI.files.create.mockResolvedValue({ data: { id: 'f2' } });

      await driveService.uploadFile({
        filePath: '/tmp/blob.bin',
        name: 'Custom',
        parentFolderId: 'folder1',
        mimeType: 'text/plain',
      });

      expect(mockDriveAPI.files.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: { name: 'Custom', parents: ['folder1'] },
          media: { mimeType: 'text/plain', body: 'stream' },
        }),
      );
    });

    it('rejects relative paths', async () => {
      const result = await driveService.uploadFile({ filePath: 'rel/a.txt' });
      expect(JSON.parse(result.content[0].text).error).toMatch(/absolute/);
      expect(mockDriveAPI.files.create).not.toHaveBeenCalled();
    });

    it('rejects missing files', async () => {
      stat.mockRejectedValue(new Error('ENOENT'));
      const result = await driveService.uploadFile({ filePath: '/tmp/x' });
      expect(JSON.parse(result.content[0].text).error).toMatch(
        /Could not access file \/tmp\/x: ENOENT/,
      );
    });

    it('rejects non-files', async () => {
      stat.mockResolvedValue({ isFile: () => false, size: 0 });
      const result = await driveService.uploadFile({ filePath: '/tmp' });
      expect(JSON.parse(result.content[0].text).error).toMatch(/not a file/);
    });

    it('rejects files over the size cap', async () => {
      stat.mockResolvedValue({ isFile: () => true, size: 51 * 1024 * 1024 });
      const result = await driveService.uploadFile({ filePath: '/tmp/big' });
      expect(JSON.parse(result.content[0].text).error).toMatch(
        /exceeds the maximum/,
      );
      expect(mockDriveAPI.files.create).not.toHaveBeenCalled();
    });

    it('returns API errors', async () => {
      mockDriveAPI.files.create.mockRejectedValue(new Error('boom'));
      const result = await driveService.uploadFile({ filePath: '/tmp/a.txt' });
      expect(JSON.parse(result.content[0].text)).toEqual({ error: 'boom' });
    });
  });

  describe('search', () => {
    it('should search files with custom query', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Document.pdf',
          modifiedTime: '2024-01-01T00:00:00Z',
        },
        {
          id: 'file2',
          name: 'Spreadsheet.xlsx',
          modifiedTime: '2024-01-02T00:00:00Z',
        },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
          nextPageToken: 'next-token',
        },
      });

      const result = await driveService.search({
        query: "name contains 'Document'",
        pageSize: 20,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "name contains 'Document'",
        pageSize: 20,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
      expect(responseData.nextPageToken).toBe('next-token');
    });

    it('should construct query if no field specifier is present', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Document.pdf',
          modifiedTime: '2024-01-01T00:00:00Z',
        },
        {
          id: 'file2',
          name: 'Spreadsheet.xlsx',
          modifiedTime: '2024-01-02T00:00:00Z',
        },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
          nextPageToken: 'next-token',
        },
      });

      const result = await driveService.search({
        query: 'My Document',
        pageSize: 20,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "fullText contains 'My Document'",
        pageSize: 20,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
      expect(responseData.nextPageToken).toBe('next-token');
    });

    it('should escape special characters in search query', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: "John's Report.pdf",
          modifiedTime: '2024-01-01T00:00:00Z',
        },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: "John's \\Report",
        pageSize: 10,
      });

      // Verify that single quotes and backslashes are properly escaped
      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "fullText contains 'John\\'s \\\\Report'",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should search by title when query starts with title:', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'My Document.pdf',
          modifiedTime: '2024-01-01T00:00:00Z',
        },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'title:My Document',
        pageSize: 10,
      });

      // Should only search in name field when title: prefix is used
      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "name contains 'My Document'",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should handle quoted title searches', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Test Document',
          modifiedTime: '2024-01-01T00:00:00Z',
        },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'title:"Test Document"',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "name contains 'Test Document'",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should handle sharedWithMe filter', async () => {
      const mockFiles = [
        {
          id: 'shared1',
          name: 'SharedDoc.pdf',
          modifiedTime: '2024-01-01T00:00:00Z',
        },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        sharedWithMe: true,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: 'sharedWithMe',
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should filter unread files when unreadOnly is true', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'ReadDoc.pdf',
          viewedByMeTime: '2024-01-01T00:00:00Z',
        },
        { id: 'file2', name: 'UnreadDoc.pdf', viewedByMeTime: null },
        { id: 'file3', name: 'UnreadSpreadsheet.xlsx' }, // No viewedByMeTime property
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'type = "document"',
        unreadOnly: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      // Should only include files without viewedByMeTime
      expect(responseData.files).toHaveLength(2);
      expect(responseData.files[0].id).toBe('file2');
      expect(responseData.files[1].id).toBe('file3');
    });

    it('should use pagination token', async () => {
      const mockFiles = [{ id: 'file3', name: 'Page2Doc.pdf' }];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      await driveService.search({
        query: 'type = "document"',
        pageToken: 'previous-token',
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: 'type = "document"',
        pageSize: 10,
        pageToken: 'previous-token',
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
    });

    it('should handle corpus parameter', async () => {
      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: [],
        },
      });

      await driveService.search({
        query: 'type = "document"',
        corpus: 'domain',
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: 'type = "document"',
        pageSize: 10,
        pageToken: undefined,
        corpus: 'domain',
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Search API failed');
      mockDriveAPI.files.list.mockRejectedValue(apiError);

      const result = await driveService.search({
        query: 'type = "document"',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Search API failed',
      });
    });

    it('should use default values when parameters are not provided', async () => {
      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: [],
        },
      });

      await driveService.search({});

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: undefined,
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
    });

    it('should handle Google Drive folder URLs', async () => {
      const mockFiles = [
        {
          id: 'folder123',
          name: 'My Folder',
          mimeType: 'application/vnd.google-apps.folder',
        },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'https://drive.google.com/drive/folders/folder123',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "'folder123' in parents",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should handle corporate Google Drive folder URLs', async () => {
      const mockFiles = [
        { id: 'file1', name: 'Document.pdf', mimeType: 'application/pdf' },
        { id: 'file2', name: 'Image.png', mimeType: 'image/png' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query:
          'https://drive.google.com/corp/drive/u/0/folders/1Ahs8C3GFWBZnrzQ44z0OR07hNQTWlE7u',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "'1Ahs8C3GFWBZnrzQ44z0OR07hNQTWlE7u' in parents",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should handle Google Drive file URLs', async () => {
      const mockFile = {
        id: 'file456',
        name: 'My Document.pdf',
        mimeType: 'application/pdf',
      };

      mockDriveAPI.files.get.mockResolvedValue({
        data: mockFile,
      });

      const result = await driveService.search({
        query: 'https://drive.google.com/file/d/file456/view',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: 'file456',
        fields: 'id, name, modifiedTime, viewedByMeTime, mimeType, parents',
        supportsAllDrives: true,
      });
      expect(mockDriveAPI.files.list).not.toHaveBeenCalled();

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual([mockFile]);
      expect(responseData.nextPageToken).toBeNull();
    });

    it('should handle Google Docs URLs', async () => {
      const mockFile = {
        id: 'doc789',
        name: 'My Document',
        mimeType: 'application/vnd.google-apps.document',
      };

      mockDriveAPI.files.get.mockResolvedValue({
        data: mockFile,
      });

      const result = await driveService.search({
        query: 'https://docs.google.com/document/d/doc789/edit',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: 'doc789',
        fields: 'id, name, modifiedTime, viewedByMeTime, mimeType, parents',
        supportsAllDrives: true,
      });
      expect(mockDriveAPI.files.list).not.toHaveBeenCalled();

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual([mockFile]);
      expect(responseData.nextPageToken).toBeNull();
    });

    it('should handle invalid Google Drive URLs', async () => {
      const result = await driveService.search({
        query: 'https://drive.google.com/invalid/url',
        pageSize: 10,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.error).toBe(
        'Invalid Drive URL. Please provide a valid Google Drive URL or a search query.',
      );
      expect(responseData.details).toBe(
        'Could not extract file or folder ID from the provided URL.',
      );

      // Should not call the API for invalid URLs
      expect(mockDriveAPI.files.list).not.toHaveBeenCalled();
    });

    it('should handle folder URLs with id parameter', async () => {
      const mockFolder = {
        id: 'folder789',
        name: 'My Folder',
        mimeType: 'application/vnd.google-apps.folder',
      };
      const mockFiles = [
        { id: 'file1', name: 'Document.pdf', mimeType: 'application/pdf' },
      ];

      mockDriveAPI.files.get.mockResolvedValue({
        data: mockFolder,
      });
      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'https://drive.google.com/drive?id=folder789',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: 'folder789',
        fields: 'mimeType',
        supportsAllDrives: true,
      });
      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "'folder789' in parents",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should handle file URLs with id parameter', async () => {
      const mockFile = {
        id: 'file123',
        name: 'My File.pdf',
        mimeType: 'application/pdf',
      };

      mockDriveAPI.files.get
        .mockResolvedValueOnce({
          data: { mimeType: 'application/pdf' },
        })
        .mockResolvedValueOnce({
          data: mockFile,
        });

      const result = await driveService.search({
        query: 'https://drive.google.com/drive?id=file123',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: 'file123',
        fields: 'mimeType',
        supportsAllDrives: true,
      });
      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: 'file123',
        fields: 'id, name, modifiedTime, viewedByMeTime, mimeType, parents',
        supportsAllDrives: true,
      });
      expect(mockDriveAPI.files.list).not.toHaveBeenCalled();

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual([mockFile]);
    });

    it('should handle raw Drive IDs as folder queries', async () => {
      const mockFiles = [
        { id: 'file1', name: 'Document.pdf', mimeType: 'application/pdf' },
        {
          id: 'file2',
          name: 'Spreadsheet.xlsx',
          mimeType: 'application/vnd.google-apps.spreadsheet',
        },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: '1Ahs8C3GFWBZnrzQ44z0OR07hNQTWlE7u',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "'1Ahs8C3GFWBZnrzQ44z0OR07hNQTWlE7u' in parents",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should not wrap a valid query in full-text search', async () => {
      const mockFiles = [
        { id: 'file1', name: 'My File.pdf', mimeType: 'application/pdf' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: "'me' in owners",
        pageSize: 10,
      });
      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "'me' in owners",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields:
          'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });
  });

  describe('downloadFile', () => {
    it('should download files and save locally', async () => {
      const mockFileId = 'text-file-id';
      const mockContent = 'Hello, World!';
      const mockBuffer = Buffer.from(mockContent);
      const mockLocalPath = 'downloads/test.txt';

      mockDriveAPI.files.get.mockImplementation((params: any) => {
        if (params.alt === 'media') {
          return Promise.resolve({
            data: mockBuffer,
          });
        }
        return Promise.resolve({
          data: { id: mockFileId, name: 'test.txt', mimeType: 'text/plain' },
        });
      });

      const result = await driveService.downloadFile({
        fileId: mockFileId,
        localPath: mockLocalPath,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: mockFileId,
        fields: 'id, name, mimeType',
        supportsAllDrives: true,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith(
        { fileId: mockFileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(mockLocalPath),
        mockBuffer,
      );
      expect(result.content[0].text).toContain(
        `Successfully downloaded file test.txt`,
      );
    });

    it('should download files when provided with a full Drive URL', async () => {
      const mockFileId = 'file-id-from-url';
      const mockUrl = `https://drive.google.com/file/d/${mockFileId}/view`;
      const mockContent = 'Hello, World!';
      const mockBuffer = Buffer.from(mockContent);
      const mockLocalPath = 'downloads/test.txt';

      mockDriveAPI.files.get.mockImplementation((params: any) => {
        if (params.alt === 'media') {
          return Promise.resolve({
            data: mockBuffer,
          });
        }
        return Promise.resolve({
          data: { id: mockFileId, name: 'test.txt', mimeType: 'text/plain' },
        });
      });

      const result = await driveService.downloadFile({
        fileId: mockUrl,
        localPath: mockLocalPath,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: mockFileId,
          fields: 'id, name, mimeType',
          supportsAllDrives: true,
        }),
      );

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: mockFileId,
          alt: 'media',
          supportsAllDrives: true,
        }),
        expect.any(Object),
      );

      expect(result.content[0].text).toContain(
        `Successfully downloaded file test.txt`,
      );
    });

    it('should suggest specialized tools for workspace types', async () => {
      const mockFileId = 'doc-id';
      mockDriveAPI.files.get.mockResolvedValue({
        data: { mimeType: 'application/vnd.google-apps.document' },
      });

      const result = await driveService.downloadFile({
        fileId: mockFileId,
        localPath: 'any',
      });

      expect(result.content[0].text).toContain(
        "This is a Google Doc. Direct download is not supported. Please use the 'docs.getText' tool with documentId: doc-id",
      );
      expect(mockDriveAPI.files.get).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors', async () => {
      const mockFileId = 'error-file-id';
      mockDriveAPI.files.get.mockRejectedValue(new Error('API Error'));

      const result = await driveService.downloadFile({
        fileId: mockFileId,
        localPath: 'any',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'API Error',
      });
    });
  });

  describe('trashFile', () => {
    it('should trash a file by ID', async () => {
      mockDriveAPI.files.update.mockResolvedValue({
        data: { id: 'file-id-123', name: 'My File.pdf' },
      });

      const result = await driveService.trashFile({ fileId: 'file-id-123' });

      expect(mockDriveAPI.files.update).toHaveBeenCalledWith({
        fileId: 'file-id-123',
        requestBody: { trashed: true },
        fields: 'id, name',
        supportsAllDrives: true,
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 'file-id-123',
        name: 'My File.pdf',
        trashed: true,
      });
    });

    it('should extract ID from a Drive URL', async () => {
      mockDriveAPI.files.update.mockResolvedValue({
        data: { id: 'file-url-id', name: 'URL File.pdf' },
      });

      const result = await driveService.trashFile({
        fileId: 'https://drive.google.com/file/d/file-url-id/view',
      });

      expect(mockDriveAPI.files.update).toHaveBeenCalledWith({
        fileId: 'file-url-id',
        requestBody: { trashed: true },
        fields: 'id, name',
        supportsAllDrives: true,
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 'file-url-id',
        name: 'URL File.pdf',
        trashed: true,
      });
    });

    it('should handle API errors gracefully', async () => {
      mockDriveAPI.files.update.mockRejectedValue(
        new Error('Permission denied'),
      );

      const result = await driveService.trashFile({ fileId: 'file-id-123' });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Permission denied',
      });
    });
  });

  describe('renameFile', () => {
    it('should rename a file by ID', async () => {
      mockDriveAPI.files.update.mockResolvedValue({
        data: { id: 'file-id-123', name: 'New Name' },
      });

      const result = await driveService.renameFile({
        fileId: 'file-id-123',
        newName: 'New Name',
      });

      expect(mockDriveAPI.files.update).toHaveBeenCalledWith({
        fileId: 'file-id-123',
        requestBody: { name: 'New Name' },
        fields: 'id, name',
        supportsAllDrives: true,
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 'file-id-123',
        name: 'New Name',
      });
    });

    it('should extract ID from a Drive URL', async () => {
      mockDriveAPI.files.update.mockResolvedValue({
        data: { id: 'doc-url-id', name: 'Renamed Doc' },
      });

      const result = await driveService.renameFile({
        fileId: 'https://docs.google.com/document/d/doc-url-id/edit',
        newName: 'Renamed Doc',
      });

      expect(mockDriveAPI.files.update).toHaveBeenCalledWith({
        fileId: 'doc-url-id',
        requestBody: { name: 'Renamed Doc' },
        fields: 'id, name',
        supportsAllDrives: true,
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 'doc-url-id',
        name: 'Renamed Doc',
      });
    });

    it('should handle API errors gracefully', async () => {
      mockDriveAPI.files.update.mockRejectedValue(new Error('File not found'));

      const result = await driveService.renameFile({
        fileId: 'file-id-123',
        newName: 'New Name',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'File not found',
      });
    });
  });

  describe('moveFile', () => {
    it('should move a file to a folder by folderId', async () => {
      mockDriveAPI.files.get.mockResolvedValue({
        data: { parents: ['root'] },
      });
      mockDriveAPI.files.update.mockResolvedValue({
        data: {
          id: 'test-file-id',
          name: 'Test File',
          parents: ['target-folder-id'],
        },
      });

      const result = await driveService.moveFile({
        fileId: 'test-file-id',
        folderId: 'target-folder-id',
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'test-file-id',
          fields: 'parents',
          supportsAllDrives: true,
        }),
      );
      expect(mockDriveAPI.files.update).toHaveBeenCalledWith({
        fileId: 'test-file-id',
        addParents: 'target-folder-id',
        removeParents: 'root',
        fields: 'id, name, parents',
        supportsAllDrives: true,
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 'test-file-id',
        name: 'Test File',
        parents: ['target-folder-id'],
      });
    });

    it('should move a file to a folder by folderName', async () => {
      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: [{ id: 'test-folder-id', name: 'Test Folder' }],
        },
      });
      mockDriveAPI.files.get.mockResolvedValue({
        data: { parents: ['root'] },
      });
      mockDriveAPI.files.update.mockResolvedValue({
        data: {
          id: 'test-file-id',
          name: 'Test File',
          parents: ['test-folder-id'],
        },
      });

      const result = await driveService.moveFile({
        fileId: 'test-file-id',
        folderName: 'Test Folder',
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: "mimeType='application/vnd.google-apps.folder' and name = 'Test Folder'",
        }),
      );
      expect(mockDriveAPI.files.update).toHaveBeenCalledWith({
        fileId: 'test-file-id',
        addParents: 'test-folder-id',
        removeParents: 'root',
        fields: 'id, name, parents',
        supportsAllDrives: true,
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 'test-file-id',
        name: 'Test File',
        parents: ['test-folder-id'],
      });
    });

    it('should error when folder not found by name', async () => {
      mockDriveAPI.files.list.mockResolvedValue({
        data: { files: [] },
      });

      const result = await driveService.moveFile({
        fileId: 'test-file-id',
        folderName: 'Nonexistent Folder',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Folder not found: Nonexistent Folder',
      });
    });

    it('should error when neither folderId nor folderName provided', async () => {
      const result = await driveService.moveFile({
        fileId: 'test-file-id',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Either folderId or folderName must be provided.',
      });
    });

    it('should handle API errors gracefully', async () => {
      mockDriveAPI.files.get.mockRejectedValue(new Error('API Error'));

      const result = await driveService.moveFile({
        fileId: 'test-file-id',
        folderId: 'target-folder-id',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'API Error',
      });
    });
  });

  describe('Shared Drive Support', () => {
    it('findFolder should include shared drive flags', async () => {
      mockDriveAPI.files.list.mockResolvedValue({ data: { files: [] } });

      await driveService.findFolder({ folderName: 'SharedFolder' });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith(
        expect.objectContaining({
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        }),
      );
    });

    it('search should include shared drive flags', async () => {
      mockDriveAPI.files.list.mockResolvedValue({ data: { files: [] } });

      await driveService.search({ query: 'test' });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith(
        expect.objectContaining({
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        }),
      );
    });

    it('createFolder should include supportsAllDrives flag', async () => {
      mockDriveAPI.files.create.mockResolvedValue({
        data: { id: 'new-id', name: 'new' },
      });

      await driveService.createFolder({
        name: 'New Folder',
        parentId: 'shared-drive-parent-id',
      });

      expect(mockDriveAPI.files.create).toHaveBeenCalledWith(
        expect.objectContaining({
          supportsAllDrives: true,
        }),
      );
    });

    it('downloadFile should include supportsAllDrives flag for metadata and media', async () => {
      mockDriveAPI.files.get.mockResolvedValueOnce({
        data: { mimeType: 'text/plain', name: 'test.txt' },
      });
      mockDriveAPI.files.get.mockResolvedValueOnce({
        data: { data: Buffer.from('content') },
      });

      await driveService.downloadFile({
        fileId: 'shared-file-id',
        localPath: 'test.txt',
      });

      // First call for metadata
      expect(mockDriveAPI.files.get).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          supportsAllDrives: true,
        }),
      );

      // Second call for media
      expect(mockDriveAPI.files.get).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          supportsAllDrives: true,
        }),
        expect.any(Object),
      );
    });
  });

  describe('getComments', () => {
    it('should return comments as type text with JSON-stringified array', async () => {
      const mockComments = [
        {
          id: 'comment1',
          content: 'This is a comment.',
          author: {
            displayName: 'Test User',
            emailAddress: 'test@example.com',
          },
          createdTime: '2025-01-01T00:00:00Z',
          resolved: false,
          quotedFileContent: { value: 'quoted text' },
          replies: [],
        },
      ];
      mockDriveAPI.comments.list.mockResolvedValue({
        data: { comments: mockComments },
      });

      const result = await driveService.getComments({
        fileId: 'test-doc-id',
      });

      expect(result.content[0].type).toBe('text');
      const comments = JSON.parse(result.content[0].text);
      expect(comments).toEqual(mockComments);
    });

    it('should include replies in comment threads', async () => {
      const mockComments = [
        {
          id: 'comment1',
          content: 'Top-level comment.',
          author: { displayName: 'Alice', emailAddress: 'alice@example.com' },
          createdTime: '2025-01-01T00:00:00Z',
          resolved: false,
          quotedFileContent: { value: 'some text' },
          replies: [
            {
              id: 'reply1',
              content: 'Reply to comment.',
              author: {
                displayName: 'Bob',
                emailAddress: 'bob@example.com',
              },
              createdTime: '2025-01-02T00:00:00Z',
            },
          ],
        },
      ];
      mockDriveAPI.comments.list.mockResolvedValue({
        data: { comments: mockComments },
      });

      const result = await driveService.getComments({
        fileId: 'test-doc-id',
      });

      expect(result.content[0].type).toBe('text');
      const comments = JSON.parse(result.content[0].text);
      expect(comments).toHaveLength(1);
      expect(comments[0].replies).toHaveLength(1);
      expect(comments[0].replies[0].id).toBe('reply1');
      expect(comments[0].replies[0].content).toBe('Reply to comment.');
    });

    it('should request replies fields in the Drive API call', async () => {
      mockDriveAPI.comments.list.mockResolvedValue({
        data: { comments: [] },
      });

      await driveService.getComments({ fileId: 'test-doc-id' });

      expect(mockDriveAPI.comments.list).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.stringContaining('replies('),
        }),
      );
    });

    it('should handle empty comments list', async () => {
      mockDriveAPI.comments.list.mockResolvedValue({
        data: { comments: [] },
      });

      const result = await driveService.getComments({
        fileId: 'test-doc-id',
      });

      const comments = JSON.parse(result.content[0].text);
      expect(comments).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      mockDriveAPI.comments.list.mockRejectedValue(
        new Error('Comments API failed'),
      );

      const result = await driveService.getComments({
        fileId: 'test-doc-id',
      });

      expect('isError' in result && result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({ error: 'Comments API failed' });
    });

    it('should return resolved comments with reply actions', async () => {
      const mockComments = [
        {
          id: 'comment1',
          content: 'Please fix this typo.',
          author: {
            displayName: 'Alice',
            emailAddress: 'alice@example.com',
          },
          createdTime: '2025-01-01T00:00:00Z',
          resolved: true,
          quotedFileContent: { value: 'teh' },
          replies: [
            {
              id: 'reply1',
              content: 'Fixed!',
              author: {
                displayName: 'Bob',
                emailAddress: 'bob@example.com',
              },
              createdTime: '2025-01-02T00:00:00Z',
              action: 'resolve',
            },
          ],
        },
      ];
      mockDriveAPI.comments.list.mockResolvedValue({
        data: { comments: mockComments },
      });

      const result = await driveService.getComments({
        fileId: 'test-doc-id',
      });

      const comments = JSON.parse(result.content[0].text);
      expect(comments).toHaveLength(1);
      expect(comments[0].resolved).toBe(true);
      expect(comments[0].replies[0].action).toBe('resolve');
    });

    it('should request action field in replies', async () => {
      mockDriveAPI.comments.list.mockResolvedValue({
        data: { comments: [] },
      });

      await driveService.getComments({ fileId: 'test-doc-id' });

      expect(mockDriveAPI.comments.list).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.stringContaining('action'),
        }),
      );
    });

    it('should read every page of comments', async () => {
      mockDriveAPI.comments.list
        .mockResolvedValueOnce({
          data: {
            comments: [{ id: 'comment1', quotedFileContent: { value: 'a' } }],
            nextPageToken: 'page2',
          },
        })
        .mockResolvedValueOnce({
          data: {
            comments: [{ id: 'comment2', quotedFileContent: { value: 'b' } }],
          },
        });

      const result = await driveService.getComments({
        fileId: 'test-doc-id',
      });

      const comments = JSON.parse(result.content[0].text);
      expect(comments.map((c: { id: string }) => c.id)).toEqual([
        'comment1',
        'comment2',
      ]);
      expect(mockDriveAPI.comments.list).toHaveBeenCalledTimes(2);
      expect(mockDriveAPI.comments.list).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ pageSize: 100, pageToken: undefined }),
      );
      expect(mockDriveAPI.comments.list).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ pageToken: 'page2' }),
      );
    });

    it('should request quoted anchor text and nextPageToken', async () => {
      mockDriveAPI.comments.list.mockResolvedValue({
        data: { comments: [] },
      });

      await driveService.getComments({ fileId: 'test-doc-id' });

      const { fields } = mockDriveAPI.comments.list.mock.calls[0][0];
      expect(fields).toContain('quotedFileContent(value)');
      expect(fields).toContain('nextPageToken');
    });
  });

  describe('replyToComment', () => {
    it('should create a reply on the comment thread', async () => {
      mockDriveAPI.replies.create.mockResolvedValue({
        data: {
          id: 'reply1',
          content: 'Done.',
          createdTime: '2026-10-28T00:00:00Z',
        },
      });

      const result = await driveService.replyToComment({
        fileId: 'https://docs.google.com/document/d/test-doc-id/edit',
        commentId: 'comment1',
        content: 'Done.',
      });

      expect(mockDriveAPI.replies.create).toHaveBeenCalledWith({
        fileId: 'test-doc-id',
        commentId: 'comment1',
        fields: 'id, content, createdTime, action',
        requestBody: { content: 'Done.' },
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        fileId: 'test-doc-id',
        commentId: 'comment1',
        replyId: 'reply1',
        content: 'Done.',
        createdTime: '2026-10-28T00:00:00Z',
      });
    });

    it('should handle API errors gracefully', async () => {
      mockDriveAPI.replies.create.mockRejectedValue(
        new Error('Comment not found'),
      );

      const result = await driveService.replyToComment({
        fileId: 'test-doc-id',
        commentId: 'missing',
        content: 'Done.',
      });

      expect('isError' in result && result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Comment not found',
      });
    });
  });

  describe('resolveComment', () => {
    it('should resolve the thread with an empty reply', async () => {
      mockDriveAPI.replies.create.mockResolvedValue({
        data: { id: 'reply2', action: 'resolve' },
      });

      const result = await driveService.resolveComment({
        fileId: 'test-doc-id',
        commentId: 'comment1',
      });

      expect(mockDriveAPI.replies.create).toHaveBeenCalledWith(
        expect.objectContaining({
          commentId: 'comment1',
          requestBody: { action: 'resolve' },
        }),
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.replyId).toBe('reply2');
      expect(parsed.resolved).toBe(true);
    });

    it('should post the optional text with the resolution', async () => {
      mockDriveAPI.replies.create.mockResolvedValue({
        data: { id: 'reply3', content: 'Fixed the typo.', action: 'resolve' },
      });

      await driveService.resolveComment({
        fileId: 'test-doc-id',
        commentId: 'comment1',
        content: 'Fixed the typo.',
      });

      expect(mockDriveAPI.replies.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: { action: 'resolve', content: 'Fixed the typo.' },
        }),
      );
    });

    it('should handle API errors gracefully', async () => {
      mockDriveAPI.replies.create.mockRejectedValue(
        new Error('Insufficient permissions'),
      );

      const result = await driveService.resolveComment({
        fileId: 'test-doc-id',
        commentId: 'comment1',
      });

      expect('isError' in result && result.isError).toBe(true);
    });
  });
});
