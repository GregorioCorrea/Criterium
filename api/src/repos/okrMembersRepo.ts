import { query } from "../db";

export type OkrRole = "owner" | "editor" | "viewer";

export type OkrMemberRow = {
  tenantId: string;
  okrId: string;
  userObjectId: string;
  role: OkrRole;
  createdAt: string;
  createdBy: string | null;
};

export async function getOkrMember(
  tenantId: string,
  okrId: string,
  userObjectId: string
): Promise<OkrMemberRow | null> {
  const rows = await query<any>(
    `
    SELECT TOP 1
      CAST(tenant_id as varchar(36)) as tenantId,
      CAST(okr_id as varchar(36)) as okrId,
      CAST(user_object_id as varchar(36)) as userObjectId,
      role,
      CONVERT(varchar(19), created_at, 120) as createdAt,
      CAST(created_by as varchar(36)) as createdBy
    FROM dbo.OkrMembers
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
      AND okr_id = CAST(@okrId as uniqueidentifier)
      AND user_object_id = CAST(@userObjectId as uniqueidentifier)
    `,
    { tenantId, okrId, userObjectId }
  );

  if (!rows[0]) return null;
  return {
    tenantId: String(rows[0].tenantId),
    okrId: String(rows[0].okrId),
    userObjectId: String(rows[0].userObjectId),
    role: rows[0].role as OkrRole,
    createdAt: String(rows[0].createdAt),
    createdBy: rows[0].createdBy ? String(rows[0].createdBy) : null,
  };
}

export async function getOkrMemberRole(
  tenantId: string,
  okrId: string,
  userObjectId: string
): Promise<OkrRole | null> {
  const row = await getOkrMember(tenantId, okrId, userObjectId);
  return row?.role ?? null;
}

export async function listOkrMembers(
  tenantId: string,
  okrId: string
): Promise<OkrMemberRow[]> {
  const rows = await query<any>(
    `
    SELECT
      CAST(tenant_id as varchar(36)) as tenantId,
      CAST(okr_id as varchar(36)) as okrId,
      CAST(user_object_id as varchar(36)) as userObjectId,
      role,
      CONVERT(varchar(19), created_at, 120) as createdAt,
      CAST(created_by as varchar(36)) as createdBy
    FROM dbo.OkrMembers
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
      AND okr_id = CAST(@okrId as uniqueidentifier)
    ORDER BY created_at ASC
    `,
    { tenantId, okrId }
  );

  return rows.map((r: any) => ({
    tenantId: String(r.tenantId),
    okrId: String(r.okrId),
    userObjectId: String(r.userObjectId),
    role: r.role as OkrRole,
    createdAt: String(r.createdAt),
    createdBy: r.createdBy ? String(r.createdBy) : null,
  }));
}

export async function addOkrMember(input: {
  tenantId: string;
  okrId: string;
  userObjectId: string;
  role: OkrRole;
  createdBy?: string | null;
}): Promise<"created" | "exists"> {
  const existing = await getOkrMember(input.tenantId, input.okrId, input.userObjectId);
  if (existing) return "exists";
  await query(
    `
    INSERT INTO dbo.OkrMembers
      (tenant_id, okr_id, user_object_id, role, created_at, created_by)
    VALUES
      (CAST(@tenantId as uniqueidentifier),
       CAST(@okrId as uniqueidentifier),
       CAST(@userObjectId as uniqueidentifier),
       @role,
       SYSUTCDATETIME(),
       CAST(@createdBy as uniqueidentifier))
    `,
    {
      tenantId: input.tenantId,
      okrId: input.okrId,
      userObjectId: input.userObjectId,
      role: input.role,
      createdBy: input.createdBy ?? null,
    }
  );
  return "created";
}

export async function updateOkrMemberRole(input: {
  tenantId: string;
  okrId: string;
  userObjectId: string;
  role: OkrRole;
}): Promise<void> {
  await query(
    `
    UPDATE dbo.OkrMembers
    SET role = @role
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
      AND okr_id = CAST(@okrId as uniqueidentifier)
      AND user_object_id = CAST(@userObjectId as uniqueidentifier)
    `,
    {
      tenantId: input.tenantId,
      okrId: input.okrId,
      userObjectId: input.userObjectId,
      role: input.role,
    }
  );
}

export async function deleteOkrMember(input: {
  tenantId: string;
  okrId: string;
  userObjectId: string;
}): Promise<void> {
  await query(
    `
    DELETE FROM dbo.OkrMembers
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
      AND okr_id = CAST(@okrId as uniqueidentifier)
      AND user_object_id = CAST(@userObjectId as uniqueidentifier)
    `,
    input
  );
}

export async function countOkrOwners(
  tenantId: string,
  okrId: string
): Promise<number> {
  const rows = await query<any>(
    `
    SELECT COUNT(*) as count
    FROM dbo.OkrMembers
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
      AND okr_id = CAST(@okrId as uniqueidentifier)
      AND role = 'owner'
    `,
    { tenantId, okrId }
  );
  return Number(rows[0]?.count ?? 0);
}

export async function countOkrMembers(
  tenantId: string,
  okrId: string
): Promise<number> {
  const rows = await query<any>(
    `
    SELECT COUNT(*) as count
    FROM dbo.OkrMembers
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
      AND okr_id = CAST(@okrId as uniqueidentifier)
    `,
    { tenantId, okrId }
  );
  return Number(rows[0]?.count ?? 0);
}
