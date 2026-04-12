/**
 * Factory for creating a new empty ScheduleDoc.
 *
 * Used when a paid user creates a new show from the show list.
 * Provides sensible defaults matching the sample show's settings.
 */

import { DOCUMENT_VERSION } from "./types.js";
import type { ScheduleDoc } from "./types.js";

export function newEmptyScheduleDoc(opts: {
  name: string;
  startDate: string;
  endDate: string;
}): ScheduleDoc {
  return {
    version: DOCUMENT_VERSION,
    show: {
      name: opts.name,
      startDate: opts.startDate,
      endDate: opts.endDate,
    },
    cast: [],
    crew: [],
    groups: [],
    eventTypes: [],
    schedule: {},
    conflicts: [],
    locationPresets: [],
    settings: {
      fontFamily: "Inter",
      fontHeading: "Playfair Display",
      fontTime: "Inter",
      fontNotes: "Inter",
      castDisplayMode: "actor",
      crewDisplayMode: "both",
      weekStartsOn: 0,
      weekdayDefaults: [
        { enabled: false, startTime: "19:00", endTime: "21:30" },
        { enabled: true, startTime: "19:00", endTime: "21:30" },
        { enabled: true, startTime: "19:00", endTime: "21:30" },
        { enabled: true, startTime: "19:00", endTime: "21:30" },
        { enabled: true, startTime: "19:00", endTime: "21:30" },
        { enabled: true, startTime: "19:00", endTime: "21:30" },
        { enabled: true, startTime: "10:00", endTime: "14:00" },
      ],
      defaultLocation: "",
      defaultEventType: "",
      timeIncrementMinutes: 15,
      dressCallWindowMinutes: 150,
      timeFormat: "12h",
      fontSizeScale: "normal",
      sizeEventType: "md",
      sizeTime: "md",
      sizeDescription: "md",
      sizeCastBadge: "md",
      sizeGroupBadge: "md",
      sizeNotes: "md",
      sizeLocation: "md",
      sizeConflicts: "md",
      showCastConflicts: true,
      showCrewConflicts: false,
      showEventTypes: true,
      showLocations: true,
      theme: "light",
      defaultsAssignedDates: [],
      showUsHolidays: true,
      showHolidays: true,
      customHolidays: [],
    },
  };
}
