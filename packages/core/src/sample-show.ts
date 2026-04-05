/**
 * Prefilled sample show used for demo mode on the landing page.
 *
 * Loading this gives visitors a tangible sense of the app without asking
 * them to sign up or input any data. The save/export actions are disabled
 * in demo mode and trigger a paywall prompt.
 *
 * Keep this reasonably realistic — it's the first impression every
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
    { id: "c1", character: "Romeo", firstName: "Marcus", lastName: "Chen", color: "#1565c0" },
    { id: "c2", character: "Juliet", firstName: "Ava", lastName: "Rodriguez", color: "#c2185b" },
    { id: "c3", character: "Mercutio", firstName: "Jordan", lastName: "Patel", color: "#6a1b9a" },
    { id: "c4", character: "Tybalt", firstName: "Sam", lastName: "O'Brien", color: "#d84315" },
    { id: "c5", character: "Nurse", firstName: "Diane", lastName: "Walker", color: "#2e7d32" },
    { id: "c6", character: "Friar Laurence", firstName: "Theo", lastName: "Nakamura", color: "#5d4037" },
    { id: "c7", character: "Benvolio", firstName: "Riley", lastName: "Kim", color: "#00838f" },
    { id: "c8", character: "Lord Capulet", firstName: "Michael", lastName: "Thompson", color: "#424242" },
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
      defaultStart: "19:00",
      defaultEnd: "21:30",
      isDressPerf: false,
    },
    {
      id: "tech",
      name: "Tech",
      bgColor: "#fff3e0",
      textColor: "#e65100",
      defaultStart: "18:00",
      defaultEnd: "22:00",
      isDressPerf: false,
    },
    {
      id: "dress",
      name: "Dress Rehearsal",
      bgColor: "#f3e5f5",
      textColor: "#6a1b9a",
      defaultStart: "19:30",
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
      description: "Blocking 1.1 — street brawl",
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
      notes: "<p>Romeo and Juliet — please have lines memorized through Act 2.</p>",
      location: "Main Stage",
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
        { id: "call5a", label: "Crew Call", time: "17:00", calledActorIds: [], calledGroupIds: [] },
        { id: "call5b", label: "Actor Call", time: "18:00", calledActorIds: [], calledGroupIds: ["g1", "g2"] },
      ],
      description: "Final dress",
      notes: "<p>Curtain at 19:30 sharp.</p>",
      location: "Main Stage",
    },
  },
  conflicts: [
    { id: "conf1", actorId: "c3", date: "2026-05-06", label: "Work" },
  ],
  locationPresets: ["Main Stage", "Rehearsal Hall", "Black Box", "Costume Shop"],
  settings: {
    fontFamily: "Inter",
    castDisplayMode: "actor",
    weekStartsOn: 0,
  },
};
