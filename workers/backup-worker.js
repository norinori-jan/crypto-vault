/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT BACKUP WORKER
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Cloudflare Workers で バックアップ・復元 API を管理
 */

const CONFIG = {
  KV_NAMESPACE: 'VAULT_BACKUPS',
  BACKUP_TTL: 30 * 24 * 60 * 60,  // 30 日
};

/**
 * JSON レスポンス
 */
function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

/**
 * エラーレスポンス
 */
function errorResponse(message, status = 400) {
  return response({ error: message }, status);
}

/**
 * 認証チェック
 */
async function checkAuth(request, kv) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return { valid: false };
  
  const cached = await kv.get(`auth:${token}`);
  if (!cached) return { valid: false };
  
  const { userId, expiresAt } = JSON.parse(cached);
  if (new Date(expiresAt) < new Date()) return { valid: false };
  
  return { valid: true, userId };
}

/**
 * POST /backups
 * バックアップファイルを保存
 */
async function handleCreateBackup(request, kv, userId) {
  const body = await request.json();
  const { backupFile } = body;
  
  if (!backupFile) {
    return errorResponse('backupFile is required');
  }
  
  const backupId = `backup:${userId}:${Date.now()}`;
  
  await kv.put(
    backupId,
    JSON.stringify(backupFile),
    { expirationTtl: CONFIG.BACKUP_TTL }
  );
  
  // メタデータを記録
  const metadataKey = `backups:${userId}`;
  let metadata = await kv.get(metadataKey);
  let list = metadata ? JSON.parse(metadata) : [];
  
  list.push({
    id: backupId,
    createdAt: backupFile.metadata.createdAt,
    entryCount: backupFile.metadata.entryCount
  });
  
  // 最新30個のみ保持
  list = list.slice(-30);
  
  await kv.put(metadataKey, JSON.stringify(list));
  
  return response({
    id: backupId,
    createdAt: backupFile.metadata.createdAt
  }, 201);
}

/**
 * GET /backups
 * バックアップ一覧を取得
 */
async function handleListBackups(request, kv, userId) {
  const metadataKey = `backups:${userId}`;
  const metadata = await kv.get(metadataKey);
  
  if (!metadata) {
    return response({ backups: [] });
  }
  
  const list = JSON.parse(metadata);
  return response({ backups: list });
}

/**
 * GET /backups/{backupId}
 * バックアップを取得
 */
async function handleGetBackup(request, kv, userId, backupId) {
  const key = `backup:${userId}:${backupId}`;
  const backup = await kv.get(key);
  
  if (!backup) {
    return errorResponse('Backup not found', 404);
  }
  
  return response(JSON.parse(backup));
}

/**
 * DELETE /backups/{backupId}
 * バックアップを削除
 */
async function handleDeleteBackup(request, kv, userId, backupId) {
  const key = `backup:${userId}:${backupId}`;
  await kv.delete(key);
  
  // メタデータから削除
  const metadataKey = `backups:${userId}`;
  let metadata = await kv.get(metadataKey);
  if (metadata) {
    let list = JSON.parse(metadata);
    list = list.filter(b => b.id !== key);
    await kv.put(metadataKey, JSON.stringify(list));
  }
  
  return response({ message: 'Backup deleted' });
}

/**
 * メインハンドラ
 */
export default {
  async fetch(request, env) {
    const kv = env[CONFIG.KV_NAMESPACE];
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // CORS プリフライト
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }
    
    // 認証チェック
    const auth = await checkAuth(request, kv);
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401);
    }
    
    const userId = auth.userId;
    
    try {
      if (path === '/api/v1/backups' && method === 'POST') {
        return await handleCreateBackup(request, kv, userId);
      }
      if (path === '/api/v1/backups' && method === 'GET') {
        return await handleListBackups(request, kv, userId);
      }
      if (path.match(/^\/api\/v1\/backups\/[^/]+$/) && method === 'GET') {
        const backupId = path.split('/').pop();
        return await handleGetBackup(request, kv, userId, backupId);
      }
      if (path.match(/^\/api\/v1\/backups\/[^/]+$/) && method === 'DELETE') {
        const backupId = path.split('/').pop();
        return await handleDeleteBackup(request, kv, userId, backupId);
      }
      
      return errorResponse('Not found', 404);
    } catch (e) {
      console.error('Error:', e);
      return errorResponse('Internal server error', 500);
    }
  }
};
