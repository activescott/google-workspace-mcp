/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, slides_v1 } from 'googleapis';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { request } from 'gaxios';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { extractDocId } from '../utils/IdUtils';
import { gaxiosOptions } from '../utils/GaxiosConfig';

export const PREDEFINED_LAYOUTS = [
  'BLANK',
  'TITLE',
  'TITLE_AND_BODY',
  'TITLE_AND_TWO_COLUMNS',
  'TITLE_ONLY',
  'SECTION_HEADER',
  'SECTION_TITLE_AND_DESCRIPTION',
  'ONE_COLUMN_TEXT',
  'MAIN_POINT',
  'BIG_NUMBER',
] as const;
export type PredefinedLayout = (typeof PREDEFINED_LAYOUTS)[number];

export const RANGE_TYPES = ['ALL', 'FIXED_RANGE', 'FROM_START_INDEX'] as const;
export type RangeType = (typeof RANGE_TYPES)[number];

export type SlidesTextRange =
  | { type: 'ALL' }
  | { type: 'FIXED_RANGE'; startIndex: number; endIndex: number }
  | { type: 'FROM_START_INDEX'; startIndex: number };

export const THUMBNAIL_SIZES = ['SMALL', 'MEDIUM', 'LARGE'] as const;
export type ThumbnailSize = (typeof THUMBNAIL_SIZES)[number];

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
};

type ImageToolResult = {
  isError?: boolean;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  >;
};

const EMU_PER_PT = 12700;

/** An affine transform as the Slides API writes it, with unset fields filled. */
type Affine = {
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
  translateX: number;
  translateY: number;
};

const IDENTITY: Affine = {
  scaleX: 1,
  scaleY: 1,
  shearX: 0,
  shearY: 0,
  translateX: 0,
  translateY: 0,
};

export type SlideParagraph = {
  startIndex: number;
  endIndex: number;
  text: string;
  bullet?: { nestingLevel: number; glyph?: string };
  links?: Array<{
    startIndex: number;
    endIndex: number;
    text: string;
    url?: string;
    slideObjectId?: string;
    relativeLink?: string;
  }>;
};

export type SlideElement = {
  objectId: string;
  type: string;
  placeholder?: string;
  title?: string;
  description?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  paragraphs?: SlideParagraph[];
  table?: { rows: number; columns: number; cells: string[][] };
  children?: SlideElement[];
};

export class SlidesService {
  constructor(private authManager: AuthManager) {}

  private async getSlidesClient(): Promise<slides_v1.Slides> {
    const auth = await this.authManager.getAuthenticatedClient();
    const options = { ...gaxiosOptions, auth };
    return google.slides({ version: 'v1', ...options });
  }

  public getText = async ({ presentationId }: { presentationId: string }) => {
    logToFile(
      `[SlidesService] Starting getText for presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;

      const slides = await this.getSlidesClient();
      // Get the presentation with all necessary fields
      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'title,slides(pageElements(shape(text,shapeProperties),table(tableRows(tableCells(text)))))',
      });

      let content = '';

      // Add presentation title
      if (presentation.data.title) {
        content += `Presentation Title: ${presentation.data.title}\n\n`;
      }

      // Process each slide
      if (presentation.data.slides) {
        presentation.data.slides.forEach((slide, slideIndex) => {
          content += `\n--- Slide ${slideIndex + 1} ---\n`;

          if (slide.pageElements) {
            slide.pageElements.forEach((element) => {
              // Extract text from shapes
              if (element.shape && element.shape.text) {
                const shapeText = this.extractTextFromTextContent(
                  element.shape.text,
                );
                if (shapeText) {
                  content += shapeText + '\n';
                }
              }

              // Extract text from tables
              if (element.table && element.table.tableRows) {
                content += '\n--- Table Data ---\n';
                element.table.tableRows.forEach((row) => {
                  const rowText: string[] = [];
                  if (row.tableCells) {
                    row.tableCells.forEach((cell) => {
                      const cellText = cell.text
                        ? this.extractTextFromTextContent(cell.text)
                        : '';
                      rowText.push(cellText.trim());
                    });
                  }
                  content += rowText.join(' | ') + '\n';
                });
                content += '--- End Table Data ---\n';
              }
            });
          }
          content += '\n';
        });
      }

      logToFile(`[SlidesService] Finished getText for presentation: ${id}`);
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
      logToFile(`[SlidesService] Error during slides.getText: ${errorMessage}`);
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

  private extractTextFromTextContent(
    textContent: slides_v1.Schema$TextContent,
  ): string {
    let text = '';
    if (textContent.textElements) {
      textContent.textElements.forEach((element) => {
        if (element.textRun && element.textRun.content) {
          text += element.textRun.content;
        } else if (element.paragraphMarker) {
          // Add newline for paragraph markers
          text += '\n';
        }
      });
    }
    return text;
  }

  public getMetadata = async ({
    presentationId,
  }: {
    presentationId: string;
  }) => {
    logToFile(
      `[SlidesService] Starting getMetadata for presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;

      const slides = await this.getSlidesClient();
      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'presentationId,title,slides(objectId),pageSize,notesMaster,masters,layouts',
      });

      const metadata = {
        presentationId: presentation.data.presentationId,
        title: presentation.data.title,
        slideCount: presentation.data.slides?.length || 0,
        slides:
          presentation.data.slides?.map(({ objectId }) => ({ objectId })) ?? [],
        pageSize: presentation.data.pageSize,
        hasMasters: !!presentation.data.masters?.length,
        hasLayouts: !!presentation.data.layouts?.length,
        hasNotesMaster: !!presentation.data.notesMaster,
      };

      logToFile(`[SlidesService] Finished getMetadata for presentation: ${id}`);
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
        `[SlidesService] Error during slides.getMetadata: ${errorMessage}`,
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

  private async downloadToLocal(url: string, localPath: string) {
    logToFile(`[SlidesService] Downloading from ${url} to ${localPath}`);
    if (!path.isAbsolute(localPath)) {
      throw new Error('localPath must be an absolute path.');
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(localPath), { recursive: true });

    const response = await request({
      url,
      responseType: 'arraybuffer',
      ...gaxiosOptions,
    });

    await fs.writeFile(localPath, Buffer.from(response.data as ArrayBuffer));
    logToFile(`[SlidesService] Downloaded successfully to ${localPath}`);
    return localPath;
  }

  public getImages = async ({
    presentationId,
    localPath,
  }: {
    presentationId: string;
    localPath: string;
  }) => {
    logToFile(
      `[SlidesService] Starting getImages for presentation: ${presentationId} (localPath: ${localPath})`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();
      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'slides(objectId,pageElements(objectId,title,description,image(contentUrl,sourceUrl)))',
      });

      const images = await Promise.all(
        (presentation.data.slides ?? []).flatMap((slide, index) =>
          (slide.pageElements ?? [])
            .filter((element) => element.image)
            .map(async (element) => {
              const imageData: any = {
                slideIndex: index + 1,
                slideObjectId: slide.objectId,
                elementObjectId: element.objectId,
                title: element.title,
                description: element.description,
                contentUrl: element.image?.contentUrl,
                sourceUrl: element.image?.sourceUrl,
              };

              if (imageData.contentUrl) {
                const filename = `slide_${imageData.slideIndex}_${element.objectId}.png`;
                const fullPath = path.join(localPath, filename);
                try {
                  await this.downloadToLocal(imageData.contentUrl, fullPath);
                  imageData.localPath = fullPath;
                } catch (downloadError) {
                  logToFile(
                    `[SlidesService] Failed to download image ${element.objectId}: ${downloadError}`,
                  );
                  imageData.downloadError = String(downloadError);
                }
              }

              return imageData;
            }),
        ),
      );

      logToFile(`[SlidesService] Finished getImages for presentation: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ images }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SlidesService] Error during slides.getImages: ${errorMessage}`,
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

  private parseJsonObject(
    raw: string,
    paramName: string,
    example: string,
  ): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Invalid JSON for ${paramName} parameter: ${detail}. Expected a JSON string like '${example}'.`,
      );
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      const got =
        parsed === null
          ? 'null'
          : Array.isArray(parsed)
            ? 'array'
            : typeof parsed;
      throw new Error(
        `Invalid ${paramName} parameter: expected a JSON object, got ${got}.`,
      );
    }
    return parsed as Record<string, unknown>;
  }

  private buildRange(range: SlidesTextRange): slides_v1.Schema$Range {
    // The discriminated union at the Zod boundary makes invalid shapes
    // unrepresentable for MCP callers, but the service can also be invoked
    // directly (e.g. from tests or other code paths) so we re-validate the
    // discriminant value defensively.
    if (!RANGE_TYPES.includes(range.type)) {
      throw new Error(
        `Invalid range type "${range.type}". Expected one of: ${RANGE_TYPES.join(', ')}.`,
      );
    }
    if (range.type === 'FIXED_RANGE') {
      if (range.startIndex === undefined || range.endIndex === undefined) {
        throw new Error('FIXED_RANGE requires both startIndex and endIndex.');
      }
      return {
        type: range.type,
        startIndex: range.startIndex,
        endIndex: range.endIndex,
      };
    }
    if (range.type === 'FROM_START_INDEX') {
      if (range.startIndex === undefined) {
        throw new Error('FROM_START_INDEX requires startIndex.');
      }
      return { type: range.type, startIndex: range.startIndex };
    }
    return { type: range.type };
  }

  private formatError(method: string, error: unknown): ToolResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logToFile(`[SlidesService] Error during ${method}: ${errorMessage}`);
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: errorMessage }),
        },
      ],
    };
  }

  private formatResult(data: unknown): ToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(data),
        },
      ],
    };
  }

  public create = async ({ title }: { title: string }) => {
    logToFile(`[SlidesService] Creating presentation: ${title}`);
    try {
      const slides = await this.getSlidesClient();
      const presentation = await slides.presentations.create({
        requestBody: { title },
      });

      const result = {
        presentationId: presentation.data.presentationId,
        title: presentation.data.title,
        url: `https://docs.google.com/presentation/d/${presentation.data.presentationId}/edit`,
      };

      logToFile(
        `[SlidesService] Created presentation: ${result.presentationId}`,
      );
      return this.formatResult(result);
    } catch (error) {
      return this.formatError('slides.create', error);
    }
  };

  public addSlide = async ({
    presentationId,
    insertionIndex,
    layoutId,
    predefinedLayout,
    objectId,
  }: {
    presentationId: string;
    insertionIndex?: number;
    layoutId?: string;
    predefinedLayout?: PredefinedLayout;
    objectId?: string;
  }) => {
    logToFile(
      `[SlidesService] Adding slide to presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const createSlideRequest: slides_v1.Schema$CreateSlideRequest = {};
      if (insertionIndex !== undefined) {
        createSlideRequest.insertionIndex = insertionIndex;
      }
      if (objectId) {
        createSlideRequest.objectId = objectId;
      }
      if (layoutId) {
        createSlideRequest.slideLayoutReference = { layoutId };
      } else if (predefinedLayout) {
        if (!PREDEFINED_LAYOUTS.includes(predefinedLayout)) {
          throw new Error(
            `Invalid predefinedLayout "${predefinedLayout}". Expected one of: ${PREDEFINED_LAYOUTS.join(', ')}.`,
          );
        }
        createSlideRequest.slideLayoutReference = { predefinedLayout };
      }

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ createSlide: createSlideRequest }],
        },
      });

      const slideObjectId = response.data.replies?.[0]?.createSlide?.objectId;
      if (!slideObjectId) {
        throw new Error(
          'createSlide returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Added slide: ${slideObjectId}`);
      return this.formatResult({
        presentationId: id,
        slideObjectId,
      });
    } catch (error) {
      return this.formatError('slides.addSlide', error);
    }
  };

  public deleteSlide = async ({
    presentationId,
    slideObjectId,
  }: {
    presentationId: string;
    slideObjectId: string;
  }) => {
    logToFile(
      `[SlidesService] Deleting slide ${slideObjectId} from presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ deleteObject: { objectId: slideObjectId } }],
        },
      });

      logToFile(`[SlidesService] Deleted slide: ${slideObjectId}`);
      return this.formatResult({
        presentationId: id,
        deletedSlideObjectId: slideObjectId,
      });
    } catch (error) {
      return this.formatError('slides.deleteSlide', error);
    }
  };

  public duplicateSlide = async ({
    presentationId,
    slideObjectId,
  }: {
    presentationId: string;
    slideObjectId: string;
  }) => {
    logToFile(
      `[SlidesService] Duplicating slide ${slideObjectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ duplicateObject: { objectId: slideObjectId } }],
        },
      });

      const newObjectId = response.data.replies?.[0]?.duplicateObject?.objectId;
      if (!newObjectId) {
        throw new Error(
          'duplicateObject returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Duplicated slide to: ${newObjectId}`);
      return this.formatResult({
        presentationId: id,
        sourceSlideObjectId: slideObjectId,
        newSlideObjectId: newObjectId,
      });
    } catch (error) {
      return this.formatError('slides.duplicateSlide', error);
    }
  };

  public reorderSlides = async ({
    presentationId,
    slideObjectIds,
    insertionIndex,
  }: {
    presentationId: string;
    slideObjectIds: string[];
    insertionIndex: number;
  }) => {
    logToFile(
      `[SlidesService] Reordering slides in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              updateSlidesPosition: {
                slideObjectIds,
                insertionIndex,
              },
            },
          ],
        },
      });

      logToFile(`[SlidesService] Reordered slides in presentation: ${id}`);
      return this.formatResult({
        presentationId: id,
        slideObjectIds,
        insertionIndex,
      });
    } catch (error) {
      return this.formatError('slides.reorderSlides', error);
    }
  };

  public getSpeakerNotes = async ({
    presentationId,
  }: {
    presentationId: string;
  }) => {
    logToFile(
      `[SlidesService] Getting speaker notes for presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'slides(objectId,slideProperties(notesPage(notesProperties(speakerNotesObjectId),pageElements(objectId,shape(text)))))',
      });

      const notesPerSlide = (presentation.data.slides ?? []).map(
        (slide, index) => {
          const notesPage = slide.slideProperties?.notesPage;
          const speakerNotesObjectId =
            notesPage?.notesProperties?.speakerNotesObjectId;

          let notesText = '';
          if (speakerNotesObjectId && notesPage?.pageElements) {
            const notesShape = notesPage.pageElements.find(
              (el) => el.objectId === speakerNotesObjectId,
            );
            if (notesShape?.shape?.text) {
              notesText = this.extractTextFromTextContent(
                notesShape.shape.text,
              ).trim();
            }
          }

          return {
            slideIndex: index,
            slideObjectId: slide.objectId,
            speakerNotesObjectId,
            notes: notesText,
          };
        },
      );

      logToFile(
        `[SlidesService] Retrieved speaker notes for presentation: ${id}`,
      );
      return this.formatResult({ presentationId: id, slides: notesPerSlide });
    } catch (error) {
      return this.formatError('slides.getSpeakerNotes', error);
    }
  };

  public updateSpeakerNotes = async ({
    presentationId,
    slideObjectId,
    notes,
  }: {
    presentationId: string;
    slideObjectId: string;
    notes: string;
  }) => {
    logToFile(
      `[SlidesService] Updating speaker notes for slide ${slideObjectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'slides(objectId,slideProperties(notesPage(notesProperties(speakerNotesObjectId),pageElements(objectId,shape(text)))))',
      });

      const slide = presentation.data.slides?.find(
        (s) => s.objectId === slideObjectId,
      );
      if (!slide) {
        throw new Error(`Slide not found: ${slideObjectId}`);
      }

      const speakerNotesObjectId =
        slide.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
      if (!speakerNotesObjectId) {
        throw new Error(
          `Speaker notes object not found for slide: ${slideObjectId}`,
        );
      }

      const requests: slides_v1.Schema$Request[] = [];

      const notesShape = slide.slideProperties?.notesPage?.pageElements?.find(
        (el) => el.objectId === speakerNotesObjectId,
      );

      if (notesShape?.shape?.text?.textElements?.length) {
        requests.push({
          deleteText: {
            objectId: speakerNotesObjectId,
            textRange: { type: 'ALL' },
          },
        });
      }

      if (notes.length > 0) {
        requests.push({
          insertText: {
            objectId: speakerNotesObjectId,
            insertionIndex: 0,
            text: notes,
          },
        });
      }

      const noOp = requests.length === 0;
      if (!noOp) {
        await slides.presentations.batchUpdate({
          presentationId: id,
          requestBody: { requests },
        });
      } else {
        logToFile(
          `[SlidesService] updateSpeakerNotes is a no-op for slide ${slideObjectId} (existing notes already match input).`,
        );
      }

      logToFile(
        `[SlidesService] Updated speaker notes for slide: ${slideObjectId}`,
      );
      return this.formatResult({
        presentationId: id,
        slideObjectId,
        speakerNotesObjectId,
        notes,
        noOp,
      });
    } catch (error) {
      return this.formatError('slides.updateSpeakerNotes', error);
    }
  };

  public replaceAllText = async ({
    presentationId,
    findText,
    replaceText,
    matchCase = true,
  }: {
    presentationId: string;
    findText: string;
    replaceText: string;
    matchCase?: boolean;
  }) => {
    logToFile(
      `[SlidesService] Replacing all text in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              replaceAllText: {
                containsText: { text: findText, matchCase },
                replaceText,
              },
            },
          ],
        },
      });

      const replaceReply = response.data.replies?.[0]?.replaceAllText;
      if (!replaceReply) {
        throw new Error(
          'replaceAllText returned no reply; batchUpdate reply was empty or malformed.',
        );
      }
      // Google omits `occurrencesChanged` when zero matches were found, so a
      // missing field within a present reply is a legitimate zero.
      const occurrencesChanged = replaceReply.occurrencesChanged ?? 0;

      logToFile(
        `[SlidesService] Replaced ${occurrencesChanged} occurrences in presentation: ${id}`,
      );
      return this.formatResult({
        presentationId: id,
        findText,
        replaceText,
        occurrencesChanged,
      });
    } catch (error) {
      return this.formatError('slides.replaceAllText', error);
    }
  };

  public insertText = async ({
    presentationId,
    objectId,
    text,
    insertionIndex = 0,
  }: {
    presentationId: string;
    objectId: string;
    text: string;
    insertionIndex?: number;
  }) => {
    logToFile(
      `[SlidesService] Inserting text into object ${objectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              insertText: {
                objectId,
                insertionIndex,
                text,
              },
            },
          ],
        },
      });

      logToFile(
        `[SlidesService] Inserted text into object ${objectId} in presentation: ${id}`,
      );
      return this.formatResult({
        presentationId: id,
        objectId,
        insertionIndex,
        textLength: text.length,
      });
    } catch (error) {
      return this.formatError('slides.insertText', error);
    }
  };

  public deleteText = async ({
    presentationId,
    objectId,
    range = { type: 'ALL' },
  }: {
    presentationId: string;
    objectId: string;
    range?: SlidesTextRange;
  }) => {
    logToFile(
      `[SlidesService] Deleting text from object ${objectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const textRange = this.buildRange(range);

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              deleteText: {
                objectId,
                textRange,
              },
            },
          ],
        },
      });

      logToFile(
        `[SlidesService] Deleted text from object ${objectId} in presentation: ${id}`,
      );
      return this.formatResult({
        presentationId: id,
        objectId,
        textRange,
      });
    } catch (error) {
      return this.formatError('slides.deleteText', error);
    }
  };

  public addShape = async ({
    presentationId,
    slideObjectId,
    shapeType,
    x,
    y,
    width,
    height,
    objectId,
  }: {
    presentationId: string;
    slideObjectId: string;
    shapeType: string;
    x: number;
    y: number;
    width: number;
    height: number;
    objectId?: string;
  }) => {
    logToFile(
      `[SlidesService] Adding shape to slide ${slideObjectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const createShapeRequest: slides_v1.Schema$CreateShapeRequest = {
        shapeType,
        elementProperties: {
          pageObjectId: slideObjectId,
          size: {
            width: { magnitude: width, unit: 'PT' },
            height: { magnitude: height, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: x,
            translateY: y,
            unit: 'PT',
          },
        },
      };
      if (objectId) {
        createShapeRequest.objectId = objectId;
      }

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ createShape: createShapeRequest }],
        },
      });

      const newObjectId = response.data.replies?.[0]?.createShape?.objectId;
      if (!newObjectId) {
        throw new Error(
          'createShape returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Added shape: ${newObjectId}`);
      return this.formatResult({
        presentationId: id,
        slideObjectId,
        shapeObjectId: newObjectId,
        shapeType,
      });
    } catch (error) {
      return this.formatError('slides.addShape', error);
    }
  };

  public addImage = async ({
    presentationId,
    slideObjectId,
    imageUrl,
    x,
    y,
    width,
    height,
    objectId,
  }: {
    presentationId: string;
    slideObjectId: string;
    imageUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    objectId?: string;
  }) => {
    logToFile(
      `[SlidesService] Adding image to slide ${slideObjectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const createImageRequest: slides_v1.Schema$CreateImageRequest = {
        url: imageUrl,
        elementProperties: {
          pageObjectId: slideObjectId,
          size: {
            width: { magnitude: width, unit: 'PT' },
            height: { magnitude: height, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: x,
            translateY: y,
            unit: 'PT',
          },
        },
      };
      if (objectId) {
        createImageRequest.objectId = objectId;
      }

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ createImage: createImageRequest }],
        },
      });

      const newObjectId = response.data.replies?.[0]?.createImage?.objectId;
      if (!newObjectId) {
        throw new Error(
          'createImage returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Added image: ${newObjectId}`);
      return this.formatResult({
        presentationId: id,
        slideObjectId,
        imageObjectId: newObjectId,
        imageUrl,
      });
    } catch (error) {
      return this.formatError('slides.addImage', error);
    }
  };

  public addTable = async ({
    presentationId,
    slideObjectId,
    rows,
    columns,
    x,
    y,
    width,
    height,
    objectId,
  }: {
    presentationId: string;
    slideObjectId: string;
    rows: number;
    columns: number;
    x: number;
    y: number;
    width: number;
    height: number;
    objectId?: string;
  }) => {
    logToFile(
      `[SlidesService] Adding table to slide ${slideObjectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const createTableRequest: slides_v1.Schema$CreateTableRequest = {
        rows,
        columns,
        elementProperties: {
          pageObjectId: slideObjectId,
          size: {
            width: { magnitude: width, unit: 'PT' },
            height: { magnitude: height, unit: 'PT' },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: x,
            translateY: y,
            unit: 'PT',
          },
        },
      };
      if (objectId) {
        createTableRequest.objectId = objectId;
      }

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ createTable: createTableRequest }],
        },
      });

      const newObjectId = response.data.replies?.[0]?.createTable?.objectId;
      if (!newObjectId) {
        throw new Error(
          'createTable returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Added table: ${newObjectId}`);
      return this.formatResult({
        presentationId: id,
        slideObjectId,
        tableObjectId: newObjectId,
        rows,
        columns,
      });
    } catch (error) {
      return this.formatError('slides.addTable', error);
    }
  };

  public updateTextStyle = async ({
    presentationId,
    objectId,
    style,
    range = { type: 'ALL' },
    fields,
  }: {
    presentationId: string;
    objectId: string;
    style: string;
    range?: SlidesTextRange;
    fields: string;
  }) => {
    logToFile(
      `[SlidesService] Updating text style for object ${objectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const parsedStyle = this.parseJsonObject(
        style,
        'style',
        '{"bold": true}',
      ) as slides_v1.Schema$TextStyle;

      const textRange = this.buildRange(range);

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              updateTextStyle: {
                objectId,
                textRange,
                style: parsedStyle,
                fields,
              },
            },
          ],
        },
      });

      logToFile(
        `[SlidesService] Updated text style for object ${objectId} in presentation: ${id}`,
      );
      return this.formatResult({
        presentationId: id,
        objectId,
        textRange,
        fields,
      });
    } catch (error) {
      return this.formatError('slides.updateTextStyle', error);
    }
  };

  public updateShapeProperties = async ({
    presentationId,
    objectId,
    shapeProperties,
    fields,
  }: {
    presentationId: string;
    objectId: string;
    shapeProperties: string;
    fields: string;
  }) => {
    logToFile(
      `[SlidesService] Updating shape properties for object ${objectId} in presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const parsedProps = this.parseJsonObject(
        shapeProperties,
        'shapeProperties',
        '{"shapeBackgroundFill": {...}}',
      ) as slides_v1.Schema$ShapeProperties;

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              updateShapeProperties: {
                objectId,
                shapeProperties: parsedProps,
                fields,
              },
            },
          ],
        },
      });

      logToFile(
        `[SlidesService] Updated shape properties for object ${objectId} in presentation: ${id}`,
      );
      return this.formatResult({
        presentationId: id,
        objectId,
        fields,
      });
    } catch (error) {
      return this.formatError('slides.updateShapeProperties', error);
    }
  };

  public listElements = async ({
    presentationId,
    slideObjectId,
  }: {
    presentationId: string;
    slideObjectId?: string;
  }) => {
    logToFile(
      `[SlidesService] Listing page elements for presentation: ${presentationId}${slideObjectId ? `, slide: ${slideObjectId}` : ''}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      // The whole of each page element: groups nest to any depth, and a
      // field mask cannot name a recursive path.
      const presentation = await slides.presentations.get({
        presentationId: id,
        fields: 'presentationId,pageSize,slides(objectId,pageElements)',
      });

      const allSlides = presentation.data.slides ?? [];
      const wanted = allSlides
        .map((slide, slideIndex) => ({ slide, slideIndex }))
        .filter(
          ({ slide }) => !slideObjectId || slide.objectId === slideObjectId,
        );
      if (slideObjectId && wanted.length === 0) {
        throw new Error(`Slide not found: ${slideObjectId}`);
      }

      const pageSize = presentation.data.pageSize;
      const result = {
        presentationId: id,
        unit: 'PT',
        pageSize:
          pageSize?.width && pageSize?.height
            ? {
                width: this.toPt(pageSize.width),
                height: this.toPt(pageSize.height),
              }
            : undefined,
        slides: wanted.map(({ slide, slideIndex }) => ({
          slideIndex,
          slideObjectId: slide.objectId,
          elements: (slide.pageElements ?? []).map((element) =>
            this.describeElement(element, IDENTITY),
          ),
        })),
      };

      logToFile(`[SlidesService] Listed page elements for presentation: ${id}`);
      return this.formatResult(result);
    } catch (error) {
      return this.formatError('slides.listElements', error);
    }
  };

  private toPt(dimension: slides_v1.Schema$Dimension): number {
    const magnitude = dimension.magnitude ?? 0;
    return dimension.unit === 'PT' ? magnitude : magnitude / EMU_PER_PT;
  }

  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /**
   * The API's PageElement.transform: "To compute the absolute transform,
   * preconcatenate a page element's transform with the transforms of all of
   * its parent groups." So a child's absolute transform is parent × child.
   */
  private compose(
    parent: Affine,
    child: slides_v1.Schema$AffineTransform | undefined,
  ): Affine {
    const toPt = (n: number | null | undefined) =>
      child?.unit === 'PT' ? (n ?? 0) : (n ?? 0) / EMU_PER_PT;
    const c: Affine = {
      scaleX: child?.scaleX ?? 1,
      scaleY: child?.scaleY ?? 1,
      shearX: child?.shearX ?? 0,
      shearY: child?.shearY ?? 0,
      translateX: toPt(child?.translateX),
      translateY: toPt(child?.translateY),
    };
    const p = parent;
    return {
      scaleX: p.scaleX * c.scaleX + p.shearX * c.shearY,
      shearY: p.shearY * c.scaleX + p.scaleY * c.shearY,
      shearX: p.scaleX * c.shearX + p.shearX * c.scaleY,
      scaleY: p.shearY * c.shearX + p.scaleY * c.scaleY,
      translateX:
        p.scaleX * c.translateX + p.shearX * c.translateY + p.translateX,
      translateY:
        p.shearY * c.translateX + p.scaleY * c.translateY + p.translateY,
    };
  }

  private describeElement(
    element: slides_v1.Schema$PageElement,
    parent: Affine,
  ): SlideElement {
    const transform = this.compose(parent, element.transform ?? undefined);
    const described: SlideElement = {
      objectId: element.objectId ?? '',
      type: this.elementType(element),
    };
    const placeholder = element.shape?.placeholder?.type;
    if (placeholder) described.placeholder = placeholder;
    if (element.title) described.title = element.title;
    if (element.description) described.description = element.description;

    if (element.transform) {
      described.x = this.round(transform.translateX);
      described.y = this.round(transform.translateY);
    }
    // A placeholder can leave its size to the layout, and a group has none
    // of its own; both are left out rather than guessed.
    if (element.size?.width && element.size?.height) {
      described.width = this.round(
        this.toPt(element.size.width) *
          Math.hypot(transform.scaleX, transform.shearY),
      );
      described.height = this.round(
        this.toPt(element.size.height) *
          Math.hypot(transform.shearX, transform.scaleY),
      );
    }

    if (element.shape?.text) {
      described.paragraphs = this.paragraphsOf(element.shape.text);
    }
    if (element.table) {
      described.table = {
        rows: element.table.rows ?? element.table.tableRows?.length ?? 0,
        columns: element.table.columns ?? 0,
        cells: (element.table.tableRows ?? []).map((row) =>
          (row.tableCells ?? []).map((cell) =>
            cell.text ? this.extractTextFromTextContent(cell.text).trim() : '',
          ),
        ),
      };
    }
    if (element.elementGroup) {
      described.children = (element.elementGroup.children ?? []).map((child) =>
        this.describeElement(child, transform),
      );
    }
    return described;
  }

  private elementType(element: slides_v1.Schema$PageElement): string {
    if (element.shape) return element.shape.shapeType ?? 'SHAPE';
    if (element.image) return 'IMAGE';
    if (element.table) return 'TABLE';
    if (element.line) return 'LINE';
    if (element.elementGroup) return 'GROUP';
    if (element.video) return 'VIDEO';
    if (element.sheetsChart) return 'SHEETS_CHART';
    if (element.wordArt) return 'WORD_ART';
    if (element.speakerSpotlight) return 'SPEAKER_SPOTLIGHT';
    return 'UNKNOWN';
  }

  /**
   * Each paragraph with the indexes slides.insertText, slides.deleteText and
   * slides.updateTextStyle take. The API leaves startIndex out when it is 0.
   * endIndex includes the paragraph's closing newline; text does not.
   */
  private paragraphsOf(text: slides_v1.Schema$TextContent): SlideParagraph[] {
    const paragraphs: SlideParagraph[] = [];
    let current: SlideParagraph | undefined;
    for (const element of text.textElements ?? []) {
      const startIndex = element.startIndex ?? 0;
      const endIndex = element.endIndex ?? startIndex;
      if (element.paragraphMarker) {
        current = { startIndex, endIndex, text: '' };
        const bullet = element.paragraphMarker.bullet;
        if (bullet) {
          current.bullet = { nestingLevel: bullet.nestingLevel ?? 0 };
          const glyph = bullet.glyph?.trim();
          if (glyph) current.bullet.glyph = glyph;
        }
        paragraphs.push(current);
        continue;
      }
      const content = element.textRun?.content ?? element.autoText?.content;
      if (content === undefined || content === null || !current) continue;
      current.text += content;
      const link = element.textRun?.style?.link;
      if (link) {
        const linkText = content.replace(/\n$/, '');
        const previous = current.links?.[current.links.length - 1];
        const sameTarget =
          previous &&
          previous.endIndex === startIndex &&
          previous.url === (link.url ?? undefined) &&
          previous.slideObjectId === (link.pageObjectId ?? undefined) &&
          previous.relativeLink === (link.relativeLink ?? undefined);
        if (sameTarget) {
          previous.endIndex = startIndex + linkText.length;
          previous.text += linkText;
        } else {
          current.links ??= [];
          current.links.push({
            startIndex,
            endIndex: startIndex + linkText.length,
            text: linkText,
            ...(link.url ? { url: link.url } : {}),
            ...(link.pageObjectId ? { slideObjectId: link.pageObjectId } : {}),
            ...(link.relativeLink ? { relativeLink: link.relativeLink } : {}),
          });
        }
      }
    }
    for (const paragraph of paragraphs) {
      paragraph.text = paragraph.text.replace(/\n$/, '');
    }
    return paragraphs;
  }

  public getSlideImage = async ({
    presentationId,
    slideObjectId,
    size = 'MEDIUM',
  }: {
    presentationId: string;
    slideObjectId: string;
    size?: ThumbnailSize;
  }): Promise<ImageToolResult> => {
    logToFile(
      `[SlidesService] Rendering slide ${slideObjectId} of presentation: ${presentationId} (${size})`,
    );
    try {
      if (!THUMBNAIL_SIZES.includes(size)) {
        throw new Error(
          `Invalid size "${size}". Expected one of: ${THUMBNAIL_SIZES.join(', ')}.`,
        );
      }
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();
      const thumbnail = await slides.presentations.pages.getThumbnail({
        presentationId: id,
        pageObjectId: slideObjectId,
        'thumbnailProperties.mimeType': 'PNG',
        'thumbnailProperties.thumbnailSize': size,
      });

      const contentUrl = thumbnail.data.contentUrl;
      if (!contentUrl) {
        throw new Error('getThumbnail returned no contentUrl.');
      }
      // The contentUrl is short-lived and needs no credential.
      const response = await request({
        url: contentUrl,
        responseType: 'arraybuffer',
        ...gaxiosOptions,
      });
      const data = Buffer.from(response.data as ArrayBuffer).toString('base64');

      logToFile(`[SlidesService] Rendered slide: ${slideObjectId}`);
      return {
        content: [
          { type: 'image' as const, data, mimeType: 'image/png' },
          {
            type: 'text' as const,
            text: JSON.stringify({
              presentationId: id,
              slideObjectId,
              width: thumbnail.data.width,
              height: thumbnail.data.height,
            }),
          },
        ],
      };
    } catch (error) {
      return this.formatError('slides.getSlideImage', error);
    }
  };

  public getSlideThumbnail = async ({
    presentationId,
    slideObjectId,
    localPath,
  }: {
    presentationId: string;
    slideObjectId: string;
    localPath: string;
  }) => {
    logToFile(
      `[SlidesService] Starting getSlideThumbnail for presentation: ${presentationId}, slide: ${slideObjectId} (localPath: ${localPath})`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();
      const thumbnail = await slides.presentations.pages.getThumbnail({
        presentationId: id,
        pageObjectId: slideObjectId,
      });

      const result: any = { ...thumbnail.data };

      if (result.contentUrl) {
        try {
          await this.downloadToLocal(result.contentUrl, localPath);
          result.localPath = localPath;
        } catch (downloadError) {
          logToFile(
            `[SlidesService] Failed to download thumbnail for slide ${slideObjectId}: ${downloadError}`,
          );
          result.downloadError = String(downloadError);
        }
      }

      logToFile(
        `[SlidesService] Finished getSlideThumbnail for slide: ${slideObjectId}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SlidesService] Error during slides.getSlideThumbnail: ${errorMessage}`,
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
}
