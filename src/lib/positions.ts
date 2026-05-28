export type PositionEntityLike = {
  position?: { name?: unknown } | null;
  positionName?: unknown;
  position_name?: unknown;
} | null | undefined;

/**
 * normalize: trim, lower, collapse whitespace.
 */
export function normalizePositionName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized.length ? normalized : null;
}

/**
 * getPositionName(entity): returns normalized string or null.
 * Lookup order:
 * 1) entity.position?.name
 * 2) entity.positionName
 * 3) entity.position_name
 */
export function getPositionName(entity: PositionEntityLike): string | null {
  const raw =
    entity?.position?.name ??
    entity?.positionName ??
    entity?.position_name ??
    null;

  return normalizePositionName(raw);
}

const EXCLUDED_SUBSTRINGS = [
  "директор",
  "администратор",
] as const;

/**
 * true if includes any of [директор, администратор].
 * Commercial director is NOT excluded (they have KPI).
 */
export function isExcludedFromEmployeeRating(positionName: unknown): boolean {
  const name = normalizePositionName(positionName);
  if (!name) return false;
  // Commercial director participates in rating
  if (name.includes("коммерческий")) return false;
  return EXCLUDED_SUBSTRINGS.some((s) => name.includes(s));
}

/**
 * true if NOT excluded.
 * If missing/unknown position => true (safety).
 */
export function isRatingParticipant(positionName: unknown): boolean {
  const name = normalizePositionName(positionName);
  if (!name) return true;
  return !isExcludedFromEmployeeRating(name);
}

export type RatingAccessLevel = "admin" | "rop" | "team" | "none";

/**
 * getRatingAccessLevel(positionName):
 * - admin if includes director/admin/commercial director
 * - rop if includes 'роп'
 * - team if includes any of ['моп','риелтор','ипотечный брокер']
 * - none otherwise
 */
export function getRatingAccessLevel(positionName: unknown): RatingAccessLevel {
  const name = normalizePositionName(positionName);
  if (!name) return "none";

  if (
    name.includes("директор") ||
    name.includes("администратор") ||
    name.includes("коммерческий директор")
  ) {
    return "admin";
  }

  if (name.includes("роп")) return "rop";

  if (
    name.includes("моп") ||
    name.includes("риелтор") ||
    name.includes("ипотечный брокер")
  ) {
    return "team";
  }

  return "none";
}

/**
 * shouldHidePersonalRevenue(positionName): true for director/admin only
 * (NOT for commercial director).
 */
export function shouldHidePersonalRevenue(positionName: unknown): boolean {
  const name = normalizePositionName(positionName);
  if (!name) return false;
  if (name.includes("администратор")) return true;
  if (name.includes("коммерческий директор")) return false;
  return name.includes("директор");
}

/**
 * shouldHideRatingPlace(positionName): true if excluded from rating
 * (director/admin/commercial director).
 */
export function shouldHideRatingPlace(positionName: unknown): boolean {
  return isExcludedFromEmployeeRating(positionName);
}
