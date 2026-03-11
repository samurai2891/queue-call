import type { User } from "../../drizzle/schema";

type AuthSubjectUser = Pick<User, "openId"> | null | undefined;

const splitIds = (rawValue: string | undefined) =>
  (rawValue ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

export function getAuthSubject(user: AuthSubjectUser): string | null {
  if (!user?.openId) return null;

  const subject = user.openId.trim();
  return subject.length > 0 ? subject : null;
}

export function getInternalAdminIds(): string[] {
  return splitIds(process.env.INTERNAL_ADMIN_IDS);
}

export function isInternalAdminUser(user: AuthSubjectUser): boolean {
  const authSubject = getAuthSubject(user);
  if (!authSubject) return false;

  return getInternalAdminIds().includes(authSubject);
}
