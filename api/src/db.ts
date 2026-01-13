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

export async function queryTx<T>(
  tx: sql.Transaction,
  sqlText: string,
  params?: Record<string, any>
): Promise<T[]> {
  const req = new sql.Request(tx);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      req.input(k, v);
    }
  }
  const result = await req.query(sqlText);
  return result.recordset as T[];
}

export async function withTransaction<T>(
  fn: (tx: sql.Transaction) => Promise<T>
): Promise<T> {
  await poolConnect;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
