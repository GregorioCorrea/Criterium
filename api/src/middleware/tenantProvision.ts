import type { Request, Response, NextFunction } from "express";
import { query } from "../db";

export async function ensureTenant(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(500).json({ error: "missing_tenant_context" });

  const rows = await query<any>(
    `SELECT TOP 1 tenant_id FROM dbo.tenants WHERE tenant_id = CAST(@tenantId as uniqueidentifier)`,
    { tenantId }
  );

  if (!rows[0]) {
    await query(
      `INSERT INTO dbo.tenants (tenant_id, status) VALUES (CAST(@tenantId as uniqueidentifier), 'active')`,
      { tenantId }
    );
  }

  next();
}
