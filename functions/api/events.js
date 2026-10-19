// Cloudflare Pages Function: GET/POST /api/events
//
// A single-user sync store for the calendar. The Pages project needs two bindings
// (Settings → Bindings / Variables and Secrets):
//   DB             – a D1 database (the table is created automatically)
//   SYNC_PASSWORD  – a secret; the app sends it as "Authorization: Bearer <password>"
//
// GET  /api/events?since=<ms>   → { cursor, changes: [{ id, deleted, data }] } changed after `since`
// POST /api/events { changes }  → upserts events / tombstones; the server stamps the write time

const MAX_CHANGES = 500;
const MAX_EVENT_BYTES = 8192;
let schemaReady = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function authorized(request, env) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const enc = new TextEncoder();
  // Compare fixed-length digests so the comparison takes the same time whatever the input.
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(token)),
    crypto.subtle.digest('SHA-256', enc.encode(env.SYNC_PASSWORD)),
  ]);
  return token.length > 0 && crypto.subtle.timingSafeEqual(a, b);
}

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      data TEXT,
      updated INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS events_updated ON events (updated)'),
  ]);
  schemaReady = true;
}

export async function onRequest({ request, env }) {
  if (!env.DB || !env.SYNC_PASSWORD) return json({ error: 'not_configured' }, 503);
  if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401);
  await ensureSchema(env.DB);

  if (request.method === 'GET') {
    const since = Number(new URL(request.url).searchParams.get('since')) || 0;
    const { results } = await env.DB
      .prepare('SELECT id, data, updated, deleted FROM events WHERE updated > ? ORDER BY updated')
      .bind(since)
      .all();
    const cursor = results.reduce((m, r) => Math.max(m, r.updated), since);
    return json({
      cursor,
      changes: results.map((r) => ({ id: r.id, deleted: !!r.deleted, data: r.deleted ? null : JSON.parse(r.data) })),
    });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
    const changes = Array.isArray(body && body.changes) ? body.changes : null;
    if (!changes || changes.length > MAX_CHANGES) return json({ error: 'bad_request' }, 400);

    const now = Date.now();
    const upsert = env.DB.prepare(`INSERT INTO events (id, data, updated, deleted) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (id) DO UPDATE SET data = ?2, updated = ?3, deleted = ?4`);
    const stmts = [];
    for (const c of changes) {
      if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 64) return json({ error: 'bad_id' }, 400);
      if (!c.deleted && (typeof c.data !== 'object' || c.data === null || c.data.id !== c.id)) return json({ error: 'bad_data' }, 400);
      const data = c.deleted ? null : JSON.stringify(c.data);
      if (data && data.length > MAX_EVENT_BYTES) return json({ error: 'too_large' }, 413);
      stmts.push(upsert.bind(c.id, data, now, c.deleted ? 1 : 0));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, updated: now });
  }

  return json({ error: 'method_not_allowed' }, 405);
}
