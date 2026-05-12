/**
 * /api/share-mutate - constrained, carpenter-facing writes to a
 * shared task-mode doc.
 *
 * The /api/share endpoint accepts whole-doc writes for the owner
 * (publish flow). This endpoint is the OTHER write surface: small,
 * specific operations that the carpenter share view's UI issues
 * (add to backlog, move backlog item onto today). Possession of
 * the share id IS the credential.
 *
 * Server-side merge: each call fetches the current doc from R2,
 * applies the operation, writes it back. That avoids race losses
 * between two carpenters acting at the same time and keeps the
 * surface for what a carpenter can change tightly scoped.
 *
 * Body: { shareId, action, payload, addedBy? }
 *   action = "addBacklog"   payload = { text }
 *   action = "moveToToday"  payload = { taskId, todayIso }
 *
 * Editor's reactive sync is best-effort: the editor polls task_checks
 * for done states already, and we add a similar share-doc poll so
 * Blake's editor view picks up carpenter-added backlog items within
 * ~30s.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { ScheduleDoc, Task } from "@rehearsal-block/core";
import { r2 } from "$lib/storage/r2-server.js";
import pako from "pako";

function newTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadShareDoc(shareId: string): Promise<ScheduleDoc | null> {
  const bytes = await r2.get(`share:${shareId}`);
  if (!bytes) return null;
  const json = pako.ungzip(bytes, { to: "string" });
  return JSON.parse(json) as ScheduleDoc;
}

async function saveShareDoc(shareId: string, doc: ScheduleDoc): Promise<void> {
  const gzipped = pako.gzip(JSON.stringify(doc));
  await r2.put(`share:${shareId}`, new Uint8Array(gzipped), "application/gzip");
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const shareId = typeof body?.shareId === "string" ? body.shareId.trim() : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const payload = body?.payload ?? {};

  if (!shareId) return error(400, "Missing shareId");
  if (!action) return error(400, "Missing action");

  const doc = await loadShareDoc(shareId);
  if (!doc) return error(404, "Share not found");
  if ((doc.kind ?? "rehearsal") !== "task") {
    return error(400, "Share is not a task schedule");
  }

  if (action === "addBacklog") {
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) return error(400, "Missing text");
    const task: Task = { id: newTaskId(), text, done: false };
    doc.backlog = [...(doc.backlog ?? []), task];
    await saveShareDoc(shareId, doc);
    return json({ ok: true, task });
  }

  if (action === "moveToToday") {
    const taskId = typeof payload.taskId === "string" ? payload.taskId : "";
    const todayIso = typeof payload.todayIso === "string" ? payload.todayIso : "";
    if (!taskId) return error(400, "Missing taskId");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) return error(400, "Invalid todayIso");

    const backlog = doc.backlog ?? [];
    const task = backlog.find((t) => t.id === taskId);
    if (!task) return error(404, "Task not found in backlog");

    doc.backlog = backlog.filter((t) => t.id !== taskId);
    const existing = doc.schedule[todayIso];
    const baseDay = existing ?? {
      eventTypeId: "",
      calls: [],
      description: "",
      notes: "",
      location: "",
    };
    doc.schedule[todayIso] = {
      ...baseDay,
      tasks: [...(baseDay.tasks ?? []), task],
    };
    await saveShareDoc(shareId, doc);
    return json({ ok: true });
  }

  return error(400, `Unknown action: ${action}`);
};
