/**
 * Helpers for Task Schedule mode.
 *
 * The data model lives in `types.ts`. This file holds factory and
 * derivation helpers that consumers in the standalone app can rely on
 * without re-implementing the same logic in every component.
 */

import type { ScheduleDoc, Task } from "./types.js";

/**
 * Create a new task with a fresh id. `done` defaults to false; assignees
 * default to empty (undefined - not stored when empty to keep docs lean).
 */
export function newTask(opts: { text: string; assigneeIds?: string[] }): Task {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const task: Task = {
    id,
    text: opts.text,
    done: false,
  };
  if (opts.assigneeIds && opts.assigneeIds.length > 0) {
    task.assigneeIds = [...opts.assigneeIds];
  }
  return task;
}

/**
 * View-only carryover. Returns all uncompleted tasks from days strictly
 * before `todayIso`, in oldest-first order. Consumers prepend this list
 * to today's own task list when rendering a day cell - the underlying
 * data is never mutated, so each task remains attached to its original
 * day for record-keeping (and shows the correct `originalDate` when we
 * caption stragglers as "↩ from <date>" in TS-2b).
 *
 * Returns an empty array for rehearsal-mode docs.
 */
export function getCarriedOverTasks(
  doc: ScheduleDoc,
  todayIso: string,
): Array<{ task: Task; originalDate: string }> {
  if ((doc.kind ?? "rehearsal") !== "task") return [];

  const carried: Array<{ task: Task; originalDate: string }> = [];
  const dates = Object.keys(doc.schedule)
    .filter((iso) => iso < todayIso)
    .sort();

  for (const iso of dates) {
    const day = doc.schedule[iso];
    const tasks = day?.tasks;
    if (!tasks || tasks.length === 0) continue;
    for (const task of tasks) {
      if (!task.done) carried.push({ task, originalDate: iso });
    }
  }

  return carried;
}
