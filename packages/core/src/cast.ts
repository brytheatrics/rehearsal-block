/**
 * Cast-name display helpers.
 *
 * The grid and sidebar show cast members by first name only to keep
 * chips compact. When two actors share a first name (e.g. two Michaels),
 * we disambiguate by appending the last-initial ("Michael P." /
 * "Michael T."). If the last initial ALSO collides (rare, e.g. two
 * Michael Patels), we escalate to the full last name.
 *
 * The cast display mode lets the director swap the primary label:
 * - "actor": first name (disambiguated, as above)
 * - "character": character name (disambiguated with the actor's initials
 *   on the rare collision)
 * - "both": "First Name / Character" - the actor-mode disambiguation is
 *   still applied to the actor portion
 *
 * This mirrors TLT's `_shortenName` logic. Components call
 * `castDisplayNames(cast, mode)` once per render and cache via
 * `$derived`, looking up each member's display string by id.
 */

import type { CastDisplayMode, CastMember } from "./types.js";

/**
 * Compute display names for every cast member, disambiguating name
 * collisions. Returns a Map keyed by cast member id.
 */
export function castDisplayNames(
  cast: readonly CastMember[],
  mode: CastDisplayMode = "actor",
): Map<string, string> {
  // Actor-side disambiguation is the base layer - "both" mode reuses it
  // for its actor portion, and "character" mode falls back to a hybrid
  // label when two characters collide.
  const actorLabels = buildActorLabels(cast);

  // "actor" and "both" modes both use the actor-side label as the
  // primary chip label; the chip component decides whether to show a
  // second character line based on the mode.
  if (mode === "actor" || mode === "both") return actorLabels;

  if (mode === "character") {
    const out = new Map<string, string>();
    const byCharacter = new Map<string, CastMember[]>();
    for (const m of cast) {
      const key = m.character.trim().toLowerCase();
      const bucket = byCharacter.get(key) ?? [];
      bucket.push(m);
      byCharacter.set(key, bucket);
    }
    for (const bucket of byCharacter.values()) {
      if (bucket.length === 1) {
        const m = bucket[0]!;
        out.set(m.id, m.character);
        continue;
      }
      // Two actors playing the same character (rare but possible -
      // understudy shows, double-casting). Append the actor label to
      // disambiguate.
      for (const m of bucket) {
        const actor = actorLabels.get(m.id) ?? m.firstName;
        out.set(m.id, `${m.character} (${actor})`);
      }
    }
    return out;
  }

  // Unreachable under the current CastDisplayMode union, but keeps TS
  // happy if the union grows.
  return actorLabels;
}

/**
 * Internal: build the actor-mode disambiguation map. Split out so
 * "character" and "both" modes can reuse it.
 */
function buildActorLabels(
  cast: readonly CastMember[],
): Map<string, string> {
  const byFirstName = new Map<string, CastMember[]>();
  for (const m of cast) {
    const key = m.firstName.trim().toLowerCase();
    const bucket = byFirstName.get(key) ?? [];
    bucket.push(m);
    byFirstName.set(key, bucket);
  }

  const out = new Map<string, string>();
  for (const bucket of byFirstName.values()) {
    if (bucket.length === 1) {
      const m = bucket[0]!;
      out.set(m.id, m.firstName);
      continue;
    }

    // Multiple people share this first name. Try last-initial first.
    const initials = bucket.map((m) =>
      (m.lastName.trim()[0] ?? "").toUpperCase(),
    );
    const initialCounts = new Map<string, number>();
    for (const ini of initials) {
      initialCounts.set(ini, (initialCounts.get(ini) ?? 0) + 1);
    }

    bucket.forEach((m, i) => {
      const ini = initials[i]!;
      if (ini && (initialCounts.get(ini) ?? 0) === 1) {
        out.set(m.id, `${m.firstName} ${ini}.`);
      } else {
        // Last initial still collides (or missing) - fall back to the
        // full last name so there's no ambiguity at all.
        out.set(m.id, `${m.firstName} ${m.lastName}`.trim());
      }
    });
  }

  return out;
}

/**
 * Convenience single-lookup variant. Prefer `castDisplayNames(cast, mode)`
 * + `.get(id)` in hot render paths - this version recomputes the whole
 * map every call.
 */
export function displayNameFor(
  member: CastMember,
  cast: readonly CastMember[],
  mode: CastDisplayMode = "actor",
): string {
  return castDisplayNames(cast, mode).get(member.id) ?? member.firstName;
}
