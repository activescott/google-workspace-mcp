/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import stripMarkdown from 'strip-markdown';
import { unified } from 'unified';

function suppressElementHandler(): void {
  // Intentionally returns nothing to remove element from output
}

/**
 * Converts HTML to Markdown using the rehype/remark pipeline.
 * Removes images, videos, audio, and comments.
 * Flattens anchor tags (keeps text, removes link structure).
 */
export async function htmlToMarkdown(html: string): Promise<string> {
  const file = await unified()
    .use(rehypeParse)
    .use(remarkGfm)
    .use(rehypeRemark, {
      nodeHandlers: {
        comment: () => {
          // Intentionally empty - strips HTML comments from output
        },
      },
      handlers: {
        a: (state: any, node: any) => {
          const children = state.all(node);
          return children;
        },
        img: suppressElementHandler,
        video: suppressElementHandler,
        audio: suppressElementHandler,
      },
    })
    .use(remarkStringify)
    .process(html);

  return String(file);
}

/**
 * Converts HTML to plain text by running the markdown pipeline
 * then stripping all markdown formatting.
 */
export async function htmlToText(html: string): Promise<string> {
  const file = await unified()
    .use(rehypeParse)
    .use(remarkGfm)
    .use(rehypeRemark, {
      nodeHandlers: {
        comment: () => {
          // Intentionally empty - strips HTML comments from output
        },
      },
      handlers: {
        a: (state: any, node: any) => {
          const children = state.all(node);
          return children;
        },
        img: suppressElementHandler,
        video: suppressElementHandler,
        audio: suppressElementHandler,
      },
    })
    .use(stripMarkdown)
    .use(remarkStringify)
    .process(html);

  return String(file);
}
