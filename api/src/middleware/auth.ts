import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request, Response, NextFunction } from "express";

const jwks = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys")
);

const AUD = process.env.AAD_CLIENT_ID || "bde54ed0-4aa8-4139-82f8-5af61e3c809f";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "missing_token" });

  const token = h.slice("Bearer ".length);

  try {
    const { payload } = await jwtVerify(token, jwks, {
      audience: AUD,
    });

    // claims clave
    const tid = payload.tid as string | undefined;
    const oid = payload.oid as string | undefined;

    if (!tid || !oid) return res.status(401).json({ error: "invalid_token_claims" });

    // guardamos en req para el resto
    (req as any).tenantId = tid;
    (req as any).userId = oid;

    next();
  } catch (e) {
    return res.status(401).json({ error: "invalid_token" });
  }
}
