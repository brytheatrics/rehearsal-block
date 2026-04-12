/**
 * Export / print helpers.
 *
 * All functions are pure and framework-agnostic. They consume a
 * ScheduleDoc and produce strings (CSV content, HTML documents) or
 * trigger browser-native downloads. The print popup is a self-contained
 * HTML page with no Svelte runtime - just static markup styled with
 * inline CSS so it works offline and across popup-blocked browsers.
 */

import type {
  Call,
  CastMember,
  Conflict,
  Group,
  ScheduleDay,
  ScheduleDoc,
} from "./types.js";
import type { IsoDate } from "./dates.js";
import {
  buildCalendarGrid,
  isMonthHeaderRow,
  isWeekRow,
  type CalendarWeekRow,
} from "./calendar.js";
import { castDisplayNames } from "./cast.js";
import {
  effectiveDescription,
  effectiveLocation,
  effectiveLocationColor,
  effectiveLocationShape,
  expandCalledActorIds,
  locationColor,
  locationShape,
} from "./schedule.js";
import { formatTime } from "./time.js";
import {
  addDays,
  eachDayOfRange,
  parseIsoDate,
  weekStartOf,
} from "./dates.js";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface ExportOptions {
  mode: "calendar" | "list";
  startDate: IsoDate;
  endDate: IsoDate;
}

export interface PrintOptions extends ExportOptions {
  action: "pdf" | "print";
  /** "months" = page break per month, "continuous" = pack content tightly. */
  pageBreaks?: "months" | "continuous";
  /** Strip background colors from badges/chips when false. */
  printBackgrounds?: boolean;
  /** Show the date range in the header. */
  showRunDates?: boolean;
  /** Show "Downloaded [date]" in the page footer. */
  showDownloadDate?: boolean;
  /** Show page numbers in the footer. */
  showPageNumbers?: boolean;
  /** Show the Rehearsal Block logo in the footer. */
  showFooterLogo?: boolean;
  /** In continuous mode, repeat month + weekday headers on pages that got split. */
  repeatHeaders?: boolean;
  /** Repeat the show title + dates header on every page, not just the first. */
  repeatTitle?: boolean;
}

// -------------------------------------------------------------------
// Called label
// -------------------------------------------------------------------

/**
 * Build the "Called: All" / "Called: Montagues, Marcus, Ava" text used
 * in print views and CSV descriptions. Groups are listed first, then
 * individual actors not covered by any called group. Returns "" when
 * nobody is called.
 */
export function buildCalledLabel(
  call: Call,
  cast: readonly CastMember[],
  groups: Group[],
  displayNames: Map<string, string>,
): string {
  if (call.allCalled) return "Called: All";

  const parts: string[] = [];

  // Group names first
  for (const gid of call.calledGroupIds) {
    const g = groups.find((x) => x.id === gid);
    if (g) parts.push(g.name);
  }

  // Individual actors not already covered by a called group
  const coveredByGroup = new Set<string>();
  for (const gid of call.calledGroupIds) {
    const g = groups.find((x) => x.id === gid);
    if (g) for (const mid of g.memberIds) coveredByGroup.add(mid);
  }
  for (const aid of call.calledActorIds) {
    if (!coveredByGroup.has(aid)) {
      const name = displayNames.get(aid);
      if (name) parts.push(name);
    }
  }

  return parts.length > 0 ? `Called: ${parts.join(", ")}` : "";
}

// -------------------------------------------------------------------
// CSV export (Google Calendar format)
// -------------------------------------------------------------------

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function isoToGCalDate(iso: IsoDate): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Build CSV content in Google Calendar import format. One row per
 * populated call per date in the given range.
 */
export function buildCsvContent(
  doc: ScheduleDoc,
  options: ExportOptions,
): string {
  const timeFmt = doc.settings.timeFormat ?? "12h";
  const displayMode = doc.settings.castDisplayMode ?? "actor";
  const names = castDisplayNames(doc.cast, displayMode);
  const headers = [
    "Subject",
    "Start Date",
    "Start Time",
    "End Date",
    "End Time",
    "All Day Event",
    "Description",
    "Location",
  ];
  const rows: string[] = [headers.join(",")];

  for (const iso of eachDayOfRange(options.startDate, options.endDate)) {
    const day = doc.schedule[iso];
    if (!day) continue;
    const eventType = doc.eventTypes.find((t) => t.id === day.eventTypeId);
    const subject = eventType?.name ?? "Rehearsal";
    const gcalDate = isoToGCalDate(iso);

    if (day.calls.length === 0) {
      // Day with no calls (e.g. Dark day) - skip since there's nothing to schedule.
      continue;
    }

    // Group calls by location, consolidate into one GCal event per location.
    // Uses earliest start time and latest end time for each location group.
    const locationGroups = new Map<string, {
      startTime: string; // HH:MM raw
      endTime: string;   // HH:MM raw
      descParts: string[];
      calledParts: string[];
    }>();

    const notes = stripHtml(day.notes ?? "");

    for (const call of day.calls) {
      const loc = effectiveLocation(day, call).trim() || "(no location)";
      const calledLabel = buildCalledLabel(call, doc.cast, doc.groups, names);
      const desc = effectiveDescription(day, call).trim();
      const callLabel = call.label ? `${call.label} ${call.suffix ?? "Call"}` : "";

      let group = locationGroups.get(loc);
      if (!group) {
        group = { startTime: call.time ?? "", endTime: call.endTime ?? "", descParts: [], calledParts: [] };
        locationGroups.set(loc, group);
      }

      // Track earliest start and latest end (raw HH:MM comparison works)
      if (call.time && (!group.startTime || call.time < group.startTime)) {
        group.startTime = call.time;
      }
      if (call.endTime && (!group.endTime || call.endTime > group.endTime)) {
        group.endTime = call.endTime;
      }

      // Collect descriptions
      const parts: string[] = [];
      if (callLabel) parts.push(callLabel);
      if (desc) parts.push(desc);
      if (calledLabel) parts.push(calledLabel);
      if (parts.length > 0) group.descParts.push(parts.join(": "));
    }

    for (const [loc, group] of locationGroups) {
      const descAll = [...group.descParts];
      if (notes) descAll.push(notes);
      const location = loc === "(no location)" ? "" : loc;

      rows.push(
        [
          csvEscape(doc.show.name + " " + subject),
          gcalDate,
          group.startTime ? formatTime(group.startTime, timeFmt) : "",
          gcalDate,
          group.endTime ? formatTime(group.endTime, timeFmt) : "",
          "FALSE",
          csvEscape(descAll.join(" | ")),
          csvEscape(location),
        ].join(","),
      );
    }
  }

  return rows.join("\n");
}

/**
 * Build a plain CSV with one row per scheduled day, showing all call
 * details in a human-readable table format. Good for spreadsheets,
 * sharing with production teams, or importing into other tools.
 */
export function buildPlainCsvContent(
  doc: ScheduleDoc,
  options: ExportOptions,
): string {
  const timeFmt = doc.settings.timeFormat ?? "12h";
  const displayMode = doc.settings.castDisplayMode ?? "actor";
  const names = castDisplayNames(doc.cast, displayMode);
  const headers = [
    "Date",
    "Day",
    "Type",
    "Call",
    "Start Time",
    "End Time",
    "Description",
    "Called",
    "Location",
    "Notes",
    "Conflicts",
  ];
  const rows: string[] = [headers.join(",")];

  for (const iso of eachDayOfRange(options.startDate, options.endDate)) {
    const day = doc.schedule[iso];
    if (!day) continue;
    const eventType = doc.eventTypes.find((t) => t.id === day.eventTypeId);
    const typeName = eventType?.name ?? "";
    const d = parseIsoDate(iso);
    const dayName = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    const notes = stripHtml(day.notes ?? "");

    // Build conflicts string for this date
    const dayConflicts = doc.conflicts.filter((c) => c.date === iso);
    const conflictStr = dayConflicts
      .map((c) => {
        const name = names.get(c.actorId) ?? "?";
        const label = c.label ? ` (${c.label})` : "";
        const times = c.startTime && c.endTime
          ? ` ${formatTime(c.startTime, timeFmt)}-${formatTime(c.endTime, timeFmt)}`
          : c.startTime
            ? ` ${formatTime(c.startTime, timeFmt)}+`
            : "";
        return `${name}${label}${times}`;
      })
      .join("; ");

    if (day.calls.length === 0) {
      rows.push(
        [iso, dayName, csvEscape(typeName), "", "", "", "", "", csvEscape(day.location), csvEscape(notes), csvEscape(conflictStr)].join(","),
      );
      continue;
    }

    for (const call of day.calls) {
      const calledLabel = buildCalledLabel(call, doc.cast, doc.groups, names);
      const desc = effectiveDescription(day, call).trim();
      const loc = effectiveLocation(day, call).trim();
      const callLabel = call.label
        ? `${call.label} ${call.suffix ?? "Call"}`
        : call.suffix ?? "";
      const startTime = call.time ? formatTime(call.time, timeFmt) : "";
      const endTime = call.endTime ? formatTime(call.endTime, timeFmt) : "";

      rows.push(
        [
          iso,
          dayName,
          csvEscape(typeName),
          csvEscape(callLabel),
          startTime,
          endTime,
          csvEscape(desc),
          csvEscape(calledLabel),
          csvEscape(loc),
          csvEscape(notes),
          csvEscape(conflictStr),
        ].join(","),
      );
    }
  }

  return rows.join("\n");
}

/**
 * Download a CSV file. Creates a Blob, generates an object URL,
 * clicks a temporary <a> tag, and cleans up.
 */
export function downloadCsv(doc: ScheduleDoc, options: ExportOptions & { csvFormat?: "gcal" | "plain" }): void {
  const csv = (options.csvFormat === "plain")
    ? buildPlainCsvContent(doc, options)
    : buildCsvContent(doc, options);
  const suffix = options.csvFormat === "plain" ? "_Schedule" : "_Google_Calendar";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    (doc.show.name || "Schedule").replace(/\s+/g, "_") + suffix + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -------------------------------------------------------------------
// Contact Sheet exports
// -------------------------------------------------------------------

export interface ContactSheetOptions {
  includeCast: boolean;
  includeCrew: boolean;
}

export function buildContactSheetCsv(doc: ScheduleDoc, opts: ContactSheetOptions): string {
  const lines: string[] = [];

  lines.push("First Name,Middle Name,Last Name,Suffix,Pronouns,Character/Role,Phone,Email");

  if (opts.includeCast) {
    for (const m of doc.cast) {
      lines.push([
        csvEscape(m.firstName),
        csvEscape(m.middleName ?? ""),
        csvEscape(m.lastName),
        csvEscape(m.suffix ?? ""),
        csvEscape(m.pronouns ?? ""),
        csvEscape(m.character ?? ""),
        csvEscape(m.phone ?? ""),
        csvEscape(m.email ?? ""),
      ].join(","));
    }
  }

  if (opts.includeCrew) {
    for (const m of doc.crew) {
      lines.push([
        csvEscape(m.firstName),
        csvEscape(m.middleName ?? ""),
        csvEscape(m.lastName),
        csvEscape(m.suffix ?? ""),
        csvEscape(m.pronouns ?? ""),
        csvEscape(m.role ?? ""),
        csvEscape(m.phone ?? ""),
        csvEscape(m.email ?? ""),
      ].join(","));
    }
  }

  return lines.join("\n");
}

export function downloadContactSheetCsv(doc: ScheduleDoc, opts: ContactSheetOptions): void {
  const csv = buildContactSheetCsv(doc, opts);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (doc.show.name || "Show").replace(/\s+/g, "_") + "_Contact_Sheet.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// NOTE: contact sheet PDF rendering moved to packages/standalone/src/lib/contact-sheet-pdf.ts
// (pdfkit-based, vector lines for uniform thickness, draws to /api/contact-sheet-pdf).

// -------------------------------------------------------------------
// Print HTML builder
// -------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Collect unique Google Fonts needed and return a <link> tag.
 * Web-safe fonts (Georgia, Garamond, system-ui) are skipped.
 */
function googleFontsLink(doc: ScheduleDoc): string {
  const webSafe = new Set([
    "Georgia",
    "Garamond",
    "system-ui",
    "Century Gothic",
  ]);
  const needed = new Set<string>();
  const s = doc.settings;
  let usesCenturyGothic = false;
  for (const f of [s.fontFamily, s.fontHeading, s.fontTime, s.fontNotes]) {
    if (f === "Century Gothic") { usesCenturyGothic = true; continue; }
    if (f && !webSafe.has(f)) needed.add(f);
  }
  if (usesCenturyGothic) needed.add("Questrial");
  if (needed.size === 0) return "";
  const families = Array.from(needed)
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700`)
    .join("&");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap">`;
}

function formatDateLong(iso: IsoDate): string {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtTimeRange(
  call: Call,
  timeFmt: "12h" | "24h",
): string {
  const start = formatTime(call.time, timeFmt);
  if (!start || start === "-") return "";
  if (call.endTime) return `${start} - ${formatTime(call.endTime, timeFmt)}`;
  return `${start}+`;
}

/**
 * Build a self-contained HTML document for the print popup.
 */
export function buildPrintHtml(
  doc: ScheduleDoc,
  options: PrintOptions,
): string {
  const s = doc.settings;
  const timeFmt = s.timeFormat ?? "12h";
  const displayMode = s.castDisplayMode ?? "actor";
  const names = castDisplayNames(doc.cast, displayMode);
  const title = escapeHtml(
    `${doc.show.name || "Schedule"} Rehearsal Schedule`,
  );

  const isCalendar = options.mode === "calendar";
  const orientation = isCalendar ? "landscape" : "portrait";
  const margin = isCalendar ? "0.4in" : "0.5in";
  const fontsLink = googleFontsLink(doc);

  /** Map Century Gothic to include Questrial as a web fallback. */
  function cssFontName(name: string): string {
    if (name === "Century Gothic") return '"Century Gothic", "CenturyGothic", Questrial';
    return name;
  }
  const fontMain = cssFontName(s.fontFamily ?? "Inter");
  const fontHeading = cssFontName(s.fontHeading ?? "Playfair Display");
  const fontTime = cssFontName(s.fontTime ?? "Inter");
  const fontNotes = cssFontName(s.fontNotes ?? "Inter");

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: ${orientation}; margin: ${margin}; }
    body {
      font-family: ${fontMain}, system-ui, sans-serif;
      font-size: 10px;
      color: #1a1a1a;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ---- Header ---- */
    .print-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 3px solid #4b5563;
    }
    .print-header h1 {
      font-family: ${fontHeading}, Georgia, serif;
      font-size: 22px;
      color: #2d1f3d;
    }
    .print-header .dates {
      font-size: 11px;
      color: #6b7280;
    }

    /* ---- Calendar grid ---- */
    .month-label {
      font-family: ${fontHeading}, Georgia, serif;
      font-size: 15px;
      color: #2d1f3d;
      margin: 14px 0 4px;
      page-break-after: avoid;
    }
    .weekday-row {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
      margin-bottom: 4px;
    }
    .weekday-cell {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #9ca3af;
      text-align: center;
      padding: 2px 0;
    }
    .week-row {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
      break-inside: avoid;
      page-break-inside: avoid;
      margin-bottom: 4px;
      -webkit-column-break-inside: avoid;
    }
    .month-label + .weekday-row + .week-row {
      /* First week of a new month: avoid orphaned header */
      break-before: auto;
    }
    .print-page {
      break-after: page;
      page-break-after: always;
    }
    .print-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .day-cell {
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 4px 5px;
      min-height: 70px;
      overflow: hidden;
      font-size: 9px;
    }
    .day-cell.placeholder {
      background: #fafafa;
      border-color: #e5e7eb;
      border-style: dashed;
      opacity: 0.4;
    }

    /* ---- Day cell content ---- */
    .cell-header {
      display: flex;
      align-items: flex-start;
      gap: 3px;
      margin-bottom: 3px;
    }
    .day-num {
      font-weight: 700;
      font-size: 11px;
      color: #2d1f3d;
      flex-shrink: 0;
    }
    .badge-group {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      flex: 1;
      direction: rtl;
    }
    .badge-group .badge { direction: ltr; }
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 7px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .curtain-time {
      font-family: ${fontTime}, system-ui, sans-serif;
      font-size: 8px;
      font-weight: 700;
      margin-bottom: 2px;
    }

    /* Call blocks */
    .call-block {
      margin-top: 3px;
      padding-top: 2px;
    }
    /* Solid 1px separator between adjacent call blocks, matching the
       grid view's DayCell styling. Used to be a dashed line which
       didn't match the calendar's appearance. */
    .call-block + .call-block {
      border-top: 1px solid #e5e7eb;
    }
    .call-time {
      font-family: ${fontTime}, system-ui, sans-serif;
      font-size: 8px;
      font-weight: 700;
    }
    .call-desc {
      font-size: 8px;
      color: #4b5563;
    }
    .called-label {
      font-size: 8px;
      font-weight: 700;
      color: #1a1a1a;
    }

    /* Actor chips in print */
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 1px 4px;
      border: 1px solid #d1d5db;
      border-radius: 2px;
      font-size: 7px;
      font-weight: 600;
      margin: 1px 1px 0 0;
    }
    .chip-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .group-chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 7px;
      font-weight: 700;
      color: #fff;
      margin: 1px 1px 0 0;
    }
    .all-called-chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 7px;
      font-weight: 700;
      color: #fff;
      background: #5b1a2b;
      margin: 1px 1px 0 0;
    }
    .chips { margin-top: 2px; }

    /* Dress/perf call lines */
    .dp-call-line {
      font-size: 8px;
      margin-top: 2px;
    }
    .dp-label { font-weight: 700; }

    /* Notes */
    .notes {
      font-family: ${fontNotes}, system-ui, sans-serif;
      font-size: 8px;
      color: #4b5563;
      font-style: italic;
      margin-top: 3px;
    }
    .notes p { margin: 0; display: inline; }
    .notes strong { font-weight: 700; font-style: normal; }

    /* Location footer */
    .location-footer {
      margin-top: 3px;
      padding-top: 2px;
      border-top: 1px solid #e5e7eb;
      font-size: 7px;
      font-weight: 700;
    }
    .loc-shape { margin-right: 3px; }

    /* Conflicts */
    .conflict-mark {
      font-size: 7px;
      color: #dc2626;
      font-weight: 700;
      margin-top: 2px;
    }

    /* ---- List mode ---- */
    /* ---- Compact list mode ---- */
    .list-day {
      padding: 4px 0;
      border-bottom: 1px solid #e5e7eb;
      page-break-inside: avoid;
    }
    .list-day-header {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 2px;
    }
    .list-day-date {
      font-family: ${fontHeading}, Georgia, serif;
      font-size: 10px;
      font-weight: 700;
      color: #2d1f3d;
    }
    .list-call {
      margin: 1px 0;
      padding: 2px 0 2px 8px;
      border-left: 2px solid #e5e7eb;
    }
    .list-time {
      font-family: ${fontTime}, system-ui, sans-serif;
      font-size: 9px;
      font-weight: 700;
      display: inline;
    }
    .list-desc {
      font-size: 8px;
      color: #374151;
      display: inline;
      margin-left: 4px;
    }
    .list-desc::before { content: "- "; }
    .list-called {
      font-size: 8px;
      font-weight: 700;
    }
    .list-chips {
      margin-top: 1px;
    }
    .list-notes {
      font-family: ${fontNotes}, system-ui, sans-serif;
      font-size: 8px;
      color: #4b5563;
      font-style: italic;
      margin-top: 2px;
      padding: 2px 6px;
      background: #f9fafb;
      border-radius: 2px;
    }
    .list-notes p { margin: 0; display: inline; }
    .list-notes strong { font-weight: 700; font-style: normal; }
    .list-location {
      font-size: 8px;
      color: #6b7280;
      display: inline;
      margin-left: 4px;
    }
    .list-location::before { content: "@ "; }
    .list-conflicts {
      font-size: 8px;
      color: #dc2626;
      font-weight: 600;
      margin-top: 1px;
    }
    .dp-curtain {
      font-family: ${fontTime}, system-ui, sans-serif;
      font-size: 9px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .empty-msg {
      text-align: center;
      color: #9ca3af;
      padding: 40px;
      font-size: 14px;
    }

    /* ---- No backgrounds ---- */
    .no-bg .badge { background: transparent !important; border: 1px solid currentColor !important; }
    .no-bg .group-chip { background: transparent !important; border: 1px solid currentColor !important; color: #374151 !important; }
    .no-bg .all-called-chip { background: transparent !important; border: 1px solid #5b1a2b !important; color: #5b1a2b !important; }
    .no-bg .chip-dot { background: transparent !important; border: 1px solid currentColor !important; }

    /* ---- Page footer ---- */
    .print-page {
      display: flex;
      flex-direction: column;
    }
    .page-content { flex: 1; }
    .page-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 6px;
      margin-top: auto;
      border-top: 1px solid #e5e7eb;
      font-size: 7px;
      color: #c0c0c0;
      gap: 12px;
    }
    .footer-logo {
      display: inline-flex;
      align-items: center;
    }
    .footer-logo svg {
      height: 14px;
      width: auto;
    }
    .footer-page { color: #c0c0c0; font-size: 7px; }
    .footer-date { color: #c0c0c0; font-size: 7px; }
  `;

  const showRunDates = options.showRunDates !== false; // default true
  const showFooterLogo = options.showFooterLogo ?? false;
  const showPageNumbers = options.showPageNumbers ?? false;
  const showDownloadDate = options.showDownloadDate ?? false;
  const noBgClass = (options.printBackgrounds ?? true) ? "" : " no-bg";

  let body = "";

  // Print header (show title + date range)
  const startFmt = formatDateLong(options.startDate);
  const endFmt = formatDateLong(options.endDate);
  let headerHtml = `<div class="print-header">`;
  headerHtml += `<h1>${escapeHtml(doc.show.name || "Untitled Show")}</h1>`;
  if (showRunDates) {
    headerHtml += `<div class="dates">${escapeHtml(startFmt)} - ${escapeHtml(endFmt)}</div>`;
  }
  headerHtml += `</div>`;
  body += headerHtml;

  // Build the grid/list using the export date range, not the full show range.
  // This means only weeks containing dates in the range are rendered -
  // no blank rows at the start or end.
  const exportShow = { ...doc.show, startDate: options.startDate, endDate: options.endDate };
  const exportDoc = { ...doc, show: exportShow };

  const footerOpts = { showFooterLogo, showPageNumbers, showDownloadDate };
  if (isCalendar) {
    body += buildCalendarBody(exportDoc, options, names, timeFmt, footerOpts);
  } else {
    body += buildListBody(exportDoc, options, names, timeFmt, footerOpts);
  }

  const autoprint =
    options.action === "print"
      ? `<script>document.fonts.ready.then(function(){window.print();window.close();})<\/script>`
      : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>${fontsLink}<style>${css}</style></head><body class="${noBgClass.trim()}">${body}${autoprint}</body></html>`;
}

/** Grey version of the Rehearsal Block logo for print footers. */
const FOOTER_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2159.11 307.82" height="14"><g><path fill="#c0c0c0" d="M193.15,183.97v98.55l137.13-74.51,4.69-80.76-141.81,56.72ZM288.45,164.14c-1.08,3.13-3,3.97-3,3.97l-29.68,12.86s-1.62.45-2.52-.6c-.22-.26-2.14-2.05-.24-7.21.87-2.36,4.09-4.21,4.09-4.21l28.6-11.9s1.55-.52,2.28.36c.14.16,2.1,2.02.48,6.73Z"/><polygon fill="#c0c0c0" points="42.21 127.25 46.89 208.01 184.02 282.52 184.02 183.97 42.21 127.25"/><polygon fill="#c0c0c0" points="305.16 114.03 188.59 156.69 72.01 114.03 46.89 120.76 188.59 175.92 330.28 120.76 305.16 114.03"/><path fill="#c0c0c0" d="M193.15,88.31v58.05l108.04-38.22,2.52-49.99-110.57,30.17ZM269.95,85.55c-1.08,3.13-3,3.85-3,3.85l-29.2,9.01s-2.1.21-3-.84c-.22-.26-2.14-2.29-.24-7.45.87-2.36,3.61-3.37,3.61-3.37l28-8.17s2.15-.64,2.88.24c.14.16,2.58,2.02.96,6.73Z"/><polygon fill="#c0c0c0" points="73.45 58.15 75.98 108.14 184.02 146.36 184.02 88.31 73.45 58.15"/><polygon fill="#c0c0c0" points="188.59 31.71 77.78 52.02 188.59 81.22 299.39 52.02 188.59 31.71"/><text fill="#c0c0c0" font-family="'Century Gothic',sans-serif" font-weight="700" font-size="200" transform="translate(1479.92 217.96)">BLOCK</text><text fill="#c0c0c0" font-family="'Century Gothic',sans-serif" font-size="200" transform="translate(363.35 217.96)">REHEARSAL</text></g></svg>`;

export interface FooterOpts {
  showFooterLogo: boolean;
  showPageNumbers: boolean;
  showDownloadDate: boolean;
}

export function buildPageFooter(
  opts: FooterOpts,
  pageNum: number,
  totalPages: number,
): string {
  const hasAny = opts.showFooterLogo || opts.showPageNumbers || opts.showDownloadDate;
  if (!hasAny) return "";

  let html = `<div class="page-footer">`;

  // Left: logo
  if (opts.showFooterLogo) {
    html += `<span class="footer-logo">${FOOTER_LOGO_SVG}</span>`;
  } else {
    html += `<span></span>`;
  }

  // Center: page numbers
  if (opts.showPageNumbers) {
    html += `<span class="footer-page">Page ${pageNum} of ${totalPages}</span>`;
  } else {
    html += `<span></span>`;
  }

  // Right: download date
  if (opts.showDownloadDate) {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    html += `<span class="footer-date">Downloaded ${dateStr}</span>`;
  } else {
    html += `<span></span>`;
  }

  html += `</div>`;
  return html;
}

/** Replace page number placeholders after we know the total page count. */
function injectPageNumbers(pages: string[]): string[] {
  const total = pages.length;
  return pages.map((page, i) =>
    page
      .replace(/<!--PAGE_NUM-->/g, String(i + 1))
      .replace(/<!--TOTAL_PAGES-->/g, String(total)),
  );
}

function buildCalendarBody(
  doc: ScheduleDoc,
  options: PrintOptions,
  names: Map<string, string>,
  timeFmt: "12h" | "24h",
  footerOpts: FooterOpts,
): string {
  const grid = buildCalendarGrid(doc.show, {
    weekStartsOn: doc.settings.weekStartsOn,
  });

  const usePageWraps = (options.pageBreaks ?? "months") === "months";
  const hasFooter = footerOpts.showFooterLogo || footerOpts.showPageNumbers || footerOpts.showDownloadDate;

  // Build weekday header HTML once (reused for repeat headers)
  let weekdayRowHtml = `<div class="weekday-row">`;
  for (const h of grid.weekdayHeaders) {
    weekdayRowHtml += `<div class="weekday-cell">${h}</div>`;
  }
  weekdayRowHtml += `</div>`;

  let currentMonthLabel = "";
  const footerPlaceholder = hasFooter
    ? buildPageFooter(footerOpts, 0, 0)
        .replace("Page 0 of 0", "Page <!--PAGE_NUM--> of <!--TOTAL_PAGES-->")
    : "";

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  /** Detect month from the last in-range cell of a week row. */
  function weekMonth(row: CalendarWeekRow): { month: number; year: number; label: string } {
    const last = [...row.cells].reverse().find((c) => c.inRange) ?? row.cells[0]!;
    return {
      month: last.month,
      year: last.year,
      label: `${MONTH_NAMES[last.month]} ${last.year}`,
    };
  }

  /** Check if a week straddles two months (has in-range cells in different months). */
  function weekStraddles(row: CalendarWeekRow): boolean {
    const months = new Set(row.cells.filter((c) => c.inRange).map((c) => c.month));
    return months.size > 1;
  }

  if (usePageWraps) {
    // Months mode: each month in its own .print-page.
    // Detect month boundaries from cell data (no month-header rows).
    const pages: string[] = [];
    let currentPageContent = "";
    let currentMonth = -1;
    let pageOpen = false;
    let pendingStraddleRow: CalendarWeekRow | null = null;

    for (const row of grid.rows) {
      if (!isWeekRow(row)) continue;
      const wm = weekMonth(row);

      if (wm.month !== currentMonth) {
        // New month - close the old page and start a new one
        if (pageOpen) {
          pages.push(`<div class="print-page"><div class="page-content">${currentPageContent}</div>${footerPlaceholder}</div>`);
          currentPageContent = "";
        }
        pageOpen = true;
        currentMonth = wm.month;
        currentMonthLabel = wm.label;
        currentPageContent += `<div class="month-label">${escapeHtml(wm.label)}</div>`;
        currentPageContent += weekdayRowHtml;

        // If there's a straddling week from the previous month, add it
        // at the top of this page with previous-month cells greyed out
        if (pendingStraddleRow) {
          currentPageContent += buildWeekRowHtml(
            pendingStraddleRow, doc, names, timeFmt, currentMonthLabel, currentMonth,
          );
          pendingStraddleRow = null;
        }
      }

      if (weekStraddles(row)) {
        // Straddling week: render on current page with other-month cells greyed
        currentPageContent += buildWeekRowHtml(
          row, doc, names, timeFmt, currentMonthLabel, currentMonth,
        );
        // Save for the next page
        pendingStraddleRow = row;
      } else {
        currentPageContent += buildWeekRowHtml(row, doc, names, timeFmt, currentMonthLabel);
      }
    }

    if (pageOpen) {
      pages.push(`<div class="print-page"><div class="page-content">${currentPageContent}</div>${footerPlaceholder}</div>`);
    }

    const finalPages = hasFooter ? injectPageNumbers(pages) : pages;
    return finalPages.join("");
  } else {
    // Continuous (auto) mode: single flow with weekday headers once at top
    // and "1 JUN" style month labels inside day cells (no month headers).
    // No .print-page / .page-content wrapper here - the body's direct
    // children stay flat (.weekday-row + many .week-row) so the in-modal
    // preview's pagination algorithm can measure block heights and split
    // content across pages. The server-side PDF renderer scales via a
    // font-size regex that catches every class regardless of nesting,
    // so it doesn't need the wrapper either.
    let html = weekdayRowHtml;
    for (const row of grid.rows) {
      if (!isWeekRow(row)) continue;
      html += buildWeekRowHtml(row, doc, names, timeFmt, "", undefined, doc.show.startDate as IsoDate);
    }
    return html;
  }
}

/**
 * Build HTML for a single week row.
 * When `activeMonth` is provided (0-indexed), cells from other months
 * are rendered as grey placeholders even if they're in range. This is
 * used for straddling weeks in months mode - the week appears on both
 * pages, with "wrong month" days greyed out.
 */
function buildWeekRowHtml(
  row: { cells: Array<{ date: string; dayOfMonth: number; inRange: boolean; month?: number }> },
  doc: ScheduleDoc,
  names: Map<string, string>,
  timeFmt: "12h" | "24h",
  monthLabel: string,
  activeMonth?: number,
  /** When set, show month abbreviation on the 1st of each month and on this start date. */
  showStartDate?: IsoDate,
): string {
  const MONTH_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  let html = `<div class="week-row" data-month-label="${escapeHtml(monthLabel)}">`;
  for (const cell of row.cells) {
    const outsideActiveMonth = activeMonth !== undefined && cell.month !== undefined && cell.month !== activeMonth;
    if (!cell.inRange || outsideActiveMonth) {
      html += `<div class="day-cell placeholder"><div class="cell-header"><span class="day-num" style="opacity:0.3">${cell.inRange ? cell.dayOfMonth : ""}</span></div></div>`;
      continue;
    }
    html += `<div class="day-cell">`;
    const day = doc.schedule[cell.date as IsoDate];
    const et = day
      ? doc.eventTypes.find((t) => t.id === day.eventTypeId)
      : undefined;

    // Cell header: day number (with month on 1st or start date) + badges
    const showMonth = showStartDate && (cell.dayOfMonth === 1 || cell.date === showStartDate);
    const monthAbbr = showMonth && cell.month !== undefined ? ` <span style="font-weight:400;color:#6b7280;font-size:0.8em;margin-left:2px">${MONTH_ABBR[cell.month]}</span>` : "";
    html += `<div class="cell-header">`;
    html += `<span class="day-num">${cell.dayOfMonth}${monthAbbr}</span>`;
    if (day) {
      html += `<div class="badge-group">`;
      if (day.secondaryTypeIds) {
        for (const sid of day.secondaryTypeIds) {
          const st = doc.eventTypes.find((t) => t.id === sid);
          if (st) html += `<span class="badge" style="background:${st.bgColor};color:${st.textColor}">${escapeHtml(st.name)}</span>`;
        }
      }
      if (et) html += `<span class="badge" style="background:${et.bgColor};color:${et.textColor}">${escapeHtml(et.name)}</span>`;
      html += `</div>`;
    }
    html += `</div>`;

    if (day) {
      html += renderDayCellContent(doc, day, cell.date as IsoDate, names, timeFmt);
    }

    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

/** Render actor chips as inline HTML, matching the grid's visual style. */
function renderChips(
  call: Call,
  doc: ScheduleDoc,
  names: Map<string, string>,
): string {
  if (call.allCalled) {
    return `<div class="chips"><span class="all-called-chip">All Called</span></div>`;
  }

  const parts: string[] = [];

  // Group chips (single unit, not expanded)
  for (const gid of call.calledGroupIds) {
    const g = doc.groups.find((x) => x.id === gid);
    if (!g) continue;
    const color = g.color ?? locationColor(g.id) ?? "#6a1b9a";
    parts.push(`<span class="group-chip" style="background:${color}">&#9733; ${escapeHtml(g.name)}</span>`);
  }

  // Individual actors not covered by a called group
  const coveredByGroup = new Set<string>();
  for (const gid of call.calledGroupIds) {
    const g = doc.groups.find((x) => x.id === gid);
    if (g) for (const mid of g.memberIds) coveredByGroup.add(mid);
  }
  for (const aid of call.calledActorIds) {
    if (coveredByGroup.has(aid)) continue;
    const member = doc.cast.find((m) => m.id === aid);
    if (!member) continue;
    const name = names.get(aid) ?? member.firstName;
    parts.push(
      `<span class="chip"><span class="chip-dot" style="background:${member.color}"></span>${escapeHtml(name)}</span>`,
    );
  }

  if (parts.length === 0) return "";
  return `<div class="chips">${parts.join("")}</div>`;
}

function renderDayCellContent(
  doc: ScheduleDoc,
  day: ScheduleDay,
  iso: IsoDate,
  names: Map<string, string>,
  timeFmt: "12h" | "24h",
): string {
  let html = "";
  const et = doc.eventTypes.find((t) => t.id === day.eventTypeId);
  const isDressPerf = et?.isDressPerf ?? false;

  // Curtain time for dress/perf
  if (isDressPerf && day.curtainTime) {
    html += `<div class="curtain-time" style="color:${et?.textColor ?? '#1a1a1a'}">${formatTime(day.curtainTime, timeFmt)} CURTAIN</div>`;
  }

  // Calls
  if (isDressPerf) {
    for (const call of day.calls) {
      if (!call.time) continue;
      const suffix = call.suffix ?? "Call";
      const label = call.label ? `${call.label} ${suffix}` : suffix;
      html += `<div class="dp-call-line"><span class="dp-label">${escapeHtml(label)}</span> ${formatTime(call.time, timeFmt)}</div>`;
    }
    // Chips for dress/perf (consolidated)
    const allChips: string[] = [];
    for (const call of day.calls) {
      allChips.push(renderChips(call, doc, names));
    }
    const combined = allChips.filter(Boolean).join("");
    if (combined) html += combined;
  } else {
    for (const call of day.calls) {
      const hasContent =
        call.allCalled ||
        call.calledActorIds.length > 0 ||
        call.calledGroupIds.length > 0 ||
        (call.description ?? "").trim() !== "" ||
        (day.description ?? "").trim() !== "";
      if (!hasContent) continue;

      html += `<div class="call-block">`;
      const tr = fmtTimeRange(call, timeFmt);
      if (tr) {
        const loc = effectiveLocation(day, call).trim();
        const color = loc ? effectiveLocationColor(loc, doc.locationPresetsV2) : null;
        const shape = (doc.settings.showLocationShapes && loc) ? `<span class="loc-shape" ${color ? `style="color:${color}"` : ""}>${effectiveLocationShape(loc, doc.locationPresetsV2)}</span>` : "";
        html += `<div class="call-time" ${color ? `style="color:${color}"` : ""}>${shape}${tr}</div>`;
      }
      const desc = effectiveDescription(day, call).trim();
      if (desc) html += `<div class="call-desc">${escapeHtml(desc)}</div>`;

      // Actor/group chips instead of just a text label
      html += renderChips(call, doc, names);

      html += `</div>`;
    }
  }

  // Notes (preserve rich text formatting)
  const notesPlain = stripHtml(day.notes ?? "");
  if (notesPlain) {
    html += `<div class="notes">${day.notes}</div>`;
  }

  // Location footer
  const locations = new Set<string>();
  if (isDressPerf && day.location) {
    locations.add(day.location);
  } else {
    for (const call of day.calls) {
      const loc = effectiveLocation(day, call).trim();
      if (loc) locations.add(loc);
    }
  }
  if (locations.size > 0) {
    html += `<div class="location-footer">`;
    for (const loc of locations) {
      const color = effectiveLocationColor(loc, doc.locationPresetsV2);
      const shape = effectiveLocationShape(loc, doc.locationPresetsV2);
      html += `<span class="loc-pill" ${color ? `style="color:${color}"` : ""}><span class="loc-shape">${shape}</span>${escapeHtml(loc)}</span> `;
    }
    html += `</div>`;
  }

  // Conflicts
  const dayConflicts = doc.conflicts.filter((c) => c.date === iso);
  if (dayConflicts.length > 0) {
    const conflictNames = dayConflicts
      .map((c) => names.get(c.actorId) ?? "?")
      .join(", ");
    html += `<div class="conflict-mark">&#128683; ${escapeHtml(conflictNames)}</div>`;
  }

  return html;
}

function buildListBody(
  doc: ScheduleDoc,
  options: PrintOptions,
  names: Map<string, string>,
  timeFmt: "12h" | "24h",
  footerOpts: FooterOpts,
): string {
  const usePageWraps = (options.pageBreaks ?? "months") === "months";
  const hasFooter = footerOpts.showFooterLogo || footerOpts.showPageNumbers || footerOpts.showDownloadDate;
  const footerPlaceholder = hasFooter
    ? buildPageFooter(footerOpts, 0, 0)
        .replace("Page 0 of 0", "Page <!--PAGE_NUM--> of <!--TOTAL_PAGES-->")
    : "";

  let hasContent = false;
  let currentMonth = -1;

  if (usePageWraps) {
    const pages: string[] = [];
    let currentPageContent = "";
    let pageOpen = false;

    for (const iso of eachDayOfRange(options.startDate, options.endDate)) {
      const day = doc.schedule[iso];
      if (!day) continue;
      if (day.calls.length === 0 && !day.description && !day.notes) continue;
      hasContent = true;

      const month = parseIsoDate(iso).getUTCMonth();
      if (month !== currentMonth) {
        if (pageOpen) {
          pages.push(`<div class="print-page"><div class="page-content">${currentPageContent}</div>${footerPlaceholder}</div>`);
          currentPageContent = "";
        }
        pageOpen = true;
        currentMonth = month;
      }

      currentPageContent += buildListDayHtml(doc, day, iso, names, timeFmt, options);
    }

    if (pageOpen) {
      pages.push(`<div class="print-page"><div class="page-content">${currentPageContent}</div>${footerPlaceholder}</div>`);
    }

    if (!hasContent) {
      pages.push(`<div class="print-page"><div class="page-content"><div class="empty-msg">No scheduled days in this date range.</div></div>${footerPlaceholder}</div>`);
    }

    const finalPages = hasFooter ? injectPageNumbers(pages) : pages;
    return finalPages.join("");
  }

  // Continuous mode: flat output of list day blocks as direct body
  // children so the in-modal preview's pagination algorithm can split
  // content across pages by measuring each block's height.
  let html = "";
  for (const iso of eachDayOfRange(options.startDate, options.endDate)) {
    const day = doc.schedule[iso];
    if (!day) continue;
    if (day.calls.length === 0 && !day.description && !day.notes) continue;
    hasContent = true;

    html += buildListDayHtml(doc, day, iso, names, timeFmt, options);
  }

  if (!hasContent) {
    html += `<div class="empty-msg">No scheduled days in this date range.</div>`;
  }

  return html;
}

function buildListDayHtml(
  doc: ScheduleDoc,
  day: ScheduleDay,
  iso: IsoDate,
  names: Map<string, string>,
  timeFmt: "12h" | "24h",
  options: PrintOptions,
): string {
  let html = "";
  const et = doc.eventTypes.find((t) => t.id === day.eventTypeId);
  const isDressPerf = et?.isDressPerf ?? false;

  html += `<div class="list-day">`;
  html += `<div class="list-day-header">`;
  html += `<span class="list-day-date">${formatDateLong(iso)}</span>`;
  if (et) {
    html += `<span class="badge" style="background:${et.bgColor};color:${et.textColor}">${escapeHtml(et.name)}</span>`;
  }
  if (day.secondaryTypeIds) {
    for (const sid of day.secondaryTypeIds) {
      const st = doc.eventTypes.find((t) => t.id === sid);
      if (st) {
        html += `<span class="badge" style="background:${st.bgColor};color:${st.textColor}">${escapeHtml(st.name)}</span>`;
      }
    }
  }
  html += `</div>`;

  if (isDressPerf && day.curtainTime) {
    html += `<div class="dp-curtain" style="color:${et?.textColor ?? '#1a1a1a'}">${formatTime(day.curtainTime, timeFmt)} CURTAIN</div>`;
  }

  if (isDressPerf) {
    for (const call of day.calls) {
      if (!call.time) continue;
      const suffix = call.suffix ?? "Call";
      const label = call.label ? `${call.label} ${suffix}` : suffix;
      html += `<div class="dp-call-line"><span class="dp-label">${escapeHtml(label)}</span> ${formatTime(call.time, timeFmt)}</div>`;
    }
    for (const call of day.calls) {
      const chips = renderChips(call, doc, names);
      if (chips) html += `<div class="list-chips">${chips}</div>`;
    }
  } else {
    for (const call of day.calls) {
      const hasCallContent =
        call.allCalled ||
        call.calledActorIds.length > 0 ||
        call.calledGroupIds.length > 0 ||
        (call.description ?? "").trim() !== "" ||
        (day.description ?? "").trim() !== "";
      if (!hasCallContent) continue;

      const loc = effectiveLocation(day, call).trim();
      const color = loc ? effectiveLocationColor(loc, doc.locationPresetsV2) : null;
      html += `<div class="list-call" ${color ? `style="border-left-color:${color}"` : ""}>`;
      const tr = fmtTimeRange(call, timeFmt);
      if (tr) html += `<div class="list-time" ${color ? `style="color:${color}"` : ""}>${tr}</div>`;
      const desc = effectiveDescription(day, call).trim();
      if (desc) html += `<div class="list-desc">${escapeHtml(desc)}</div>`;
      if (loc) {
        html += `<div class="list-location" ${color ? `style="color:${color}"` : ""}>${escapeHtml(loc)}</div>`;
      }
      html += `<div class="list-chips">${renderChips(call, doc, names)}</div>`;
      html += `</div>`;
    }
  }

  if (isDressPerf && day.location) {
    const color = effectiveLocationColor(day.location, doc.locationPresetsV2);
    html += `<div class="list-location" ${color ? `style="color:${color}"` : ""}>${escapeHtml(day.location)}</div>`;
  }

  const notesPlain = stripHtml(day.notes ?? "");
  if (notesPlain) {
    html += `<div class="list-notes">${day.notes}</div>`;
  }

  const dayConflicts = doc.conflicts.filter((c) => c.date === iso);
  if (dayConflicts.length > 0) {
    const conflictNames = dayConflicts
      .map((c) => {
        const name = names.get(c.actorId) ?? "?";
        const label = c.label ? ` (${c.label})` : "";
        return name + label;
      })
      .join(", ");
    html += `<div class="list-conflicts">&#128683; Conflicts: ${escapeHtml(conflictNames)}</div>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Open a print popup with the schedule HTML. The browser's print
 * dialog handles paper size and margins - this is a convenience
 * shortcut, not a precise layout tool. Use Download PDF for that.
 */
export function openPrintWindow(
  doc: ScheduleDoc,
  options: PrintOptions,
): void {
  const html = buildPrintHtml(doc, options);
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Popup blocked. Please allow popups for this site and try again.");
    return;
  }
  popup.document.write(html);
  popup.document.close();
  // Auto-trigger the print dialog so clicking "Print" in the export
  // menu feels like a real print action. The user can cancel to
  // preview the popup content, or proceed to print/save-as-PDF.
  popup.focus();
  popup.print();
}
