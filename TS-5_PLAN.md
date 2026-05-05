# TS-5: File attachments for Task Schedule

Personal-use feature for Blake's TLT TD work. Lets him attach drawings
(PDFs primarily) to a task schedule so his shop crew can pull them
from the share link instead of digging through email.

## Problem

Carpenters currently have to search their inboxes for PDFs of door
flat details, floor plans, paint elevations, etc. Blake has the
master copies and emails them out before each build. Nothing ties a
specific drawing to a specific task or day, and email threads age
out / get buried.

## Solution shape

Two surfaces:

1. **Show-wide Drawings panel** in the left sidebar of the editor
   (alongside Backlog and Completed in task mode). Drag-and-drop or
   button-pick to upload PDFs. Lists all files with download buttons.
   Visible read-only in the carpenter share view.

2. **Per-task attach** (optional, smaller surface). A paperclip icon
   on each task row. Click → picker showing existing show files →
   click one to attach. Multiple files per task allowed. Clicking
   the attached file in either editor or carpenter view downloads
   it (or opens in a new tab for PDFs).

## Storage

Use the **R2 bucket already wired** for share + show docs. Free
egress, 10 GB free tier. Cloudinary's image transformations don't
help PDFs; R2 is simpler.

Object key convention: `show-files:{showId}:{fileId}-{sanitizedName}`

Example: `show-files:f5a64769-7abc:f_l3kj4-Door_Flat_Detail.pdf`

The `fileId` is a server-generated id so renames don't break URLs.
Sanitized name preserves the original filename for download UX.

## Data shape

New type in `packages/core/src/types.ts`:

```ts
export interface ShowFile {
  id: string;              // server-assigned, stable
  name: string;            // original filename, sanitized for display
  mimeType: string;        // "application/pdf" etc.
  size: number;            // bytes
  uploadedAt: string;      // ISO timestamp
  r2Key: string;           // full key in R2 bucket
}
```

Added to `ScheduleDoc`:

```ts
files?: ShowFile[];
```

Added to `Task` (optional per-task attachments):

```ts
attachmentIds?: string[]; // references ShowFile.id values in doc.files
```

## Endpoints

- `POST /api/files` (multipart) - reads body, validates size + mime,
  generates id + r2Key, writes to R2, returns ShowFile metadata.
  Editor caller adds it to `doc.files` and saves.
- `GET /api/files/:r2Key` - proxy from R2 with the original
  filename in `Content-Disposition` so browsers download with the
  right name. Or, if R2 is configured with a public custom domain,
  return a redirect to the public URL.
- `DELETE /api/files/:fileId` - owner-only via auth check. Removes
  the R2 object + the metadata from the doc.

For carpenter share view auth: same model as task_checks - the
share token is the credential. `GET /api/files/:r2Key` checks that
the file's owner show has a published share id matching the token
the carpenter sent (passed via header or query param). If yes,
proxy the file. If no, 403.

## Editor UI

In `TaskScheduleSidebar.svelte` add a third section below Completed:

```
┌──────────────────────────────┐
│ Drawings           [+ Upload]│
│ ─────────────────────────────│
│ ⋮⋮ Door Flat Detail.pdf  ↓  │
│ ⋮⋮ Floor Plan v3.pdf     ↓  │
│ ⋮⋮ Paint Elevation.pdf   ↓  │
└──────────────────────────────┘
```

Drag the `⋮⋮` handle onto a task row to attach (reuses the
existing drag-onto-day pattern). Click `↓` to download. Right-click
or hover → context menu → Delete.

In the day editor (DayEditor.svelte), each task row gets a paperclip
button. Click → small popover lists attached files with X to detach.
"Add attachment" link at the bottom opens the show-files picker.

## Carpenter share UI

Same Drawings section in the share view sidebar, read-only (no
upload, no delete, no drag-handle). Click filename → download.

Per-task: the paperclip icon is visible too, click → list of attached
files → click one → download.

## Implementation order (~6-8 hours total)

1. **Data shape** (~30 min) - ShowFile type, doc.files, Task.attachmentIds
2. **R2 endpoint POST + GET** (~2 hr) - multipart upload, proxy download with auth check
3. **Drawings sidebar section** (~2 hr) - upload button, list, download buttons
4. **Per-task attach UI** (~2 hr) - paperclip icon, picker popover, attached-list rendering
5. **Carpenter view read-only** (~30 min) - reuse the same components with a readOnly flag
6. **Testing + edge cases** (~1 hr)

## Risks / decisions to revisit when starting

- **Multipart body size limit on Netlify Functions**: 6 MB cap on
  request bodies. PDFs over that need either a presigned R2 URL
  (direct browser-to-R2 upload) or Netlify's blob/large-file support.
  Adds ~1-2 hours if needed.
- **Filename sanitization**: strip path separators, control chars,
  cap length to ~80 chars. Keep extension.
- **Concurrent uploads**: don't worry about it for v1 - Blake is
  the only uploader.
- **Storage cleanup on task delete**: deleting a task that has
  attachments shouldn't delete the underlying file (other tasks
  might reference it). Only the show-wide Delete action removes
  R2 objects.
- **Mobile carpenter download**: phones should handle PDF downloads
  natively. iOS Safari opens in Quick Look. Worth testing.
- **Public R2 bucket vs proxy**: if Blake configures a public
  custom domain for the R2 bucket, downloads can be direct CDN
  links (no function invocation per download). Saves Netlify
  function budget. But share-token auth has to live somewhere -
  either accept that anyone with the file URL can download it
  forever (acceptable trust posture), or keep proxying.
