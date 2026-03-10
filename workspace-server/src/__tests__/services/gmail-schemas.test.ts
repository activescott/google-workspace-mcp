import { describe, it, expect } from '@jest/globals';
import {
  gmailSearchOutputSchema,
  gmailGetOutputSchema,
  gmailSendOutputSchema,
  gmailCreateDraftOutputSchema,
  gmailListLabelsOutputSchema,
  gmailCreateLabelOutputSchema,
  gmailModifyOutputSchema,
  gmailDownloadAttachmentOutputSchema,
} from '../../services/gmail-schemas';

describe('gmail-schemas', () => {
  describe('gmailSearchOutputSchema', () => {
    it('should validate a valid search result', () => {
      const data = {
        messages: [
          { id: 'msg-1', threadId: 'thread-1' },
          { id: 'msg-2', threadId: 'thread-2' },
        ],
        nextPageToken: 'token123',
        resultSizeEstimate: 42,
      };
      expect(gmailSearchOutputSchema.safeParse(data).success).toBe(true);
    });

    it('should validate with optional fields missing', () => {
      const data = {
        messages: [],
      };
      expect(gmailSearchOutputSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('gmailGetOutputSchema', () => {
    it('should validate a full message', () => {
      const data = {
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'Hello...',
        subject: 'Test',
        from: 'alice@example.com',
        to: 'bob@example.com',
        date: 'Mon, 10 Mar 2026',
        body: 'Hello world',
        attachments: [
          { filename: 'doc.pdf', mimeType: 'application/pdf', attachmentId: 'att-1', size: 1024 },
        ],
      };
      expect(gmailGetOutputSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('gmailSendOutputSchema', () => {
    it('should validate a send result', () => {
      const data = {
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: ['SENT'],
        status: 'sent',
      };
      expect(gmailSendOutputSchema.safeParse(data).success).toBe(true);
    });

    it('should reject wrong status', () => {
      const data = {
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: ['SENT'],
        status: 'draft',
      };
      expect(gmailSendOutputSchema.safeParse(data).success).toBe(false);
    });
  });

  describe('gmailCreateDraftOutputSchema', () => {
    it('should validate a draft result', () => {
      const data = {
        id: 'draft-1',
        message: { id: 'msg-1', threadId: 'thread-1', labelIds: ['DRAFT'] },
        status: 'draft_created',
      };
      expect(gmailCreateDraftOutputSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('gmailListLabelsOutputSchema', () => {
    it('should validate a labels list', () => {
      const data = {
        labels: [
          { id: 'INBOX', name: 'INBOX', type: 'system', messageListVisibility: 'show', labelListVisibility: 'labelShow' },
        ],
      };
      expect(gmailListLabelsOutputSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('gmailCreateLabelOutputSchema', () => {
    it('should validate a created label', () => {
      const data = {
        id: 'Label_1',
        name: 'My Label',
        type: 'user',
        messageListVisibility: 'show',
        labelListVisibility: 'labelShow',
        status: 'created',
      };
      expect(gmailCreateLabelOutputSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('gmailModifyOutputSchema', () => {
    it('should validate a modify result with extra fields', () => {
      const data = {
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: ['INBOX'],
        historyId: '12345',
      };
      expect(gmailModifyOutputSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('gmailDownloadAttachmentOutputSchema', () => {
    it('should validate a download result', () => {
      const data = {
        message: 'Attachment downloaded successfully to /tmp/file.pdf',
        path: '/tmp/file.pdf',
      };
      expect(gmailDownloadAttachmentOutputSchema.safeParse(data).success).toBe(true);
    });
  });
});
