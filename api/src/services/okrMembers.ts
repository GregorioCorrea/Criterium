import { OkrRole } from "../repos/okrMembersRepo";

export function buildOwnerMember(input: {
  tenantId: string;
  okrId: string;
  userObjectId: string;
}): {
  tenantId: string;
  okrId: string;
  userObjectId: string;
  role: OkrRole;
  createdBy: string;
} {
  return {
    tenantId: input.tenantId,
    okrId: input.okrId,
    userObjectId: input.userObjectId,
    role: "owner",
    createdBy: input.userObjectId,
  };
}

export function canRemoveOwner(ownerCount: number, targetRole: OkrRole): boolean {
  if (targetRole !== "owner") return true;
  return ownerCount > 1;
}
