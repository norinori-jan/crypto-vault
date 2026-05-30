/**
 * VAULT Share Worker — Cloudflare Workers + KV
 *
 * デプロイ手順:
 * 1. https://dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. このコードを貼り付け
 * 3. Settings → Variables → KV Namespace Bindings
 *    Variable name: VAULT_SHARE  （KV Namespaceを新規作成して紐付け）
 * 4. デプロイ後、Worker URLをメモ（vault-ui側の WORKER URL に設定）
 *
 * エンドポイント:
 *   POST /share          → Blobを保存、share IDを返す
 *   GET  /share/:id      → Blobを取得（取得後に件数カウント）
 *   DELETE /share/:id    → 手動削除
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['share', ':id']

    // POST /share — 新規保存
    if (request.method === 'POST' && parts[0] === 'share') {
      return handleCreate(request, env);
    }

    // GET /share/:id — 取得
    if (request.method === 'GET' && parts[0] === 'share' && parts[1]) {
      return handleGet(parts[1], env);
    }

    // DELETE /share/:id — 削除
    if (request.method === 'DELETE' && parts[0] === 'share' && parts[1]) {
      return handleDelete(parts[1], env);
    }

    return json({ error: 'not found' }, 404);
  }
};

// ── CREATE ──────────────────────────────────
async function handleCreate(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const { blob, expiresInHours = 24, label = '' } = body;
  if (!blob) return json({ error: 'blob required' }, 400);

  // 最大保持時間: 7日
  const hours = Math.min(Math.max(1, parseInt(expiresInHours) || 24), 168);
  const ttlSec = hours * 3600;

  const id = generateId();
  const record = {
    blob,          // 暗号化済みBlob（サーバーは中身を知らない）
    label,         // サービス名など（任意）
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlSec * 1000,
    viewCount: 0,
  };

  await env.VAULT_SHARE.put(id, JSON.stringify(record), { expirationTtl: ttlSec });
  return json({ id, expiresAt: record.expiresAt, expiresInHours: hours });
}

// ── GET ─────────────────────────────────────
async function handleGet(id, env) {
  const raw = await env.VAULT_SHARE.get(id);
  if (!raw) return json({ error: 'not found or expired' }, 404);

  let record;
  try { record = JSON.parse(raw); } catch { return json({ error: 'corrupt data' }, 500); }

  // viewCount更新（非同期、失敗しても返す）
  record.viewCount += 1;
  const remaining = Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000));

  // TTL再設定（KVはPUT時にしかTTL設定できない）
  if (remaining > 0) {
    await env.VAULT_SHARE.put(id, JSON.stringify(record), { expirationTtl: remaining });
  }

  return json({
    blob: record.blob,
    label: record.label,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    viewCount: record.viewCount,
  });
}

// ── DELETE ──────────────────────────────────
async function handleDelete(id, env) {
  await env.VAULT_SHARE.delete(id);
  return json({ deleted: true });
}

// ── HELPERS ─────────────────────────────────
function generateId() {
  // 16バイト = 32文字のhex
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}
