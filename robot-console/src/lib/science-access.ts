type ScienceEditor = {role: string; accountType?: string | null; identityVerified?: boolean} | null | undefined;

/** Public browsing never grants permission to publish teaching materials. */
export function canManageScience(user: ScienceEditor): boolean {
  return Boolean(user && (user.role === "ADMIN" || user.accountType === "TEACHER" && user.identityVerified));
}
