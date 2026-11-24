type ReviewAccount = {
  role: string;
  accountType?: string | null;
  identityVerified?: boolean;
  phone?: string | null;
  phoneVerified?: boolean;
};

export function canReviewSubmissions(user: ReviewAccount | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.accountType !== "TEACHER" || !user.identityVerified || !user.phoneVerified || !user.phone) return false;
  // Keep real reviewer phone numbers in server configuration, not in source or browser bundles.
  return (process.env.REVIEW_TEACHER_PHONES ?? "").split(",").some(phone => phone.trim() === user.phone);
}
