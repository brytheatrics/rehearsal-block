/**
 * Prefilled sample show used for demo mode on the landing page.
 *
 * Loading this gives visitors a tangible sense of the app without asking
 * them to sign up or input any data. The save/export actions are disabled
 * in demo mode and trigger a paywall prompt.
 *
 * Keep this reasonably realistic - it's the first impression every
 * prospective customer will get.
 */

import type { ScheduleDoc } from "./types.js";
import { DOCUMENT_VERSION } from "./types.js";

export const sampleShow: ScheduleDoc = {
  version: DOCUMENT_VERSION,
  show: {
    name: "Romeo & Juliet",
    startDate: "2026-05-04",
    endDate: "2026-06-14",
  },
  cast: [
    { id: "c1", character: "Romeo", firstName: "Marcus", middleName: "James", lastName: "Chen", pronouns: "he/him", color: "#1565c0" },
    { id: "c2", character: "Juliet", firstName: "Ava", lastName: "Rodriguez", pronouns: "she/her", color: "#c2185b" },
    { id: "c3", character: "Mercutio", firstName: "Michael", lastName: "Patel", pronouns: "he/him", phone: "253-555-0142", color: "#6a1b9a" },
    { id: "c4", character: "Tybalt", firstName: "Sam", lastName: "O'Brien", pronouns: "they/them", color: "#d84315" },
    { id: "c5", character: "Nurse", firstName: "Diane", middleName: "Rose", lastName: "Walker", pronouns: "she/her", color: "#2e7d32" },
    { id: "c6", character: "Friar Laurence", firstName: "Theo", lastName: "Nakamura", color: "#5d4037" },
    { id: "c7", character: "Benvolio", firstName: "Riley", lastName: "Kim", pronouns: "he/they", color: "#00838f" },
    { id: "c8", character: "Lord Capulet", firstName: "Michael", lastName: "Thompson", suffix: "Jr.", pronouns: "he/him", color: "#424242" },
  ],
  groups: [
    {
      id: "g1",
      name: "Montagues",
      memberIds: ["c1", "c3", "c7"],
    },
    {
      id: "g2",
      name: "Capulets",
      memberIds: ["c2", "c4", "c5", "c8"],
    },
  ],
  eventTypes: [
    {
      id: "rehearsal",
      name: "Rehearsal",
      bgColor: "#e3f2fd",
      textColor: "#1565c0",
      isDressPerf: false,
    },
    {
      id: "tech",
      name: "Tech",
      bgColor: "#fff3e0",
      textColor: "#e65100",
      isDressPerf: false,
    },
    {
      id: "dress",
      name: "Dress Rehearsal",
      bgColor: "#f3e5f5",
      textColor: "#6a1b9a",
      isDressPerf: true,
    },
    {
      id: "performance",
      name: "Performance",
      bgColor: "#ffebee",
      textColor: "#c62828",
      isDressPerf: true,
    },
    {
      id: "dark",
      name: "Dark",
      bgColor: "#eceff1",
      textColor: "#546e7a",
      isDressPerf: false,
    },
  ],
  schedule: {
    "2026-05-04": {
      eventTypeId: "rehearsal",
      calls: [
        {
          id: "call1",
          label: "",
          time: "19:00",
          endTime: "21:30",
          calledActorIds: ["c1", "c2", "c6"],
          calledGroupIds: [],
        },
      ],
      description: "Read-through, Act 1",
      notes: "<p>Bring <strong>scripts</strong> and a pencil. We'll go scene by scene.</p>",
      location: "Rehearsal Hall",
    },
    "2026-05-06": {
      eventTypeId: "rehearsal",
      calls: [
        {
          id: "call2",
          label: "",
          time: "19:00",
          endTime: "21:30",
          calledActorIds: [],
          calledGroupIds: ["g1"],
        },
      ],
      description: "Blocking 1.1 - street brawl",
      notes: "<p>Fight choreography basics. Stretch before we start.</p>",
      location: "Main Stage",
    },
    "2026-05-08": {
      eventTypeId: "dark",
      calls: [],
      description: "",
      notes: "",
      location: "",
    },
    "2026-05-11": {
      eventTypeId: "rehearsal",
      calls: [
        {
          id: "call3",
          label: "",
          time: "19:00",
          endTime: "21:30",
          calledActorIds: ["c1", "c2"],
          calledGroupIds: [],
        },
      ],
      description: "Balcony scene (2.2)",
      notes: "<p>Romeo and Juliet - please have lines memorized through Act 2.</p>",
      location: "Main Stage",
    },
    "2026-05-13": {
      eventTypeId: "rehearsal",
      calls: [
        {
          id: "call_split_1",
          label: "",
          time: "19:00",
          endTime: "20:00",
          description: "Fight choreography (3.1)",
          location: "Main Stage",
          calledActorIds: ["c1", "c3", "c4"],
          calledGroupIds: [],
        },
        {
          id: "call_split_2",
          label: "",
          time: "19:00",
          endTime: "21:30",
          description: "Dance call",
          location: "Rehearsal Hall",
          // Mercutio (c3) is also in the fight call - deliberately
          // double-booked so the editor's warning is visible.
          calledActorIds: ["c2", "c3", "c5"],
          calledGroupIds: [],
        },
        {
          id: "call_split_3",
          label: "",
          time: "20:00",
          endTime: "21:30",
          description: "Blocking polish (3.2)",
          location: "Main Stage",
          calledActorIds: ["c1", "c4"],
          calledGroupIds: [],
        },
      ],
      description: "",
      notes: "<p>Split call night - check your block before you arrive.</p>",
      location: "",
    },
    "2026-06-11": {
      eventTypeId: "tech",
      calls: [
        {
          id: "call4",
          label: "",
          time: "18:00",
          endTime: "22:00",
          calledActorIds: [],
          calledGroupIds: ["g1", "g2"],
        },
      ],
      description: "Full tech run",
      notes: "<p>Costumes optional, but everyone in makeup.</p>",
      location: "Main Stage",
    },
    "2026-06-13": {
      eventTypeId: "dress",
      calls: [
        { id: "call5a", label: "Crew", time: "17:00", calledActorIds: [], calledGroupIds: [] },
        { id: "call5b", label: "Actor", time: "18:00", calledActorIds: [], calledGroupIds: ["g1", "g2"] },
      ],
      description: "",
      notes: "<p>Full run with costumes, lights, and sound.</p>",
      location: "Main Stage",
      curtainTime: "19:30",
    },
  },
  conflicts: [
    { id: "conf1", actorId: "c3", date: "2026-05-06", label: "Work" },
    {
      id: "conf2",
      actorId: "c2",
      date: "2026-05-11",
      label: "Night class",
      startTime: "20:00",
      endTime: "22:00",
    },
    { id: "conf3", actorId: "c5", date: "2026-05-13", label: "Out of town" },
  ],
  locationPresets: ["Main Stage", "Rehearsal Hall", "Black Box"],
  settings: {
    fontFamily: "Inter",
    fontHeading: "Playfair Display",
    fontTime: "Inter",
    fontNotes: "Inter",
    castDisplayMode: "actor",
    weekStartsOn: 0,
    weekdayDefaults: [
      { enabled: false, startTime: "19:00", endTime: "21:30" }, // Sun
      { enabled: true, startTime: "19:00", endTime: "21:30" }, // Mon
      { enabled: true, startTime: "19:00", endTime: "21:30" }, // Tue
      { enabled: true, startTime: "19:00", endTime: "21:30" }, // Wed
      { enabled: true, startTime: "19:00", endTime: "21:30" }, // Thu
      { enabled: true, startTime: "19:00", endTime: "21:30" }, // Fri
      { enabled: true, startTime: "10:00", endTime: "14:00" }, // Sat
    ],
    defaultLocation: "Main Stage",
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
    theme: "light",
    defaultsAssignedDates: [],
  },
};
