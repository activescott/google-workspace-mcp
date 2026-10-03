/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper class for creating RFC 2822 compliant MIME messages for Gmail API
 */
export class MimeHelper {
  /**
   * Creates a base64url-encoded MIME message for Gmail API
   */
  public static createMimeMessage({
    to,
    subject,
    body,
    from,
    cc,
    bcc,
    replyTo,
    inReplyTo,
    references,
    isHtml = false,
  }: {
    to: string;
    subject: string;
    body: string;
    from?: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    inReplyTo?: string;
    references?: string;
    isHtml?: boolean;
  }): string {
    // Encode subject for UTF-8 support
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

    // Build message headers
    const messageParts: string[] = [];

    // Add From header if provided, otherwise Gmail will use the authenticated user
    if (from) {
      messageParts.push(`From: ${from}`);
    }

    messageParts.push(`To: ${to}`);

    if (cc) {
      messageParts.push(`Cc: ${cc}`);
    }

    if (bcc) {
      messageParts.push(`Bcc: ${bcc}`);
    }

    if (replyTo) {
      messageParts.push(`Reply-To: ${replyTo}`);
    }

    if (inReplyTo) {
      messageParts.push(
        `In-Reply-To: ${MimeHelper.sanitizeHeaderValue(inReplyTo)}`,
      );
    }

    if (references) {
      messageParts.push(
        `References: ${MimeHelper.sanitizeHeaderValue(references)}`,
      );
    }

    messageParts.push(`Subject: ${utf8Subject}`);

    // Add content type based on whether it's HTML or plain text
    if (isHtml) {
      messageParts.push('Content-Type: text/html; charset=utf-8');
    } else {
      messageParts.push('Content-Type: text/plain; charset=utf-8');
    }

    messageParts.push(''); // Empty line between headers and body
    messageParts.push(body);

    // Join all parts with CRLF as per RFC 2822
    const message = messageParts.join('\r\n');

    // Encode to base64url format required by Gmail API
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return encodedMessage;
  }

  /**
   * Strips characters that would allow MIME header injection from a header
   * value: CR, LF, and all other C0 control characters, plus DEL (0x7f).
   * The explicit \r\n in the regex is redundant with \x00-\x1f but kept to
   * make the header-injection intent obvious.
   */
  private static sanitizeHeaderValue(value: string): string {
    return value.replace(/[\r\n\x00-\x1f\x7f]/g, '');
  }

  /**
   * Sanitizes a filename for safe use inside a quoted Content-Disposition
   * filename parameter: removes control characters (preventing header
   * injection) and escapes backslashes and double quotes (preventing
   * parameter injection / early quote termination).
   */
  private static sanitizeHeaderFilename(filename: string): string {
    return MimeHelper.sanitizeHeaderValue(filename)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  /**
   * Strips the angle brackets and whitespace a caller may include around a
   * Content-ID, so `<logo>`, `logo` and `cid:logo` all produce `<logo>`.
   */
  private static sanitizeContentId(contentId: string): string {
    return MimeHelper.sanitizeHeaderValue(contentId)
      .replace(/^cid:/i, '')
      .replace(/[<>\s]/g, '');
  }

  private static pushAttachmentPart(
    messageParts: string[],
    boundary: string,
    attachment: {
      filename: string;
      content: Buffer | string;
      contentType?: string;
      inline?: boolean;
      contentId?: string;
    },
  ): void {
    const safeContentType = MimeHelper.sanitizeHeaderValue(
      attachment.contentType || 'application/octet-stream',
    );
    const safeFilename = MimeHelper.sanitizeHeaderFilename(attachment.filename);
    messageParts.push(`--${boundary}`);
    messageParts.push(`Content-Type: ${safeContentType}`);
    messageParts.push('Content-Transfer-Encoding: base64');
    if (attachment.inline) {
      const contentId = MimeHelper.sanitizeContentId(
        attachment.contentId || attachment.filename,
      );
      messageParts.push(`Content-ID: <${contentId}>`);
      messageParts.push(
        `Content-Disposition: inline; filename="${safeFilename}"`,
      );
    } else {
      messageParts.push(
        `Content-Disposition: attachment; filename="${safeFilename}"`,
      );
    }
    messageParts.push('');

    const content =
      typeof attachment.content === 'string'
        ? attachment.content
        : attachment.content.toString('base64');

    // Add content in chunks of 76 characters as per MIME spec
    const chunks = content.match(/.{1,76}/g) || [];
    messageParts.push(...chunks);
  }

  /**
   * Creates a MIME message with attachments. Inline attachments go in a
   * multipart/related part next to the body so an HTML body can reference
   * them as `cid:<contentId>`; the rest go in the outer multipart/mixed.
   */
  public static createMimeMessageWithAttachments({
    to,
    subject,
    body,
    from,
    cc,
    bcc,
    replyTo,
    inReplyTo,
    references,
    attachments,
    isHtml = false,
  }: {
    to: string;
    subject: string;
    body: string;
    from?: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    inReplyTo?: string;
    references?: string;
    attachments?: Array<{
      filename: string;
      content: Buffer | string;
      contentType?: string;
      inline?: boolean;
      contentId?: string;
    }>;
    isHtml?: boolean;
  }): string {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

    const messageParts: string[] = [];

    // Headers
    if (from) {
      messageParts.push(`From: ${from}`);
    }
    messageParts.push(`To: ${to}`);
    if (cc) {
      messageParts.push(`Cc: ${cc}`);
    }
    if (bcc) {
      messageParts.push(`Bcc: ${bcc}`);
    }
    if (replyTo) {
      messageParts.push(`Reply-To: ${replyTo}`);
    }
    messageParts.push(`Subject: ${utf8Subject}`);
    messageParts.push('MIME-Version: 1.0');

    if (!attachments || attachments.length === 0) {
      // Simple message without attachments
      return this.createMimeMessage({
        to,
        subject,
        body,
        from,
        cc,
        bcc,
        replyTo,
        inReplyTo,
        references,
        isHtml,
      });
    }

    // Multipart message with attachments
    if (inReplyTo) {
      messageParts.push(
        `In-Reply-To: ${MimeHelper.sanitizeHeaderValue(inReplyTo)}`,
      );
    }
    if (references) {
      messageParts.push(
        `References: ${MimeHelper.sanitizeHeaderValue(references)}`,
      );
    }
    const inlineAttachments = attachments.filter((att) => att.inline);
    const fileAttachments = attachments.filter((att) => !att.inline);
    const relatedBoundary = `related_${boundary}`;

    const bodyParts: string[] = [];
    if (isHtml) {
      bodyParts.push('Content-Type: text/html; charset=utf-8');
    } else {
      bodyParts.push('Content-Type: text/plain; charset=utf-8');
    }
    bodyParts.push('');
    bodyParts.push(body);

    if (fileAttachments.length === 0) {
      messageParts.push(
        `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
      );
    } else {
      messageParts.push(
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
      );
    }
    messageParts.push('');

    if (inlineAttachments.length > 0) {
      if (fileAttachments.length > 0) {
        messageParts.push(`--${boundary}`);
        messageParts.push(
          `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
        );
        messageParts.push('');
      }
      messageParts.push(`--${relatedBoundary}`);
      messageParts.push(...bodyParts);
      for (const attachment of inlineAttachments) {
        MimeHelper.pushAttachmentPart(
          messageParts,
          relatedBoundary,
          attachment,
        );
      }
      messageParts.push(`--${relatedBoundary}--`);
      if (fileAttachments.length === 0) {
        return MimeHelper.encodeBase64Url(messageParts.join('\r\n'));
      }
    } else {
      messageParts.push(`--${boundary}`);
      messageParts.push(...bodyParts);
    }

    for (const attachment of fileAttachments) {
      MimeHelper.pushAttachmentPart(messageParts, boundary, attachment);
    }

    // End boundary
    messageParts.push(`--${boundary}--`);

    return MimeHelper.encodeBase64Url(messageParts.join('\r\n'));
  }

  private static encodeBase64Url(message: string): string {
    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Decodes a base64url-encoded string (inverse of encoding)
   */
  public static decodeBase64Url(encoded: string): string {
    // Add back padding if needed
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
}
