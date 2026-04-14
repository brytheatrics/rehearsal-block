/**
 * CSV import utilities for bulk-importing cast members.
 *
 * Handles parsing, column auto-detection, and merge logic
 * so users can map arbitrary CSV columns to CastMember fields.
 */

import type { CastMember, Conflict, CrewMember } from "./types.js";
import { CAST_COLOR_PALETTE } from "./schedule.js";
import { formatPhone } from "./cast.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Fields on CastMember that can be mapped from a CSV column.
 *  conflict* fields are not stored on CastMember - they're consumed
 *  afterward to produce Conflict objects for rows that include a date. */
export type CastField =
  | "firstName"
  | "lastName"
  | "middleName"
  | "suffix"
  | "character"
  | "pronouns"
  | "email"
  | "phone"
  | "conflictDate"
  | "conflictStartTime"
  | "conflictEndTime"
  | "conflictLabel";

export const CAST_FIELD_LABELS: Record<CastField, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  middleName: "Middle Name",
  suffix: "Suffix",
  character: "Character",
  pronouns: "Pronouns",
  email: "Email",
  phone: "Phone",
  conflictDate: "Conflict Date",
  conflictStartTime: "Conflict Start Time",
  conflictEndTime: "Conflict End Time",
  conflictLabel: "Conflict Reason",
};

/** Fields on CrewMember that can be mapped from a CSV column. */
export type CrewField =
  | "firstName"
  | "lastName"
  | "middleName"
  | "suffix"
  | "role"
  | "pronouns"
  | "email"
  | "phone"
  | "conflictDate"
  | "conflictStartTime"
  | "conflictEndTime"
  | "conflictLabel";

export const CREW_FIELD_LABELS: Record<CrewField, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  middleName: "Middle Name",
  suffix: "Suffix",
  role: "Role",
  pronouns: "Pronouns",
  email: "Email",
  phone: "Phone",
  conflictDate: "Conflict Date",
  conflictStartTime: "Conflict Start Time",
  conflictEndTime: "Conflict End Time",
  conflictLabel: "Conflict Reason",
};

export type ImportMode = "add" | "fill" | "overwrite";

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
}

export interface ImportResult<T = CastMember> {
  added: T[];
  updated: { id: string; patch: Partial<T> }[];
  skipped: number;
}

// ---------------------------------------------------------------------------
// Header aliases (used by both parser and auto-mapper)
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, CastField> = {
  // firstName
  "first name": "firstName",
  "first": "firstName",
  "fname": "firstName",
  "given name": "firstName",
  // lastName
  "last name": "lastName",
  "last": "lastName",
  "lname": "lastName",
  "surname": "lastName",
  "family name": "lastName",
  // middleName
  "middle name": "middleName",
  "middle": "middleName",
  "mi": "middleName",
  // suffix
  "suffix": "suffix",
  // character
  "character": "character",
  "character name": "character",
  "role": "character",
  "part": "character",
  // pronouns
  "pronouns": "pronouns",
  // email
  "email": "email",
  "e-mail": "email",
  "email address": "email",
  // phone
  "phone": "phone",
  "phone number": "phone",
  "telephone": "phone",
  "tel": "phone",
  "cell": "phone",
  "mobile": "phone",
  // Combined name (handled specially)
  "name": "firstName",
  "full name": "firstName",
  "actor": "firstName",
  "actor name": "firstName",
  // Conflict columns (joint import: cast + conflicts on one sheet)
  "conflict date": "conflictDate",
  "conflict start": "conflictStartTime",
  "conflict start time": "conflictStartTime",
  "conflict end": "conflictEndTime",
  "conflict end time": "conflictEndTime",
  "conflict reason": "conflictLabel",
  "conflict label": "conflictLabel",
  "conflict note": "conflictLabel",
  "conflict notes": "conflictLabel",
  "conflict type": "conflictLabel",
};

// ---------------------------------------------------------------------------
// CSV Parser
// ---------------------------------------------------------------------------

/**
 * Parse CSV text into headers and rows. Handles:
 * - Quoted fields (double-quote)
 * - Commas inside quotes
 * - Escaped quotes ("" inside quoted field)
 * - CRLF and LF line endings
 */
export function parseCsvText(text: string): CsvParseResult {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row: string[] = [];
    // Parse one row
    while (i < len) {
      let value = "";
      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            value += text[i];
            i++;
          }
        }
        // Skip to comma or end of line
        if (i < len && text[i] === ",") {
          i++;
          row.push(value);
          continue;
        }
      } else {
        // Unquoted field
        while (i < len && text[i] !== "," && text[i] !== "\r" && text[i] !== "\n") {
          value += text[i];
          i++;
        }
        if (i < len && text[i] === ",") {
          i++;
          row.push(value);
          continue;
        }
      }
      row.push(value);
      break;
    }
    // Skip line ending
    if (i < len && text[i] === "\r") i++;
    if (i < len && text[i] === "\n") i++;

    // Skip fully empty rows
    if (row.length === 1 && row[0] === "") continue;
    rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  // Detect whether the first row looks like headers or data.
  // If any cell in the first row matches a known header alias, treat it as headers.
  const firstRow = rows[0]!;
  const hasHeaders = firstRow.some((cell) => {
    const normalized = cell.trim().toLowerCase().replace(/[_\-]/g, " ");
    return normalized in HEADER_ALIASES;
  });

  if (hasHeaders) {
    return { headers: firstRow, rows: rows.slice(1) };
  }
  // No recognizable headers - generate generic column names and keep all rows as data
  const headers = firstRow.map((_, idx) => `Column ${idx + 1}`);
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Column auto-detection
// ---------------------------------------------------------------------------

/**
 * Auto-map CSV column indices to CastMember fields based on header names.
 * Returns a mapping from column index to field (or null for "Skip").
 */
export function autoMapColumns(headers: string[]): (CastField | null)[] {
  const used = new Set<CastField>();
  const mapping: (CastField | null)[] = [];

  for (const h of headers) {
    const normalized = h.trim().toLowerCase().replace(/[_\-]/g, " ");
    const field = HEADER_ALIASES[normalized] ?? null;
    if (field && !used.has(field)) {
      mapping.push(field);
      used.add(field);
    } else {
      mapping.push(null);
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Row to CastMember conversion
// ---------------------------------------------------------------------------

/**
 * Convert parsed CSV rows into CastMember objects using the column mapping.
 * Skips rows where both firstName and lastName are empty.
 */
export function mapRowsToCast(
  rows: string[][],
  mapping: (CastField | null)[],
  startColorIndex: number,
): CastMember[] {
  const members: CastMember[] = [];

  for (const row of rows) {
    const raw: Partial<Record<CastField, string>> = {};
    for (let c = 0; c < mapping.length; c++) {
      const field = mapping[c];
      if (field && c < row.length) {
        raw[field] = row[c]!.trim();
      }
    }

    const firstName = raw.firstName ?? "";
    const lastName = raw.lastName ?? "";
    if (!firstName && !lastName) continue;

    const colorIdx = (startColorIndex + members.length) % CAST_COLOR_PALETTE.length;
    members.push({
      id: `actor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName,
      lastName,
      character: raw.character ?? "",
      color: CAST_COLOR_PALETTE[colorIdx] ?? "#424242",
      middleName: raw.middleName || undefined,
      suffix: raw.suffix || undefined,
      pronouns: raw.pronouns || undefined,
      email: raw.email || undefined,
      phone: raw.phone ? formatPhone(raw.phone) : undefined,
    });
  }
  return members;
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

function nameKey(first: string, last: string): string {
  return `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}`;
}

/**
 * Merge imported cast members with an existing cast list.
 *
 * - "add": only add members whose name doesn't match anyone existing
 * - "fill": match by name, fill empty fields, add new members
 * - "overwrite": match by name, overwrite non-empty CSV fields, add new members
 */
export function mergeCastImport(
  existing: CastMember[],
  incoming: CastMember[],
  mode: ImportMode,
): ImportResult {
  const added: CastMember[] = [];
  const updated: { id: string; patch: Partial<CastMember> }[] = [];
  let skipped = 0;

  const existingByName = new Map<string, CastMember>();
  for (const m of existing) {
    existingByName.set(nameKey(m.firstName, m.lastName), m);
  }

  const MERGE_FIELDS: (keyof CastMember)[] = [
    "middleName", "suffix", "character", "pronouns", "email", "phone",
  ];

  for (const inc of incoming) {
    const key = nameKey(inc.firstName, inc.lastName);
    const match = existingByName.get(key);

    if (!match) {
      added.push(inc);
      continue;
    }

    if (mode === "add") {
      skipped++;
      continue;
    }

    // Build patch
    const patch: Partial<CastMember> = {};
    for (const field of MERGE_FIELDS) {
      const newVal = inc[field];
      if (!newVal) continue; // CSV has nothing for this field
      if (mode === "fill") {
        const existing = match[field];
        if (!existing) {
          (patch as Record<string, string>)[field] = newVal;
        }
      } else {
        // overwrite
        (patch as Record<string, string>)[field] = newVal;
      }
    }

    if (Object.keys(patch).length > 0) {
      updated.push({ id: match.id, patch });
    } else {
      skipped++;
    }
  }

  return { added, updated, skipped };
}

// ---------------------------------------------------------------------------
// Crew-specific functions
// ---------------------------------------------------------------------------

/** Header aliases for crew columns (same as cast but "role"/"character" map to "role"). */
const CREW_HEADER_ALIASES: Record<string, CrewField> = {
  "first name": "firstName",
  "first": "firstName",
  "fname": "firstName",
  "given name": "firstName",
  "last name": "lastName",
  "last": "lastName",
  "lname": "lastName",
  "surname": "lastName",
  "family name": "lastName",
  "middle name": "middleName",
  "middle": "middleName",
  "mi": "middleName",
  "suffix": "suffix",
  "role": "role",
  "position": "role",
  "title": "role",
  "job": "role",
  "department": "role",
  "character": "role",
  "pronouns": "pronouns",
  "email": "email",
  "e-mail": "email",
  "email address": "email",
  "phone": "phone",
  "phone number": "phone",
  "telephone": "phone",
  "tel": "phone",
  "cell": "phone",
  "mobile": "phone",
  "name": "firstName",
  "full name": "firstName",
  "conflict date": "conflictDate",
  "conflict start": "conflictStartTime",
  "conflict start time": "conflictStartTime",
  "conflict end": "conflictEndTime",
  "conflict end time": "conflictEndTime",
  "conflict reason": "conflictLabel",
  "conflict label": "conflictLabel",
  "conflict note": "conflictLabel",
  "conflict notes": "conflictLabel",
  "conflict type": "conflictLabel",
};

export function autoMapCrewColumns(headers: string[]): (CrewField | null)[] {
  const used = new Set<CrewField>();
  const mapping: (CrewField | null)[] = [];

  for (const h of headers) {
    const normalized = h.trim().toLowerCase().replace(/[_\-]/g, " ");
    const field = CREW_HEADER_ALIASES[normalized] ?? null;
    if (field && !used.has(field)) {
      mapping.push(field);
      used.add(field);
    } else {
      mapping.push(null);
    }
  }
  return mapping;
}

export function mapRowsToCrew(
  rows: string[][],
  mapping: (CrewField | null)[],
  startColorIndex: number,
): CrewMember[] {
  const members: CrewMember[] = [];

  for (const row of rows) {
    const raw: Partial<Record<CrewField, string>> = {};
    for (let c = 0; c < mapping.length; c++) {
      const field = mapping[c];
      if (field && c < row.length) {
        raw[field] = row[c]!.trim();
      }
    }

    const firstName = raw.firstName ?? "";
    const lastName = raw.lastName ?? "";
    if (!firstName && !lastName) continue;

    const colorIdx = (startColorIndex + members.length) % CAST_COLOR_PALETTE.length;
    members.push({
      id: `crew_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName,
      lastName,
      role: raw.role ?? "",
      color: CAST_COLOR_PALETTE[colorIdx] ?? "#424242",
      middleName: raw.middleName || undefined,
      suffix: raw.suffix || undefined,
      pronouns: raw.pronouns || undefined,
      email: raw.email || undefined,
      phone: raw.phone ? formatPhone(raw.phone) : undefined,
    });
  }
  return members;
}

export function mergeCrewImport(
  existing: CrewMember[],
  incoming: CrewMember[],
  mode: ImportMode,
): ImportResult<CrewMember> {
  const added: CrewMember[] = [];
  const updated: { id: string; patch: Partial<CrewMember> }[] = [];
  let skipped = 0;

  const existingByName = new Map<string, CrewMember>();
  for (const m of existing) {
    existingByName.set(nameKey(m.firstName, m.lastName), m);
  }

  const MERGE_FIELDS: (keyof CrewMember)[] = [
    "middleName", "suffix", "role", "pronouns", "email", "phone",
  ];

  for (const inc of incoming) {
    const key = nameKey(inc.firstName, inc.lastName);
    const match = existingByName.get(key);

    if (!match) {
      added.push(inc);
      continue;
    }

    if (mode === "add") {
      skipped++;
      continue;
    }

    const patch: Partial<CrewMember> = {};
    for (const field of MERGE_FIELDS) {
      const newVal = inc[field];
      if (!newVal) continue;
      if (mode === "fill") {
        const existing = match[field];
        if (!existing) {
          (patch as Record<string, string>)[field] = newVal;
        }
      } else {
        (patch as Record<string, string>)[field] = newVal;
      }
    }

    if (Object.keys(patch).length > 0) {
      updated.push({ id: match.id, patch });
    } else {
      skipped++;
    }
  }

  return { added, updated, skipped };
}


// ===========================================================================
// Conflict CSV import
// ===========================================================================

/** Fields on a Conflict that can be mapped from a CSV column. */
export type ConflictField =
  | "name"        // person's name (matched against cast/crew firstName + lastName)
  | "date"        // ISO date YYYY-MM-DD (or any common format we can parse)
  | "startTime"   // optional HH:MM for timed conflicts
  | "endTime"     // optional HH:MM for timed conflicts
  | "label";      // optional reason/label

export const CONFLICT_FIELD_LABELS: Record<ConflictField, string> = {
  name: "Name",
  date: "Date",
  startTime: "Start Time",
  endTime: "End Time",
  label: "Reason",
};

const CONFLICT_HEADER_ALIASES: Record<string, ConflictField> = {
  "name": "name",
  "actor": "name",
  "actor name": "name",
  "person": "name",
  "full name": "name",
  "first name": "name",
  "date": "date",
  "conflict date": "date",
  "day": "date",
  "start time": "startTime",
  "start": "startTime",
  "from": "startTime",
  "begin": "startTime",
  "end time": "endTime",
  "end": "endTime",
  "until": "endTime",
  "to": "endTime",
  "finish": "endTime",
  "reason": "label",
  "label": "label",
  "note": "label",
  "notes": "label",
  "description": "label",
  "type": "label",
};

export function autoMapConflictColumns(headers: string[]): (ConflictField | null)[] {
  const used = new Set<ConflictField>();
  const mapping: (ConflictField | null)[] = [];
  for (const h of headers) {
    const normalized = h.trim().toLowerCase().replace(/[_\-]/g, " ");
    let field = CONFLICT_HEADER_ALIASES[normalized] ?? null;
    // Headers like "date 1", "date 2", "conflict date 3" all map to date.
    // The `date` field is allowed to repeat (wide-format spreadsheets).
    if (!field && /^(?:conflict\s+)?date\s*\d*$/.test(normalized)) {
      field = "date";
    }
    if (field === "date") {
      mapping.push(field);
    } else if (field && !used.has(field)) {
      mapping.push(field);
      used.add(field);
    } else {
      mapping.push(null);
    }
  }
  return mapping;
}

const EMPTY_DATE_MARKERS = new Set(["", "no conflicts", "none", "n/a", "na", "-"]);

/** Parse a cell that may contain one OR MORE dates. Splits on comma/semicolon/newline
 *  and returns all successfully parsed ISO dates. "No conflicts"-style markers
 *  return an empty array rather than being treated as an error. */
export function parseDateCells(raw: string): string[] {
  const trimmed = raw.trim();
  if (EMPTY_DATE_MARKERS.has(trimmed.toLowerCase())) return [];
  if (!trimmed) return [];
  const parts = trimmed.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const iso = parseDateCell(p);
    if (iso && !seen.has(iso)) {
      out.push(iso);
      seen.add(iso);
    }
  }
  return out;
}

/** Try multiple common date formats. Returns YYYY-MM-DD or null. */
function parseDateCell(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already ISO YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  // M/D/YYYY or MM/DD/YYYY (US)
  const usMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (usMatch) {
    let [, m, d, y] = usMatch;
    if (y!.length === 2) y = "20" + y;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  // YYYY/MM/DD
  const isoSlashMatch = trimmed.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/);
  if (isoSlashMatch) {
    const [, y, m, d] = isoSlashMatch;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  // Last resort: let JavaScript try
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }

  return null;
}

/** Parse a time cell into HH:MM (24h). Accepts "7:00 PM", "19:00", etc. */
function parseTimeCell(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1]!, 10);
    const m = parseInt(m24[2]!, 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, "0")}:${m24[2]}`;
    }
  }

  const m12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM|a|p)\.?$/i);
  if (m12) {
    let h = parseInt(m12[1]!, 10);
    const m = m12[2] ? parseInt(m12[2], 10) : 0;
    const isPm = /p/i.test(m12[3]!);
    if (h === 12) h = isPm ? 12 : 0;
    else if (isPm) h += 12;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  return null;
}

export interface ConflictImportResult {
  /** Conflicts that matched a known person and are ready to add. */
  matched: Conflict[];
  /** Names from the CSV that didn't match anyone in cast/crew. */
  unmatchedNames: string[];
  /** Rows that couldn't be parsed (bad date, missing name, etc.). */
  skipped: number;
}

/**
 * Convert CSV rows + column mapping into Conflict objects, matching the
 * "name" column against the provided cast/crew list.
 *
 * Conflicts whose name doesn't match any person are NOT imported - their
 * names are returned in unmatchedNames so the UI can warn the user.
 */
export function mapRowsToConflicts(
  rows: string[][],
  mapping: (ConflictField | null)[],
  people: Array<{ id: string; firstName: string; lastName: string }>,
): ConflictImportResult {
  const matched: Conflict[] = [];
  const unmatchedSet = new Set<string>();
  let skipped = 0;

  // One name can resolve to multiple ids - e.g. the same person listed in
  // both cast and crew. We create a conflict for each match so a real
  // scheduling conflict blocks both of their roles.
  const byFullName = new Map<string, string[]>();
  const byFirstName = new Map<string, string[]>();
  const byLastName = new Map<string, string[]>();
  const addTo = (map: Map<string, string[]>, key: string, id: string) => {
    const arr = map.get(key) ?? [];
    arr.push(id);
    map.set(key, arr);
  };
  for (const p of people) {
    const full = `${p.firstName} ${p.lastName}`.trim().toLowerCase();
    if (full) addTo(byFullName, full, p.id);
    const first = p.firstName.trim().toLowerCase();
    if (first) addTo(byFirstName, first, p.id);
    const last = p.lastName.trim().toLowerCase();
    if (last) addTo(byLastName, last, p.id);
  }

  for (const row of rows) {
    const raw: Partial<Record<ConflictField, string>> = {};
    const dateCells: string[] = [];
    for (let c = 0; c < mapping.length; c++) {
      const field = mapping[c];
      if (!field || c >= row.length) continue;
      const value = row[c]!.trim();
      // Date can be mapped to multiple columns (wide format); collect them all.
      if (field === "date") {
        if (value) dateCells.push(value);
      } else {
        raw[field] = value;
      }
    }

    const rawName = raw.name ?? "";
    if (!rawName) {
      skipped++;
      continue;
    }

    // All date cells empty or filled only with "No Conflicts"-style markers
    // is a silent skip, not an error.
    if (dateCells.length === 0
        || dateCells.every((s) => EMPTY_DATE_MARKERS.has(s.toLowerCase()))) {
      continue;
    }

    const dateSet = new Set<string>();
    for (const cell of dateCells) {
      for (const iso of parseDateCells(cell)) dateSet.add(iso);
    }
    const dates = [...dateSet];
    if (dates.length === 0) {
      skipped++;
      continue;
    }

    const startTime = raw.startTime ? parseTimeCell(raw.startTime) ?? undefined : undefined;
    const endTime = raw.endTime ? parseTimeCell(raw.endTime) ?? undefined : undefined;
    const label = raw.label ?? "";

    // Try to match the name (case-insensitive). Returns all matching ids -
    // a person in both cast and crew gets two ids and both get the conflict.
    const lookup = rawName.trim().toLowerCase();
    let ids: string[] = byFullName.get(lookup) ?? [];
    if (ids.length === 0) {
      const parts = lookup.split(/\s+/);
      if (parts.length >= 2) {
        // "Don Anderson II" → try "Don Anderson" (strip suffix)
        const firstPart = parts[0]!;
        const lastPart = parts[parts.length - 1]!;
        ids = byFullName.get(`${firstPart} ${lastPart}`) ?? [];
      }
    }
    if (ids.length === 0) {
      // First-name-only match when it resolves to a single person in each pool
      const firstMatches = byFirstName.get(lookup);
      if (firstMatches && firstMatches.length <= 2) ids = firstMatches;
    }
    if (ids.length === 0) {
      const lastMatches = byLastName.get(lookup);
      if (lastMatches && lastMatches.length <= 2) ids = lastMatches;
    }

    if (ids.length > 0) {
      // If a person is in both cast and crew, prefer the cast match.
      // The caller passes cast first, so taking the first id does that.
      const id = ids[0]!;
      for (const d of dates) {
        matched.push({
          id: `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${matched.length}`,
          actorId: id,
          date: d,
          label,
          ...(startTime ? { startTime } : {}),
          ...(endTime ? { endTime } : {}),
        });
      }
    } else {
      unmatchedSet.add(rawName);
    }
  }

  return {
    matched,
    unmatchedNames: [...unmatchedSet].sort(),
    skipped,
  };
}

/**
 * Extract conflicts from a cast/crew CSV that also has conflict columns
 * (conflictDate + optional conflictStartTime, conflictEndTime, conflictLabel).
 *
 * Use case: user has one spreadsheet with name, role/character, and conflict
 * columns all together. After importing as cast or crew, call this with the
 * combined cast+crew pool so the conflict rows resolve to the freshly-added
 * or existing people.
 *
 * Rows without a conflictDate produce no conflict (cast-only rows).
 * Rows whose name can't be found end up in `unmatchedNames`.
 */
export function extractConflictsFromPeopleRows(
  rows: string[][],
  mapping: (CastField | CrewField | null)[],
  people: Array<{ id: string; firstName: string; lastName: string }>,
): ConflictImportResult {
  // Only meaningful if mapping contains conflictDate
  if (!mapping.includes("conflictDate" as CastField)) {
    return { matched: [], unmatchedNames: [], skipped: 0 };
  }

  const matched: Conflict[] = [];
  const unmatchedSet = new Set<string>();
  let skipped = 0;

  // Store all ids per key - one name can resolve to cast + crew at once.
  const byFullName = new Map<string, string[]>();
  const byFirstName = new Map<string, string[]>();
  const byLastName = new Map<string, string[]>();
  const addTo = (map: Map<string, string[]>, key: string, id: string) => {
    const arr = map.get(key) ?? [];
    arr.push(id);
    map.set(key, arr);
  };
  for (const p of people) {
    const full = `${p.firstName} ${p.lastName}`.trim().toLowerCase();
    if (full) addTo(byFullName, full, p.id);
    const first = p.firstName.trim().toLowerCase();
    if (first) addTo(byFirstName, first, p.id);
    const last = p.lastName.trim().toLowerCase();
    if (last) addTo(byLastName, last, p.id);
  }

  for (const row of rows) {
    const raw: Record<string, string> = {};
    const dateCells: string[] = [];
    for (let c = 0; c < mapping.length; c++) {
      const field = mapping[c];
      if (!field || c >= row.length) continue;
      const value = row[c]!.trim();
      if (field === "conflictDate") {
        if (value) dateCells.push(value);
      } else {
        raw[field] = value;
      }
    }

    if (dateCells.length === 0
        || dateCells.every((s) => EMPTY_DATE_MARKERS.has(s.toLowerCase()))) {
      continue;
    }

    const firstName = raw.firstName ?? "";
    const lastName = raw.lastName ?? "";
    const fullNameFromParts = `${firstName} ${lastName}`.trim();
    const nameDisplay = fullNameFromParts || firstName || lastName;
    if (!nameDisplay) {
      skipped++;
      continue;
    }

    const dateSet = new Set<string>();
    for (const cell of dateCells) {
      for (const iso of parseDateCells(cell)) dateSet.add(iso);
    }
    const dates = [...dateSet];
    if (dates.length === 0) {
      skipped++;
      continue;
    }

    const startTime = raw.conflictStartTime ? parseTimeCell(raw.conflictStartTime) ?? undefined : undefined;
    const endTime = raw.conflictEndTime ? parseTimeCell(raw.conflictEndTime) ?? undefined : undefined;
    const label = raw.conflictLabel ?? "";

    const lookup = nameDisplay.toLowerCase();
    let ids: string[] = [];
    if (firstName && lastName) {
      ids = byFullName.get(`${firstName.toLowerCase()} ${lastName.toLowerCase()}`) ?? [];
    }
    if (ids.length === 0) ids = byFullName.get(lookup) ?? [];
    if (ids.length === 0 && firstName) {
      const fm = byFirstName.get(firstName.toLowerCase());
      if (fm && fm.length <= 2) ids = fm;
    }
    if (ids.length === 0 && lastName) {
      const lm = byLastName.get(lastName.toLowerCase());
      if (lm && lm.length <= 2) ids = lm;
    }

    if (ids.length > 0) {
      // Prefer the cast match when someone is in both pools.
      const id = ids[0]!;
      for (const d of dates) {
        matched.push({
          id: `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${matched.length}`,
          actorId: id,
          date: d,
          label,
          ...(startTime ? { startTime } : {}),
          ...(endTime ? { endTime } : {}),
        });
      }
    } else {
      unmatchedSet.add(nameDisplay);
    }
  }

  return {
    matched,
    unmatchedNames: [...unmatchedSet].sort(),
    skipped,
  };
}
