import { z } from 'zod';

export const gmailSearchOutputSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string().nullable().optional(),
      threadId: z.string().nullable().optional(),
    }),
  ),
  nextPageToken: z.string().nullable().optional(),
  resultSizeEstimate: z.number().nullable().optional(),
});

const gmailAttachmentSchema = z.object({
  filename: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  attachmentId: z.string().nullable().optional(),
  size: z.number().nullable().optional(),
});

export const gmailGetOutputSchema = z.object({
  id: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
  labelIds: z.array(z.string()).nullable().optional(),
  snippet: z.string().nullable().optional(),
  subject: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  date: z.string().optional(),
  body: z.string().optional(),
  attachments: z.array(gmailAttachmentSchema).optional(),
});

export const gmailGetRawOutputSchema = z.object({}).passthrough();

export const gmailDownloadAttachmentOutputSchema = z.object({
  message: z.string(),
  path: z.string(),
});

export const gmailModifyOutputSchema = z.object({
  id: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
  labelIds: z.array(z.string()).nullable().optional(),
}).passthrough();

export const gmailSendOutputSchema = z.object({
  id: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
  labelIds: z.array(z.string()).nullable().optional(),
  status: z.literal('sent'),
});

export const gmailCreateDraftOutputSchema = z.object({
  id: z.string().nullable().optional(),
  message: z.object({
    id: z.string().nullable().optional(),
    threadId: z.string().nullable().optional(),
    labelIds: z.array(z.string()).nullable().optional(),
  }),
  status: z.literal('draft_created'),
});

export const gmailSendDraftOutputSchema = z.object({
  id: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
  labelIds: z.array(z.string()).nullable().optional(),
  status: z.literal('sent'),
});

const gmailLabelSchema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  messageListVisibility: z.string().nullable().optional(),
  labelListVisibility: z.string().nullable().optional(),
});

export const gmailListLabelsOutputSchema = z.object({
  labels: z.array(gmailLabelSchema),
});

export const gmailCreateLabelOutputSchema = gmailLabelSchema.extend({
  status: z.literal('created'),
});
