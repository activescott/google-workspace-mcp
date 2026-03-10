import { z } from 'zod';

export const calendarListOutputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().nullable().optional(),
      summary: z.string().nullable().optional(),
    }),
  ),
});

const calendarDateTimeSchema = z.object({
  dateTime: z.string().optional(),
  date: z.string().optional(),
  timeZone: z.string().optional(),
}).optional();

const calendarAttendeeSchema = z.object({
  email: z.string().optional(),
  displayName: z.string().optional(),
  responseStatus: z.string().optional(),
  self: z.boolean().optional(),
  organizer: z.boolean().optional(),
  optional: z.boolean().optional(),
  comment: z.string().optional(),
}).passthrough();

const calendarEventSchema = z.object({
  id: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  start: calendarDateTimeSchema,
  end: calendarDateTimeSchema,
  htmlLink: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  attendees: z.array(calendarAttendeeSchema).nullable().optional(),
}).passthrough();

export const calendarListEventsOutputSchema = z.object({
  items: z.array(calendarEventSchema),
});

export const calendarGetEventOutputSchema = calendarEventSchema;

export const calendarCreateEventOutputSchema = calendarEventSchema;

export const calendarUpdateEventOutputSchema = calendarEventSchema;

export const calendarDeleteEventOutputSchema = z.object({
  message: z.string(),
});

export const calendarRespondOutputSchema = z.object({
  eventId: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  responseStatus: z.string(),
  message: z.string(),
});

export const calendarFindFreeTimeOutputSchema = z.object({
  start: z.string(),
  end: z.string(),
});
