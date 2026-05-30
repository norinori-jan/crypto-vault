/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT CORE — CRYPTOGRAPHY ENGINE
 * ═══════════════════════════════════════════════════════════════════
 * 
 * end-to-end 暗号化の中核ロジック
 * 全てのデータ暗号化・復号化・検証処理を担当
 * 
 * 仕様:
 *  - 暗号化: AES-256-GCM
 *  - 鍵導出: PBKDF2 (SHA-256, 200,000 反復)
 *  - salt: 16 bytes (128 bits)
 *  - IV: 12 bytes (96 bits)
 *  - キーサイズ: 256 bits
 *  - 認証タグ: GCM内部機能（自動）
 * 
 * 対象環境:
 *  - ブラウザ（Chrome, Safari, Firefox, Edge）
 *  - iPhone (iOS Safari)
 *  - Windows (PC browsers)
 *  - WebCrypto API 対応必須
 * ═══════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────
// 1. PBKDF2 鍵導出
// ─────────────────────────────────────────────────────────────────
/**
 * パスワード → 暗号化用の鍵を導出
 * 
 * @param {string} password - マスターパスワード（UTF-8）
 * @param {Uint8Array} salt - 16バイトのsalt（ランダム）
 * @returns {Promise<CryptoKey>} - AES-GCMで使用可能な256bitキー
 * 
 * アルゴリズム:
 *  - PBKDF2-SHA256
 *  - 200,000 反復（攻撃耐性）
 *  - 256-bit出力
 * 
 * 注意:
 *  - 毎回異なるsaltを使用すること（レインボーテーブル対策）
 *  - 反復回数は別紙「Performance」を参照
 */
async function deriveKey(password, salt) {
  // 1. パスワード文字列 → Uint8Array に変換
  const passwordBuffer = new TextEncoder().encode(password);
  
  // 2. WebCryptoでパスワードをインポート
  const passwordKey = await crypto.subtle.importKey(
    'raw',                      // 形式: 生の鍵データ
    passwordBuffer,             // 鍵バッファ
    'PBKDF2',                   // アルゴリズム名
    false,                      // extractable: 鍵の抽出不可（セキュア）
    ['deriveKey']               // 用途: 鍵導出のみ
  );
  
  // 3. PBKDF2で鍵を導出
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,               // 16バイトのランダムsalt
      iterations: 200000,       // 攻撃耐性: 200K反復（2024年推奨）
      hash: 'SHA-256'           // ハッシュ関数
    },
    passwordKey,                // ベースとなるパスワードキー
    {
      name: 'AES-GCM',          // 導出キーの使用先アルゴリズム
      length: 256               // 256-bitキー
    },
    false,                      // extractable: 抽出不可（メモリ保護）
    ['encrypt', 'decrypt']      // 用途: 暗号化と復号化
  );
  
  return derivedKey;
}

// ─────────────────────────────────────────────────────────────────
// 2. データ暗号化（マスターパスワード使用）
// ─────────────────────────────────────────────────────────────────
/**
 * JSON データを AES-256-GCM で暗号化
 * 
 * 処理の流れ:
 *  1. ランダムな salt を生成（16 bytes）
 *  2. ランダムな IV を生成（12 bytes）
 *  3. salt からマスターキーを導出
 *  4. データを JSON 文字列化
 *  5. AES-GCM で暗号化
 *  6. salt, IV, ciphertext を返す
 * 
 * @param {Object} data - 暗号化対象データ（任意のJSON値）
 * @param {string} password - マスターパスワード
 * @returns {Promise<Object>} - { salt: [16], iv: [12], ct: [n] }
 * 
 * 出力形式:
 *  {
 *    salt: [array of bytes],       // 16バイト
 *    iv: [array of bytes],         // 12バイト
 *    ct: [array of bytes]          // 暗号文（可変長）
 *  }
 * 
 * 用途:
 *  - Vault全体の暗号化（IndexedDB保存）
 *  - 共有リンク用のデータ暗号化
 *  - エクスポート時の暗号化
 */
async function encryptData(data, password) {
  // ① ランダムな salt を生成
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // ② ランダムな IV を生成
  //    IV（initialization vector）は毎回異なる値が必須（セキュリティ要件）
  //    12バイトは AES-GCM の標準サイズ
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // ③ salt からマスターキーを導出
  const key = await deriveKey(password, salt);
  
  // ④ データを JSON 文字列化
  const jsonString = JSON.stringify(data);
  const plaintext = new TextEncoder().encode(jsonString);
  
  // ⑤ AES-GCM で暗号化
  //    authenticate tag は GCM により自動生成（128-bit）
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv                    // 12バイトの IV
    },
    key,                        // 256-bit の暗号化キー
    plaintext                   // 平文データ
  );
  
  // ⑥ 結果を配列形式で返す（JSON化時に[...]形式になる）
  return {
    salt: Array.from(salt),                    // [0, 123, 45, ...]
    iv: Array.from(iv),                        // [0, 123, 45, ...]
    ct: Array.from(new Uint8Array(ciphertext)) // [0, 123, 45, ...]
  };
}

// ─────────────────────────────────────────────────────────────────
// 3. データ復号化（マスターパスワード使用）
// ─────────────────────────────────────────────────────────────────
/**
 * encryptData で作成されたデータを復号化
 * 
 * 処理の流れ:
 *  1. blob から salt, IV, ciphertext を抽出
 *  2. salt からマスターキーを導出（encryptData と同じプロセス）
 *  3. AES-GCM で復号化
 *  4. JSON 文字列をパース
 *  5. オブジェクトを返す
 * 
 * @param {Object} blob - { salt: [16], iv: [12], ct: [n] }
 * @param {string} password - マスターパスワード
 * @returns {Promise<Object|Array>} - 復号化されたデータ
 * 
 * エラーケース:
 *  - DOMException: 暗号化が失敗した場合（パスワード違い、データ破損）
 *  - SyntaxError: JSON パースに失敗した場合
 * 
 * 用途:
 *  - Vault の復号化（アンロック時）
 *  - 共有リンクの取得（受信側）
 *  - インポート時のファイル復号化
 */
async function decryptData(blob, password) {
  // ① blob から各要素を抽出
  const salt = new Uint8Array(blob.salt);
  const iv = new Uint8Array(blob.iv);
  const ciphertext = new Uint8Array(blob.ct);
  
  // ② salt からマスターキーを導出
  //    encryptData と同じsalt を使うことで、同じキーが得られる
  const key = await deriveKey(password, salt);
  
  // ③ AES-GCM で復号化
  //    認証タグの検証も自動実行（改ざん検出）
  //    パスワードが違うと DOMException がスロー
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv                    // 12バイトの IV
    },
    key,                        // 256-bit の復号化キー
    ciphertext                  // 暗号文
  );
  
  // ④ Uint8Array → 文字列 に変換
  const jsonString = new TextDecoder().decode(plaintext);
  
  // ⑤ JSON をパース
  //    SyntaxError が発生した場合は呼び出し側で処理
  const data = JSON.parse(jsonString);
  
  return data;
}

// ─────────────────────────────────────────────────────────────────
// 4. 生キーでのデータ暗号化（WebAuthn用）
// ─────────────────────────────────────────────────────────────────
/**
 * WebAuthn 認証器から導出した生キー（raw）で暗号化
 * 
 * 用途:
 *  - マスターパスワードをデバイスローカルに保存
 *  - デバイス固有のキーで保護（別デバイスからはアクセス不可）
 * 
 * @param {Object} data - 暗号化対象データ
 * @param {Uint8Array} rawKey - 生のキー（通常はSHA-256ハッシュ）
 * @returns {Promise<Object>} - { iv: [12], ct: [n] }（salt なし）
 * 
 * 出力形式:
 *  {
 *    iv: [array of 12 bytes],
 *    ct: [array of n bytes]
 *  }
 * 
 * 注意:
 *  - salt は不要（キーが既に一意だから）
 *  - rawKey は CryptoKey ではなく Uint8Array
 */
async function encryptWithRawKey(data, rawKey) {
  // ① ランダムな IV を生成
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // ② 生キーを WebCrypto にインポート
  const key = await crypto.subtle.importKey(
    'raw',                      // 形式: 生のキーバイト
    rawKey,                     // 256-bitの生キー
    { name: 'AES-GCM' },        // アルゴリズム
    false,                      // extractable: 抽出不可
    ['encrypt']                 // 用途: 暗号化のみ
  );
  
  // ③ データを JSON 文字列化
  const jsonString = JSON.stringify(data);
  const plaintext = new TextEncoder().encode(jsonString);
  
  // ④ AES-GCM で暗号化
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    plaintext
  );
  
  return {
    iv: Array.from(iv),
    ct: Array.from(new Uint8Array(ciphertext))
  };
}

// ─────────────────────────────────────────────────────────────────
// 5. 生キーでのデータ復号化（WebAuthn用）
// ─────────────────────────────────────────────────────────────────
/**
 * encryptWithRawKey で暗号化されたデータを復号化
 * 
 * @param {Object} blob - { iv: [12], ct: [n] }
 * @param {Uint8Array} rawKey - 生のキー（encryptWithRawKey と同じ値）
 * @returns {Promise<Object>} - 復号化されたデータ
 */
async function decryptWithRawKey(blob, rawKey) {
  // ① blob から各要素を抽出
  const iv = new Uint8Array(blob.iv);
  const ciphertext = new Uint8Array(blob.ct);
  
  // ② 生キーを WebCrypto にインポート
  const key = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']                 // 用途: 復号化のみ
  );
  
  // ③ AES-GCM で復号化
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    ciphertext
  );
  
  // ④ JSON をパース
  const jsonString = new TextDecoder().decode(plaintext);
  return JSON.parse(jsonString);
}

// ─────────────────────────────────────────────────────────────────
// 6. SHA-1 ハッシュ（HIBP用）
// ─────────────────────────────────────────────────────────────────
/**
 * パスワードの SHA-1 ハッシュを計算
 * 
 * 用途:
 *  - Have I Been Pwned (HIBP) API との通信
 *  - k-Anonymity: 先頭5文字のハッシュのみを送信
 * 
 * セキュリティ:
 *  - SHA-1 そのものは破られているが、k-Anonymity方式で防御
 *  - 実際のパスワードはネットに出ない
 *  - 最初の5文字だけ送信し、残りはクライアント側でマッチング
 * 
 * @param {string} password - 対象パスワード
 * @returns {Promise<string>} - 40文字の大文字HEXハッシュ値
 * 
 * 例:
 *  sha1('password123')
 *    → '482C811DA5D5B4BC6D497FFA98491E38'
 */
async function sha1(str) {
  // ① 文字列をバイト列に変換
  const buffer = new TextEncoder().encode(str);
  
  // ② SHA-1 ハッシュを計算
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  
  // ③ バイト列を16進数文字列に変換
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  
  return hashHex;
}

// ─────────────────────────────────────────────────────────────────
// 7. パスワード漏洩チェック（HIBP k-Anonymity方式）
// ─────────────────────────────────────────────────────────────────
/**
 * Have I Been Pwned API を使用してパスワード漏洩をチェック
 * 
 * プロトコル（k-Anonymity）:
 *  1. SHA-1(password) を計算
 *  2. 先頭5文字のみを HIBP API に送信
 *  3. API から該当する全ハッシュのサフィックスリストを取得
 *  4. ローカルでサフィックスをマッチング
 *  → 実パスワードは送信されない（セキュア）
 * 
 * @param {string} password - チェック対象パスワード
 * @returns {Promise<number>} - 漏洩件数（0=安全, >0=要注意）
 * 
 * 例:
 *  checkPasswordBreach('password')
 *    → 3706
 *  checkPasswordBreach('uniqueRandomPassword123#')
 *    → 0（安全）
 */
async function checkPasswordBreach(password) {
  // ① SHA-1 ハッシュを計算
  const hash = await sha1(password);
  
  // ② 先頭5文字と残り35文字に分割
  const prefix = hash.slice(0, 5);      // 最初の5文字のプレフィックス
  const suffix = hash.slice(5);         // 残りのサフィックス
  
  // ③ HIBP API に問い合わせ
  //    Add-Padding: ダミーレスポンスを混ぜてプライバシー保護
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true' }
  });
  
  if (!res.ok) {
    throw new Error(`HIBP API error: ${res.status}`);
  }
  
  // ④ レスポンスをテキストで取得
  //    形式: SUFFIX:COUNT（改行区切り）
  //    例:
  //      003D086D9D20D573D1A6E20FE52EEBEE15:2
  //      00D4F6E8FA6EECAD2A3AA415EEC418D38:1
  const text = await res.text();
  
  // ⑤ ローカルでサフィックスをマッチング
  for (const line of text.split('\n')) {
    const [hashSuffix, count] = line.split(':');
    if (hashSuffix.trim() === suffix) {
      // マッチした → 漏洩件数を返す
      return parseInt(count.trim());
    }
  }
  
  // ⑥ マッチしなかった → 安全
  return 0;
}

// ─────────────────────────────────────────────────────────────────
// 8. ランダムID生成
// ─────────────────────────────────────────────────────────────────
/**
 * エントリの一意なIDを生成
 * 
 * 構成:
 *  - Date.now().toString(36): タイムスタンプベース
 *  - Math.random().toString(36): ランダム値
 * 
 * @returns {string} - 短い一意ID（例: '123abc456def'）
 */
function generateId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return timestamp + random;
}

// ─────────────────────────────────────────────────────────────────
// 9. 128-bit ランダムキー生成（Worker共有用など）
// ─────────────────────────────────────────────────────────────────
/**
 * Worker共有IDなどの生成
 * 
 * @param {number} byteLength - 生成するバイト数（デフォルト16）
 * @returns {string} - HEXエンコードされた文字列
 * 
 * 例:
 *  generateRandomId(16)
 *    → 'a3f2c1b8e4d6f9a2c5b7e9d1f3a5c7b9'
 */
function generateRandomId(byteLength = 16) {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

/**
 * ブラウザ環境での使用例:
 * 
 * // 暗号化
 * const vault = [
 *   { name: 'Google', user: 'user@gmail.com', pw: 'secretpass123' }
 * ];
 * const encrypted = await encryptData(vault, 'masterPassword');
 * // → { salt: [...], iv: [...], ct: [...] }
 * 
 * // 復号化
 * const decrypted = await decryptData(encrypted, 'masterPassword');
 * // → [{ name: 'Google', user: 'user@gmail.com', pw: 'secretpass123' }]
 * 
 * // 漏洩チェック
 * const count = await checkPasswordBreach('password123');
 * console.log(count); // → 3706（警告）
 */

// ノード環境での使用も想定
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    deriveKey,
    encryptData,
    decryptData,
    encryptWithRawKey,
    decryptWithRawKey,
    sha1,
    checkPasswordBreach,
    generateId,
    generateRandomId
  };
}

// ブラウザグローバルオブジェクトにもアタッチ
if (typeof window !== 'undefined') {
  window.VaultCrypto = {
    deriveKey,
    encryptData,
    decryptData,
    encryptWithRawKey,
    decryptWithRawKey,
    sha1,
    checkPasswordBreach,
    generateId,
    generateRandomId
  };
}
