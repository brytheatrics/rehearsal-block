/**
 * CSV import utilities for bulk-importing cast members.
 *
 * Handles parsing, column auto-detection, and merge logic
 * so users can map arbitrary CSV columns to CastMember fields.
 */

import type { CastMember, CrewMember } from "./types.js";
import { CAST_COLOR_PALETTE } from "./schedule.js";
import { formatPhone } from "./cast.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Fields on CastMember that can be mapped from a CSV column. */
export type CastField =
  | "firstName"
  | "lastName"
  | "middleName"
  | "suffix"
  | "character"
  | "pronouns"
  | "email"
  | "phone";

export const CAST_FIELD_LABELS: Record<CastField, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  middleName: "Middle Name",
  suffix: "Suffix",
  character: "Character",
  pronouns: "Pronouns",
  email: "Email",
  phone: "Phone",
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
  | "phone";

export const CREW_FIELD_LABELS: Record<CrewField, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  middleName: "Middle Name",
  suffix: "Suffix",
  role: "Role",
  pronouns: "Pronouns",
  email: "Email",
  phone: "Phone",
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

  const MERGE_FIELDS: CastField[] = [
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

  const MERGE_FIELDS: CrewField[] = [
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
