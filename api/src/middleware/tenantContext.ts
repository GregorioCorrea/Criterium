import type { Request, Response, NextFunction } from "express";
import { getDefaultTenantId } from "../repos/tenantRepo";
import { tenantExists } from "../repos/tenantRepo";

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function tenantContext(req: Request, res: Response, next: NextFunction) {
  const headerTenant = (req.header("x-tenant-id") ?? "").trim();

  // Si no mandan tenant, fallback a default (dev)
  if (!headerTenant) {
    req.tenantId = await getDefaultTenantId();
    return next();
  }

  // Si mandan tenant, tiene que ser GUID
  if (!GUID_RE.test(headerTenant)) {
    return res.status(400).json({ error: "tenant_id_invalid" });
  }

  // Y tiene que existir
  const exists = await tenantExists(headerTenant);
  if (!exists) {
    return res.status(404).json({ error: "tenant_not_found" });
  }

  req.tenantId = headerTenant;
  next();
}
