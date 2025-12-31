import { Request, Response, NextFunction } from "express";
import { jwtVerify, createRemoteJWKSet } from "jose";

const TENANT_ID = process.env.AAD_TENANT_ID;
const CLIENT_ID = process.env.AAD_CLIENT_ID!;
const AUDIENCE = process.env.AAD_AUDIENCE!;

const jwks = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys")
);

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_token" });
  }

  const token = auth.slice("Bearer ".length);

  try {
    const { payload } = await jwtVerify(token, jwks, {
      audience: [AUDIENCE, CLIENT_ID].filter(Boolean),
    });

    if (!payload.tid || !payload.oid) {
      return res.status(401).json({ error: "invalid_token_claims" });
    }

    const tid = payload.tid as string;
    const iss = payload.iss as string | undefined;
    const allowedIssuers = [
      `https://sts.windows.net/${tid}/`,
      `https://login.microsoftonline.com/${tid}/v2.0`,
    ];
    if (!iss || !allowedIssuers.includes(iss)) {
      return res.status(401).json({ error: "invalid_token_issuer" });
    }
    if (TENANT_ID && TENANT_ID !== tid) {
      return res.status(401).json({ error: "invalid_tenant" });
    }

    req.tenantId = tid;
    req.userId = payload.oid as string;

    next();
  } catch (err) {
    console.error("AUTH ERROR", err);
    return res.status(401).json({ error: "invalid_token" });
  }
}
