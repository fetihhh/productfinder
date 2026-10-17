// Google BigQuery REST istemcisi (resmi API; ek paket yok). Hizmet hesabı anahtarı GOOGLE_BQ_CREDENTIALS ortam
// değişkeninde JSON olarak durur. BigQuery deneme alanı (sandbox) ücretsizdir ve kredi kartı istemez: ayda 1 TB sorgu.
// Kamuya açık veri setleri sorgulanır; kendi projede yalnızca sorgu işi çalışır, veri saklanmaz.
import { createSign } from "node:crypto";

type Credentials = { client_email: string; private_key: string; project_id: string };

export function bigQueryCredentials(): Credentials | null {
  const raw = process.env.GOOGLE_BQ_CREDENTIALS;
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<Credentials>;
    return c.client_email && c.private_key && c.project_id ? (c as Credentials) : null;
  } catch {
    return null;
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

let cached: { token: string; until: number } | null = null;

async function accessToken(c: Credentials): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({ iss: c.client_email, scope: "https://www.googleapis.com/auth/bigquery", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }),
  );
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(c.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${sig}` }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`Google kimlik doğrulaması başarısız: ${j.error_description ?? j.error ?? `HTTP ${res.status}`}`);
  cached = { token: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

type Field = { name: string; type: string; mode?: string; fields?: Field[] };
type Cell = { v: unknown };
type QueryResponse = {
  jobComplete?: boolean;
  totalBytesProcessed?: string;
  rows?: { f: Cell[] }[];
  schema?: { fields: Field[] };
  pageToken?: string;
  jobReference?: { jobId: string; location?: string };
  error?: { message: string };
};

function cellValue(v: unknown, f: Field): unknown {
  if (v === null || v === undefined) return null;
  if (f.mode === "REPEATED") return (v as Cell[]).map((x) => cellValue(x.v, { ...f, mode: "NULLABLE" }));
  if (f.type === "RECORD" || f.type === "STRUCT") return rowObject((v as { f: Cell[] }).f, f.fields ?? []);
  if (["INTEGER", "INT64", "FLOAT", "FLOAT64", "NUMERIC"].includes(f.type)) return Number(v);
  if (f.type === "BOOLEAN" || f.type === "BOOL") return v === "true";
  return v;
}

function rowObject(cells: Cell[], fields: Field[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f, i) => [f.name, cellValue(cells[i]?.v, f)]));
}

/** Sorgu çalıştırır (dryRun: yalnızca taranacak bayt hesaplanır, ücretsiz kotadan düşmez). */
export async function bigQuery(sql: string, opts: { dryRun?: boolean } = {}): Promise<{ bytes: number; rows: Record<string, unknown>[] }> {
  const c = bigQueryCredentials();
  if (!c) throw new Error("GOOGLE_BQ_CREDENTIALS tanımlı değil");
  const token = await accessToken(c);
  const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(c.project_id)}/queries`;
  const call = async (url: string, init?: RequestInit): Promise<QueryResponse> => {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(180_000) });
    const j = (await res.json().catch(() => ({}))) as QueryResponse;
    if (!res.ok) throw new Error(`BigQuery: ${j.error?.message ?? `HTTP ${res.status}`}`);
    return j;
  };
  let r = await call(base, {
    method: "POST",
    body: JSON.stringify({ query: sql, useLegacySql: false, dryRun: Boolean(opts.dryRun), timeoutMs: 120_000, maxResults: 5000, location: "US" }),
  });
  let bytes = Number(r.totalBytesProcessed ?? 0);
  if (opts.dryRun) return { bytes, rows: [] };
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 200; i++) {
    bytes = Math.max(bytes, Number(r.totalBytesProcessed ?? 0));
    if (r.jobComplete && r.schema) for (const row of r.rows ?? []) rows.push(rowObject(row.f, r.schema.fields));
    if (r.jobComplete && !r.pageToken) break;
    const job = r.jobReference;
    if (!job) break;
    const q = new URLSearchParams({ location: job.location ?? "US", timeoutMs: "120000", maxResults: "5000" });
    if (r.jobComplete && r.pageToken) q.set("pageToken", r.pageToken);
    r = await call(`${base}/${encodeURIComponent(job.jobId)}?${q}`);
  }
  return { bytes, rows };
}
