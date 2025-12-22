import { Request, Response, NextFunction } from "express";
import { getDefaultTenantId } from "../repos/tenantRepo";

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

export async function tenantContext(req: Request, _res: Response, next: NextFunction) {
  const headerTenant = req.header("x-tenant-id");

  if (headerTenant && headerTenant.length > 10) {
    req.tenantId = headerTenant;
  } else {
    req.tenantId = await getDefaultTenantId();
  }

  next();
}
