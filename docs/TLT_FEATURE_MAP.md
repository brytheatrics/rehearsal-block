# TLT Rehearsal Scheduler — Feature Map

This is a comprehensive analysis for rebuilding the TLT app in Rehearsal Block.

## Overview

The TLT Rehearsal Scheduler is a Google Apps Script web app for theatre directors to build rehearsal calendars. Core features: 7-column calendar grid, draggable actor chips, multi-call-time support for Dress/Performance, conflict tracking, auto-save to Google Sheets, PDF/CSV export.

Users: Directors (per-show code) and Admin (master code). No Google Workspace SSO.

## Feature Inventory (30 Features)

1. Director login & auth
2. Admin show picker
3. Session resume (localStorage)
4. 7-column calendar grid
5. Placeholder cells (out-of-range days)
6. Month labels & day-of-week headers
7. Day cell content (date, badge, time, description, chips, notes, location, conflict warning, curtain time)
8. Actor sidebar with chips
9. Actor colors (palette of 9 colors, round-robin assignment)
10. All Called chip (maroon, special)
11. Cast display mode toggle (Actor/Character/Both, persisted to localStorage)
12. Name shortening with disambiguation (_shortenName)
13. Groups (Ensemble, Leads, custom collections)
14. Group editor modal
15. Day editor panel (slide-in from right)
16. Event type pills (Rehearsal, Tech, Dress, Performance, Dark, etc.)
17. Admin-only event types (Dress/Perf pills hidden for directors)
18. Time pickers (15-min increments, end filtered to >= start)
19. Description field
20. Actor checklist (All/None buttons)
21. Conflicts display & manual entry
22. Notes field (contenteditable, bold toggle, **marker** format)
23. Location field with presets
24. Dress/Perf mode (call time blocks instead of description/checklist)
25. Multi-call-time layout (Crew Call, Actor Call, + Add Call)
26. Call time filtering (2.5-hour rule, TLT applies to primary only; fix for all)
27. Curtain time display (below event badge, color-matched)
28. Drag & drop (actors/groups/All onto days)
29. Conflict checking (fade chip, disable drag if conflicted)
30. Called label generation (_calledLabel: All / groups / individuals)
31. Auto-save (500ms debounced)
32. Save status indicator (Saving.../Saved/Error)
33. Undo/Redo (Ctrl+Z/Y, history stacks)
34. Print list mode (vertical, portrait)
35. Print calendar mode (7-column, landscape)
36. Print modal (view toggle, date range picker)
37. CSV export (Google Calendar format)
38. PDF filename control (document.title)
39. Dry Tech days (no actors called)
40. Opening night lock (post-Performance day editing restricted)
41. Deduplication (admin cleanup tool)
42. Location persistence (localStorage + Locations tab)

## Data Model

scheduleMap[isoDate] = {
  eventType: string,
  startTime: string,
  endTime: string,
  description: string,
  calledActors: array of full names,
  notes: HTML from contenteditable,
  location: string,
  blockNum: number (0=primary, 1+=extra calls for Dress/Perf),
  calledGroups: array of group names
}

showContext = {
  showName, startDate, closingDate, actors, datesEvents, conflicts, existingSchedule, locations, isAdmin
}

Sheets tabs: Settings, Dates, Actors, Conflicts, Rehearsal Schedule (auto), Locations (auto)

## Key Algorithms

1. Calendar grid: calStart = Sunday before startDate; calEnd = Saturday after closingDate; 7-column CSS grid with placeholder cells
2. Name shortening: first name only, append last initial if duplicates
3. Called label: All / groups / individuals (no double-listing)
4. Drag-drop: dataTransfer.setData with identifier (actor name, __ALL__, __GROUP__:name)
5. Dress/Perf mode: calls array [{ label, time }], all actors implicitly called
6. Call time filtering: 2.5 hours before curtain to curtain time
7. Print CSS scoping: scope all @media print rules to body.print-cal-mode or body.print-list-mode
8. CSV export: Google Calendar format with called label + call times for Dress/Perf
9. Contenteditable bold: **marker** format in storage, execCommand('bold') for toggle

## Known Bugs

1. Dress/Perf data model: block 0 vs block 1+ structure is confusing; use calls array instead
2. Contenteditable Ctrl+Z: sometimes triggers browser undo; check e.target.isContentEditable
3. Print CSS scoping: list mode breaks calendar print if not properly scoped
4. Call time filter: only applies to primary call, not extras (TLT bug)
5. UI out of sync: manual DOM updates scattered (critical architectural bug); use reactive framework in Rehearsal Block
6. Placeholder cells: can't use display:none or grid breaks; keep in DOM
7. Implicit globals: functions assume showContext/actors defined; pass as parameters instead
8. Timezone handling: use UTC for ISO dates to avoid day-off-by-one

## GAS-Specific (Don't Port)

- google.script.run functions (authenticateDirector, saveScheduleDay, exportScheduleCSV, etc.)
- Spreadsheet integration (openById, getSheetByName, etc.)
- doGet() entry point
- OAuth and domain restriction

## Port Order

Phase 1: Data model, grid building, date utilities
Phase 2: Sidebar, day cells, editor panel
Phase 3: Name shortening, called label, drag-drop, conflicts
Phase 4: Dress/Perf mode, groups, auto-save, undo/redo
Phase 5: CSV export, print modes
Phase 6: Polish (save status, shortcuts, admin features)


