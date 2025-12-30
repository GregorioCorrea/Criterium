import { Request, Response, NextFunction } from "express";

export function requireTenant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.tenantId) {
    return res.status(400).json({ error: "tenant_missing" });
  }
  next();
}
