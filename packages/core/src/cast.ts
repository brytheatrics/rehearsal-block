/**
 * Cast-name display helpers.
 *
 * The grid and sidebar show cast and crew by first name only to keep
 * chips compact. When two people share a first name (e.g. two Marcuses),
 * we disambiguate by appending the last-initial ("Marcus C." /
 * "Marcus W."). If the last initial ALSO collides (rare, e.g. two
 * Marcus Chens), we escalate to the full last name.
 *
 * **Cross-pool disambiguation**: first-name collisions are detected
 * across BOTH cast and crew together. So if the cast has "Marcus Chen"
 * (Romeo) and the production team has "Marcus Webb" (Fight Choreographer),
 * both chips render as "Marcus C." / "Marcus W." - not just "Marcus" /
 * "Marcus". Always pass the counterpart pool to `castDisplayNames` and
 * `crewFirstNameLabels` so the grid labels stay unambiguous.
 *
 * The cast display mode lets the director swap the primary label:
 * - "actor": first name (disambiguated, as above)
 * - "character": character name (disambiguated with the actor's initials
 *   on the rare collision)
 * - "both": "First Name / Character" - the actor-mode disambiguation is
 *   still applied to the actor portion
 *
 * This mirrors TLT's `_shortenName` logic. Components call
 * `castDisplayNames(cast, mode, crew)` once per render and cache via
 * `$derived`, looking up each member's display string by id.
 */

import type { CastDisplayMode, CastMember, CrewMember } from "./types.js";

/**
 * Compute display names for every cast member, disambiguating name
 * collisions. Returns a Map keyed by cast member id.
 *
 * When `crew` is provided (recommended), first-name collisions are
 * detected across both pools so "Marcus Chen" (cast) and "Marcus Webb"
 * (crew) both get last-initial labels. Pass an empty array (or omit the
 * arg) only when crew context is guaranteed irrelevant.
 */
export function castDisplayNames(
  cast: readonly CastMember[],
  mode: CastDisplayMode = "actor",
  crew: readonly CrewMember[] = [],
): Map<string, string> {
  // Actor-side disambiguation is the base layer - "both" mode reuses it
  // for its actor portion, and "character" mode falls back to a hybrid
  // label when two characters collide. Pool-aware so crew first names
  // can trigger disambiguation on the cast side too.
  const { cast: actorLabels } = buildFirstNameLabels(cast, crew);

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
 * Compute disambiguated first-name labels for every crew member,
 * considering cast as well so cross-pool collisions are resolved.
 * Returns a Map keyed by crew member id.
 *
 * Use this in combination with the crew display mode to render crew
 * chips: "name" mode uses the label directly, "role" mode uses the
 * role text, "both" mode concatenates "{label} / {role}".
 */
export function crewFirstNameLabels(
  cast: readonly CastMember[],
  crew: readonly CrewMember[],
): Map<string, string> {
  return buildFirstNameLabels(cast, crew).crew;
}

type NamedMember = Pick<CastMember, "id" | "firstName" | "lastName">;

/**
 * Internal: cross-pool first-name disambiguation.
 *
 * Returns two maps (one per pool) keyed by member id, where each value
 * is the compact display label ("Marcus", "Marcus C.", or the full
 * "Marcus Chen" as a last-resort). The two pools are disambiguated
 * TOGETHER so a first name appearing in both ends up with distinct
 * labels even though each pool on its own has only one entry for it.
 */
function buildFirstNameLabels(
  cast: readonly CastMember[],
  crew: readonly CrewMember[],
): { cast: Map<string, string>; crew: Map<string, string> } {
  type Entry = NamedMember & { pool: "cast" | "crew" };
  const all: Entry[] = [
    ...cast.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      pool: "cast" as const,
    })),
    ...crew.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      pool: "crew" as const,
    })),
  ];

  const byFirstName = new Map<string, Entry[]>();
  for (const m of all) {
    const key = m.firstName.trim().toLowerCase();
    const bucket = byFirstName.get(key) ?? [];
    bucket.push(m);
    byFirstName.set(key, bucket);
  }

  const castOut = new Map<string, string>();
  const crewOut = new Map<string, string>();

  for (const bucket of byFirstName.values()) {
    // Treat identical firstName+lastName entries (the same person in both
    // cast and crew) as a single effective person for disambiguation. If
    // every member of the bucket is the same firstName+lastName, there's
    // nothing to disambiguate and everyone gets the bare first name.
    const fullKey = (m: Entry) =>
      `${m.firstName.trim().toLowerCase()}|${m.lastName.trim().toLowerCase()}`;
    const uniqueFullNames = new Set(bucket.map(fullKey));

    if (bucket.length === 1 || uniqueFullNames.size === 1) {
      for (const m of bucket) {
        (m.pool === "cast" ? castOut : crewOut).set(m.id, m.firstName);
      }
      continue;
    }

    // Multiple distinct people share this first name. Try last-initial
    // first - but dups from the same person should share one "initial
    // slot" so they don't force each other into full-name fallback.
    const slotByFullName = new Map<string, string>(); // full-name → initial
    const slotCounts = new Map<string, number>();     // initial → # of distinct people using it
    for (const m of bucket) {
      const fk = fullKey(m);
      if (slotByFullName.has(fk)) continue;
      const ini = (m.lastName.trim()[0] ?? "").toUpperCase();
      slotByFullName.set(fk, ini);
      slotCounts.set(ini, (slotCounts.get(ini) ?? 0) + 1);
    }

    for (const m of bucket) {
      const target = m.pool === "cast" ? castOut : crewOut;
      const ini = slotByFullName.get(fullKey(m)) ?? "";
      if (ini && (slotCounts.get(ini) ?? 0) === 1) {
        target.set(m.id, `${m.firstName} ${ini}.`);
      } else {
        // Last initial still collides (or missing) - fall back to the
        // full last name so there's no ambiguity at all.
        target.set(m.id, `${m.firstName} ${m.lastName}`.trim());
      }
    }
  }

  return { cast: castOut, crew: crewOut };
}

/**
 * Convenience single-lookup variant. Prefer `castDisplayNames(cast, mode, crew)`
 * + `.get(id)` in hot render paths - this version recomputes the whole
 * map every call.
 */
export function displayNameFor(
  member: CastMember,
  cast: readonly CastMember[],
  mode: CastDisplayMode = "actor",
  crew: readonly CrewMember[] = [],
): string {
  return castDisplayNames(cast, mode, crew).get(member.id) ?? member.firstName;
}

/**
 * Normalize a phone string to XXX-XXX-XXXX format.
 * Strips all non-digit characters, then formats if exactly 10 digits.
 * Returns the original string trimmed if it doesn't look like a US number.
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Strip leading 1 for 11-digit US numbers
  const d = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  if (d.length === 10) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return raw.trim();
}
