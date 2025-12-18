import sql from "mssql";

let pool: sql.ConnectionPool | null = null;

export function getConnString(): string {
  const cs = process.env.SQL_CONNECTION_STRING;
  if (!cs) {
    throw new Error("SQL_CONNECTION_STRING no está seteada en el environment.");
  }
  return cs;
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool) return pool;

  const connString = getConnString();
  pool = await sql.connect(connString);

  // Si se cae, permitimos que se re-inicialice
  pool.on("error", (err) => {
    console.error("SQL pool error:", err);
    pool = null;
  });

  return pool;
}

export async function query<T = any>(
  text: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const p = await getPool();
  const req = p.request();

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      req.input(k, v as any);
    }
  }

  const result = await req.query(text);
  return (result.recordset ?? []) as T[];
}
