import sql from "mssql";

const connString = process.env.SQL_CONNECTION_STRING;
if (!connString) {
  throw new Error("SQL_CONNECTION_STRING no está configurada");
}

const pool = new sql.ConnectionPool(connString);
const poolConnect = pool.connect();

export async function query<T>(
  sqlText: string,
  params?: Record<string, any>
): Promise<T[]> {
  await poolConnect;
  const req = pool.request();

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      req.input(k, v);
    }
  }

  const result = await req.query(sqlText);
  return result.recordset as T[];
}
