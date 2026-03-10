import { describe, it, expect } from '@jest/globals';
import {
  calendarListOutputSchema,
  calendarListEventsOutputSchema,
  calendarGetEventOutputSchema,
  calendarDeleteEventOutputSchema,
  calendarRespondOutputSchema,
  calendarFindFreeTimeOutputSchema,
} from '../../services/calendar-schemas';

describe('calendar-schemas', () => {
  describe('calendarListOutputSchema', () => {
    it('should validate a calendars list', () => {
      const data = {
        items: [
          { id: 'primary', summary: 'My Calendar' },
          { id: 'work', summary: 'Work' },
        ],
      };
      expect(calendarListOutputSchema.safeParse(data).success).toBe(true);
    });

    it('should validate an empty calendars list', () => {
      expect(calendarListOutputSchema.safeParse({ items: [] }).success).toBe(true);
    });

    it('should reject a bare array', () => {
      expect(calendarListOutputSchema.safeParse([]).success).toBe(false);
    });
  });

  describe('calendarListEventsOutputSchema', () => {
    it('should validate an events list', () => {
      const data = {
        items: [
          {
            id: 'evt-1',
            summary: 'Meeting',
            start: { dateTime: '2026-03-10T09:00:00Z' },
            end: { dateTime: '2026-03-10T10:00:00Z' },
            status: 'confirmed',
          },
        ],
      };
      expect(calendarListEventsOutputSchema.safeParse(data).success).toBe(true);
    });

    it('should validate an empty events list', () => {
      expect(calendarListEventsOutputSchema.safeParse({ items: [] }).success).toBe(true);
    });

    it('should reject a bare array', () => {
      expect(calendarListEventsOutputSchema.safeParse([]).success).toBe(false);
    });
  });

  describe('calendarGetEventOutputSchema', () => {
    it('should validate an event with extra fields (passthrough)', () => {
      const data = {
        id: 'evt-1',
        summary: 'Meeting',
        start: { dateTime: '2026-03-10T09:00:00Z' },
        end: { dateTime: '2026-03-10T10:00:00Z' },
        creator: { email: 'alice@example.com' },
        organizer: { email: 'alice@example.com' },
      };
      expect(calendarGetEventOutputSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('calendarDeleteEventOutputSchema', () => {
    it('should validate a delete result', () => {
      const data = { message: 'Successfully deleted event evt-1' };
      expect(calendarDeleteEventOutputSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('calendarRespondOutputSchema', () => {
    it('should validate a respond result', () => {
      const data = {
        eventId: 'evt-1',
        summary: 'Meeting',
        responseStatus: 'accepted',
        message: 'Successfully accepted the meeting invitation',
      };
      expect(calendarRespondOutputSchema.safeParse(data).success).toBe(true);
    });
  });

  describe('calendarFindFreeTimeOutputSchema', () => {
    it('should validate a free time result', () => {
      const data = {
        start: '2026-03-10T11:00:00Z',
        end: '2026-03-10T12:00:00Z',
      };
      expect(calendarFindFreeTimeOutputSchema.safeParse(data).success).toBe(true);
    });
  });
});
