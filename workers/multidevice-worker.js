/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT MULTIDEVICE WORKER
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Cloudflare Workers で マルチデバイス認証を管理
 * - Device Registry サーバー
 * - アクセス制御
 * - ロール管理
 */

// ─────────────────────────────────────────────────────────────────
// グローバル設定
// ─────────────────────────────────────────────────────────────────

const CONFIG = {
  KV_NAMESPACE: 'VAULT_KV',  // Cloudflare KV
  API_VERSION: 'v1',
  CORS_ORIGIN: 'https://vault.example.com',
  AUTH_HEADER: 'X-Vault-Token',
  DEVICE_CHALLENGE_EXPIRY: 5 * 60 * 1000,  // 5分
  SHARE_CODE_EXPIRY: 10 * 60 * 1000,        // 10分
};

// ─────────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────────

/**
 * JSON レスポンス
 */
function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Vault-Token'
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
 * リクエスト本体を JSON で取得
 */
async function getRequestBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * トークンを検証
 */
async function validateToken(request, kv) {
  const token = request.headers.get(CONFIG.AUTH_HEADER);
  if (!token) {
    return { valid: false, userId: null };
  }

  // トークンをキャッシュから検証
  const cached = await kv.get(`auth:token:${token}`);
  if (!cached) {
    return { valid: false, userId: null };
  }

  const { userId, expiresAt } = JSON.parse(cached);
  if (Date.parse(expiresAt) < Date.now()) {
    return { valid: false, userId: null };
  }

  return { valid: true, userId };
}

// ─────────────────────────────────────────────────────────────────
// Device Registry API
// ─────────────────────────────────────────────────────────────────

/**
 * POST /devices
 * デバイスを登録・更新
 */
async function handlePostDevice(request, kv, userId) {
  const body = await getRequestBody(request);
  if (!body) {
    return errorResponse('Invalid JSON');
  }

  const {
    deviceId,
    deviceName,
    deviceType,
    masterKeyEncrypted,
    bioCredential,
    bioVaultKey,
    deviceChallenge,
    status = 'active',
    role = 'owner',
    permissions
  } = body;

  if (!deviceId) {
    return errorResponse('deviceId is required');
  }

  // Device Registry を取得
  const registryKey = `vault:devices:${userId}`;
  let registry = await kv.get(registryKey);
  let devices = registry ? JSON.parse(registry).devices : [];

  // 既存デバイスを確認
  const existingIdx = devices.findIndex(d => d.deviceId === deviceId);
  const newDevice = {
    deviceId,
    deviceName,
    deviceType,
    masterKeyEncrypted,
    bioCredential,
    bioVaultKey,
    deviceChallenge,
    status,
    role,
    permissions: permissions || {
      read: true,
      write: role === 'owner',
      share: true,
      manageDevices: role === 'owner'
    },
    registeredAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    devices[existingIdx] = { ...devices[existingIdx], ...newDevice };
  } else {
    devices.push(newDevice);
  }

  // KV に保存
  await kv.put(
    registryKey,
    JSON.stringify({
      userId,
      devices,
      updatedAt: new Date().toISOString()
    }),
    { expirationTtl: 365 * 24 * 60 * 60 }  // 1年
  );

  return response({
    message: 'Device registered',
    device: newDevice
  }, 201);
}

/**
 * GET /devices
 * 全デバイスを取得
 */
async function handleGetDevices(request, kv, userId) {
  const registryKey = `vault:devices:${userId}`;
  const registry = await kv.get(registryKey);

  if (!registry) {
    return response({ devices: [] });
  }

  const { devices } = JSON.parse(registry);
  return response({ devices });
}

/**
 * DELETE /devices/{deviceId}
 * デバイスを削除
 */
async function handleDeleteDevice(request, kv, userId, deviceId) {
  const registryKey = `vault:devices:${userId}`;
  const registry = await kv.get(registryKey);

  if (!registry) {
    return errorResponse('No devices found', 404);
  }

  let { devices } = JSON.parse(registry);
  const originalCount = devices.length;

  devices = devices.filter(d => d.deviceId !== deviceId);

  if (devices.length === originalCount) {
    return errorResponse('Device not found', 404);
  }

  await kv.put(
    registryKey,
    JSON.stringify({
      userId,
      devices,
      updatedAt: new Date().toISOString()
    }),
    { expirationTtl: 365 * 24 * 60 * 60 }
  );

  return response({ message: 'Device deleted' });
}

// ─────────────────────────────────────────────────────────────────
// Share Code API
// ─────────────────────────────────────────────────────────────────

/**
 * POST /share-codes
 * デバイス追加用の共有パスコードを生成
 */
async function handleCreateShareCode(request, kv, userId) {
  // 8桁ランダムパスコード生成
  const code = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => (b % 10).toString())
    .join('');
  const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;

  const shareCodeKey = `vault:share-code:${userId}:${formatted}`;
  const data = {
    code: formatted,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + CONFIG.SHARE_CODE_EXPIRY).toISOString()
  };

  // KV に保存（10分間）
  await kv.put(shareCodeKey, JSON.stringify(data), {
    expirationTtl: Math.ceil(CONFIG.SHARE_CODE_EXPIRY / 1000)
  });

  return response({
    code: formatted,
    expiresAt: data.expiresAt
  }, 201);
}

/**
 * POST /share-codes/validate
 * 共有パスコードを検証
 */
async function handleValidateShareCode(request, kv) {
  const body = await getRequestBody(request);
  const { code } = body || {};

  if (!code) {
    return errorResponse('Code is required');
  }

  // 最新の30個ユーザーから該当コードを検索
  // (実装簡略: 実装では User Index から userId を取得)
  
  // ここでは、リクエスト側で userId を指定することを想定
  const { userId } = body;
  const shareCodeKey = `vault:share-code:${userId}:${code}`;
  const codeData = await kv.get(shareCodeKey);

  if (!codeData) {
    return errorResponse('Invalid or expired code', 401);
  }

  const data = JSON.parse(codeData);
  if (new Date(data.expiresAt) < new Date()) {
    return errorResponse('Code expired', 401);
  }

  return response({
    message: 'Valid code',
    userId: data.userId
  });
}

// ─────────────────────────────────────────────────────────────────
// Access Control API
// ─────────────────────────────────────────────────────────────────

/**
 * POST /access-tokens
 * 新しいアクセストークンを発行
 */
async function handleCreateAccessToken(request, kv, userId) {
  const body = await getRequestBody(request);
  const { deviceId, masterPassword } = body || {};

  if (!deviceId || !masterPassword) {
    return errorResponse('deviceId and masterPassword required');
  }

  // デバイスが登録されているか確認
  const registryKey = `vault:devices:${userId}`;
  const registry = await kv.get(registryKey);

  if (!registry) {
    return errorResponse('No devices registered', 401);
  }

  const { devices } = JSON.parse(registry);
  const device = devices.find(d => d.deviceId === deviceId);

  if (!device || device.status !== 'active') {
    return errorResponse('Device not found or inactive', 401);
  }

  // トークン生成
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);  // 7日

  await kv.put(
    `auth:token:${token}`,
    JSON.stringify({
      userId,
      deviceId,
      role: device.role,
      expiresAt: expiresAt.toISOString()
    }),
    { expirationTtl: 7 * 24 * 60 * 60 }
  );

  return response({
    token,
    expiresAt: expiresAt.toISOString(),
    role: device.role
  }, 201);
}

// ─────────────────────────────────────────────────────────────────
// ルーター
// ─────────────────────────────────────────────────────────────────

/**
 * メインリクエストハンドラ
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
          'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Vault-Token'
        }
      });
    }

    // トークン検証
    const auth = await validateToken(request, kv);
    if (!auth.valid && !path.includes('/share-codes/validate') && 
        !path.includes('/auth/token')) {
      return errorResponse('Unauthorized', 401);
    }

    const userId = auth.userId;

    // ルーティング
    try {
      if (path === '/api/v1/devices' && method === 'GET') {
        return await handleGetDevices(request, kv, userId);
      }
      if (path === '/api/v1/devices' && method === 'POST') {
        return await handlePostDevice(request, kv, userId);
      }
      if (path.match(/^\/api\/v1\/devices\/[^/]+$/) && method === 'DELETE') {
        const deviceId = path.split('/').pop();
        return await handleDeleteDevice(request, kv, userId, deviceId);
      }
      if (path === '/api/v1/share-codes' && method === 'POST') {
        return await handleCreateShareCode(request, kv, userId);
      }
      if (path === '/api/v1/share-codes/validate' && method === 'POST') {
        return await handleValidateShareCode(request, kv);
      }
      if (path === '/api/v1/auth/token' && method === 'POST') {
        return await handleCreateAccessToken(request, kv, userId);
      }

      return errorResponse('Not found', 404);
    } catch (e) {
      console.error('Error:', e);
      return errorResponse('Internal server error', 500);
    }
  }
};
