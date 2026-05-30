/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT CORE — STORAGE LAYER
 * ═══════════════════════════════════════════════════════════════════
 * 
 * IndexedDB ラッパー層
 * ローカル永続ストレージの操作を担当
 * 
 * 仕様:
 *  - データベース名: vault_db
 *  - オブジェクトストア: vault_store
 *  - キー形式: 文字列キー
 *  - 値形式: JSON化可能なオブジェクト
 * 
 * 対応ブラウザ:
 *  - Chrome / Edge / Safari / Firefox
 *  - iOS Safari（iPhone）
 *  - Edge（Windows）
 * ═══════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const DB_CONFIG = {
  name: 'vault_db',           // IndexedDBデータベース名
  store: 'vault_store',       // オブジェクトストア名
  version: 1                  // スキーマバージョン
};

/**
 * IndexedDB キー定義
 * マジックストリングを避けるため、一元管理
 */
const STORAGE_KEYS = {
  VAULT_BLOB: 'vault_blob',           // Vault全体（暗号化済み）
  WORKER_URL: 'vault_worker_url',    // Cloudflare Worker URL
  BIO_CREDENTIAL: 'bio_credential',  // WebAuthn認証器ID
  BIO_VAULT_KEY: 'bio_vault_key',    // 生体認証用の暗号化マスターPW
};

// ─────────────────────────────────────────────────────────────────
// 1. IndexedDB 接続管理
// ─────────────────────────────────────────────────────────────────

/**
 * IndexedDB を開く（接続作成 or 再利用）
 * 
 * 処理:
 *  1. indexedDB.open() でデータベース接続
 *  2. バージョンアップ時は onupgradeneeded でスキーマ作成
 *  3. Promise で データベースハンドルを返す
 * 
 * @returns {Promise<IDBDatabase>} - オープンされたDBインスタンス
 * 
 * 実装詳細:
 *  - Promise ラッピング（async/await 対応）
 *  - バージョン 1: 初期スキーマ
 *  - keyPath なし（キーで直接アクセス）
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

    // スキーマ更新時の処理
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      // 既存のストアをクリア（上書き）
      if (db.objectStoreNames.contains(DB_CONFIG.store)) {
        db.deleteObjectStore(DB_CONFIG.store);
      }
      // 新しいストアを作成
      db.createObjectStore(DB_CONFIG.store);
    };

    // 成功時
    req.onsuccess = (event) => {
      resolve(event.target.result);
    };

    // エラー時
    req.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${req.error.name}`));
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 2. データ取得（GET）
// ─────────────────────────────────────────────────────────────────

/**
 * IndexedDB からデータを取得
 * 
 * @param {string} key - 取得対象のキー（STORAGE_KEYS 参照）
 * @returns {Promise<any>} - 保存されている値（undefined = 未存在）
 * 
 * 用途例:
 *  - const vault = await dbGet(STORAGE_KEYS.VAULT_BLOB);
 *  - const workerUrl = await dbGet(STORAGE_KEYS.WORKER_URL);
 */
async function dbGet(key) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.store, 'readonly');
    const store = tx.objectStore(DB_CONFIG.store);
    const req = store.get(key);

    req.onsuccess = () => {
      resolve(req.result);
    };

    req.onerror = () => {
      reject(new Error(`Failed to get ${key}: ${req.error.name}`));
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 3. データ保存（PUT）
// ─────────────────────────────────────────────────────────────────

/**
 * IndexedDB にデータを保存
 * 既存キーの場合は上書き、新規キーは作成
 * 
 * @param {string} key - 保存対象のキー（STORAGE_KEYS 参照）
 * @param {any} value - 保存する値（JSON化可能なオブジェクト）
 * @returns {Promise<void>}
 * 
 * 用途例:
 *  - await dbSet(STORAGE_KEYS.VAULT_BLOB, encryptedData);
 *  - await dbSet(STORAGE_KEYS.WORKER_URL, 'https://...');
 */
async function dbSet(key, val) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.store, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.store);

    // put: 既存キーなら上書き、なければ作成
    store.put(val, key);

    // トランザクション完了時に解決
    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(new Error(`Failed to set ${key}: ${tx.error.name}`));
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 4. データ削除（DELETE）
// ─────────────────────────────────────────────────────────────────

/**
 * IndexedDB からデータを削除
 * 
 * @param {string} key - 削除対象のキー（STORAGE_KEYS 参照）
 * @returns {Promise<void>}
 * 
 * 用途例:
 *  - await dbDel(STORAGE_KEYS.BIO_CREDENTIAL);（生体認証削除時）
 *  - await dbDel(STORAGE_KEYS.VAULT_BLOB);（リセット時）
 */
async function dbDel(key) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.store, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.store);

    store.delete(key);

    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(new Error(`Failed to delete ${key}: ${tx.error.name}`));
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 5. 一括削除（清空）
// ─────────────────────────────────────────────────────────────────

/**
 * オブジェクトストア全体をクリア
 * 
 * @returns {Promise<void>}
 * 
 * 用途:
 *  - confirmReset() でVault全削除時に使用
 */
async function dbClear() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.store, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.store);

    store.clear();

    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(new Error(`Failed to clear store: ${tx.error.name}`));
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 6. 全データ取得（バックアップ用）
// ─────────────────────────────────────────────────────────────────

/**
 * オブジェクトストア内の全データを取得
 * 
 * @returns {Promise<Object>} - { key: value, key: value, ... }
 * 
 * 用途:
 *  - エクスポート処理
 *  - デバッグ用途
 */
async function dbGetAll() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.store, 'readonly');
    const store = tx.objectStore(DB_CONFIG.store);
    const req = store.getAll();

    req.onsuccess = () => {
      const allKeys = store.getAllKeys();
      const result = {};
      
      // キーと値を対応させてオブジェクト化
      const keys = [];
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        const allData = req.result;
        for (let i = 0; i < allData.length; i++) {
          result[keysReq.result[i]] = allData[i];
        }
        resolve(result);
      };
    };

    req.onerror = () => {
      reject(new Error(`Failed to get all: ${req.error.name}`));
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 7. キー存在確認
// ─────────────────────────────────────────────────────────────────

/**
 * 指定キーがデータベースに存在するか確認
 * 
 * @param {string} key - 確認対象のキー
 * @returns {Promise<boolean>}
 * 
 * 用途:
 *  - Vault初期化時の存在確認
 *  - 生体認証の登録確認
 */
async function dbExists(key) {
  const value = await dbGet(key);
  return value !== undefined;
}

// ─────────────────────────────────────────────────────────────────
// 8. バッチ操作（複数保存）
// ─────────────────────────────────────────────────────────────────

/**
 * 複数のキー・バリューペアを一度に保存
 * 単一トランザクションで実行（原子性保証）
 * 
 * @param {Object} records - { key: value, key: value, ... }
 * @returns {Promise<void>}
 * 
 * 用途:
 *  - マスターPW変更後、複数キーの再暗号化
 */
async function dbSetBatch(records) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_CONFIG.store, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.store);

    for (const [key, value] of Object.entries(records)) {
      store.put(value, key);
    }

    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(new Error(`Batch set failed: ${tx.error.name}`));
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 9. LocalStorage 連携（設定値の軽量保存）
// ─────────────────────────────────────────────────────────────────

/**
 * LocalStorage へ設定値を保存
 * （暗号化不要な設定値用）
 * 
 * @param {string} key - LocalStorage キー
 * @param {string|Object} value - 保存する値
 */
function setSetting(key, value) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save setting ${key}:`, e);
  }
}

/**
 * LocalStorage から設定値を取得
 * 
 * @param {string} key - LocalStorage キー
 * @param {any} defaultValue - デフォルト値
 * @returns {any}
 */
function getSetting(key, defaultValue = null) {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return defaultValue;
    try {
      return JSON.parse(val);
    } catch {
      return val; // JSON パース失敗時は文字列として返す
    }
  } catch (e) {
    console.error(`Failed to read setting ${key}:`, e);
    return defaultValue;
  }
}

/**
 * LocalStorage から設定値を削除
 * 
 * @param {string} key
 */
function delSetting(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error(`Failed to delete setting ${key}:`, e);
  }
}

// ─────────────────────────────────────────────────────────────────
// 10. IndexedDB サポート確認
// ─────────────────────────────────────────────────────────────────

/**
 * ブラウザが IndexedDB をサポートしているか確認
 * 
 * @returns {boolean}
 */
function isIndexedDBSupported() {
  return typeof indexedDB !== 'undefined';
}

/**
 * ブラウザが LocalStorage をサポートしているか確認
 * 
 * @returns {boolean}
 */
function isLocalStorageSupported() {
  try {
    const test = '__test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

/**
 * 使用例:
 * 
 * // Vault 保存
 * await dbSet(STORAGE_KEYS.VAULT_BLOB, encryptedVault);
 * 
 * // Vault 取得
 * const encrypted = await dbGet(STORAGE_KEYS.VAULT_BLOB);
 * const vault = await decryptData(encrypted, masterPassword);
 * 
 * // Worker URL 設定
 * await dbSet(STORAGE_KEYS.WORKER_URL, 'https://vault-share.workers.dev');
 * const url = await dbGet(STORAGE_KEYS.WORKER_URL);
 * 
 * // リセット
 * await dbDel(STORAGE_KEYS.VAULT_BLOB);
 * await dbDel(STORAGE_KEYS.BIO_CREDENTIAL);
 * await dbDel(STORAGE_KEYS.BIO_VAULT_KEY);
 */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    openDB,
    dbGet,
    dbSet,
    dbDel,
    dbClear,
    dbGetAll,
    dbExists,
    dbSetBatch,
    setSetting,
    getSetting,
    delSetting,
    isIndexedDBSupported,
    isLocalStorageSupported,
    STORAGE_KEYS,
    DB_CONFIG,
  };
}

if (typeof window !== 'undefined') {
  window.VaultStorage = {
    openDB,
    dbGet,
    dbSet,
    dbDel,
    dbClear,
    dbGetAll,
    dbExists,
    dbSetBatch,
    setSetting,
    getSetting,
    delSetting,
    isIndexedDBSupported,
    isLocalStorageSupported,
    STORAGE_KEYS,
    DB_CONFIG,
  };
}
