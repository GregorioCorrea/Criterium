import { OkrRole } from "../repos/okrMembersRepo";
import { canManageMembers } from "./authz";
import { ResolvedUser, UserResolver } from "./userResolver";

export type AddMemberByEmailResult =
  | { status: 201; body: ResolvedUser & { role: OkrRole } }
  | { status: 400 | 403 | 404 | 409 | 502; body: { error: string } };

export async function addMemberByEmail(
  input: {
    tenantId: string;
    okrId: string;
    actorRole: OkrRole | null;
    actorUserId: string;
    email: string;
    role: OkrRole;
  },
  deps: {
    resolver: UserResolver;
    addMember: (data: {
      tenantId: string;
      okrId: string;
      userObjectId: string;
      role: OkrRole;
      createdBy: string;
      displayName?: string | null;
      email?: string | null;
    }) => Promise<"created" | "exists">;
  }
): Promise<AddMemberByEmailResult> {
  if (!canManageMembers(input.actorRole)) {
    return { status: 403, body: { error: "forbidden" } };
  }

  try {
    const resolved = await deps.resolver.resolveByEmail(input.tenantId, input.email);
    const result = await deps.addMember({
      tenantId: input.tenantId,
      okrId: input.okrId,
      userObjectId: resolved.userObjectId,
      role: input.role,
      createdBy: input.actorUserId,
      displayName: resolved.displayName,
      email: resolved.email,
    });
    if (result === "exists") {
      return { status: 409, body: { error: "member_exists" } };
    }
    return { status: 201, body: { ...resolved, role: input.role } };
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "graph_credentials_missing") {
      return { status: 502, body: { error: "graph_credentials_missing" } };
    }
    if (message === "graph_user_not_found") {
      return { status: 404, body: { error: "user_not_found" } };
    }
    if (message === "graph_user_ambiguous") {
      return { status: 409, body: { error: "user_ambiguous" } };
    }
    if (message.startsWith("graph_")) {
      return { status: 502, body: { error: "graph_unavailable" } };
    }
    return { status: 502, body: { error: "graph_unavailable" } };
  }
}
