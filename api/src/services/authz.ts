import { addOkrMember, countOkrMembers, getOkrMemberRole, OkrRole } from "../repos/okrMembersRepo";
import { buildOwnerMember } from "./okrMembers";

export type AuthzMode = "tenant_open" | "members_only";

export interface RoleResolver {
  getRoleForOkr(tenantId: string, okrId: string, userObjectId: string): Promise<OkrRole | null>;
}

export class DbRoleResolver implements RoleResolver {
  async getRoleForOkr(
    tenantId: string,
    okrId: string,
    userObjectId: string
  ): Promise<OkrRole | null> {
    return getOkrMemberRole(tenantId, okrId, userObjectId);
  }
}

const resolver = new DbRoleResolver();

export function getAuthzMode(): AuthzMode {
  const mode = (process.env.AUTHZ_MODE || "tenant_open").toLowerCase();
  return mode === "members_only" ? "members_only" : "tenant_open";
}

export async function resolveRoleForOkr(
  tenantId: string,
  okrId: string,
  userObjectId: string
): Promise<OkrRole | null> {
  return resolver.getRoleForOkr(tenantId, okrId, userObjectId);
}

export async function ensureRoleForWrite(
  tenantId: string,
  okrId: string,
  userObjectId: string
): Promise<OkrRole | null> {
  const role = await resolver.getRoleForOkr(tenantId, okrId, userObjectId);
  if (role) return role;
  if (getAuthzMode() !== "tenant_open") return null;
  const memberCount = await countOkrMembers(tenantId, okrId);
  if (memberCount > 0) return null;
  await addOkrMember(buildOwnerMember({ tenantId, okrId, userObjectId }));
  return "owner";
}

export function canView(role: OkrRole | null, mode: AuthzMode): boolean {
  if (mode === "tenant_open") return true;
  return role !== null;
}

export function canEdit(role: OkrRole | null): boolean {
  return role === "owner" || role === "editor";
}

export function canDelete(role: OkrRole | null): boolean {
  return role === "owner";
}

export function canManageMembers(role: OkrRole | null): boolean {
  return role === "owner";
}
