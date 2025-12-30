import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    tenantId?: string; // Tenant ID
    userId?: string; // User ID
    scopes?: string[]; // User scopes/permissions
  }
}
