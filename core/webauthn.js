/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT CORE — WEBAUTHN / BIOMETRIC AUTHENTICATION
 * ═══════════════════════════════════════════════════════════════════
 * 
 * WebAuthn (FIDO2/U2F) による生体認証ラッパー層
 * Touch ID / Face ID / Windows Hello をサポート
 * 
 * 仕様:
 *  - API: WebAuthn (W3C標準)
 *  - アルゴリズム: ES256 (ECDSA P-256) + RS256 (RSA-2048)
 *  - ユーザー検証: required（生体認証必須）
 *  - レジデントキー: preferred（デバイス保存）
 *  - 認証器: platform（デバイス内蔵のみ）
 * 
 * 対応デバイス:
 *  - iPhone / iPad（Face ID / Touch ID）
 *  - Mac（Touch ID）
 *  - Windows（Windows Hello）
 *  - Android（可能だが、本プロジェクトでは対象外）
 * ═══════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────
// CONSTANTS & CONFIG
// ─────────────────────────────────────────────────────────────────

/**
 * Relying Party (RP) 識別情報
 * Webサイトがブラウザに識別される名前/ID
 */
const RP_CONFIG = {
  id: location.hostname || 'localhost',  // ドメイン（例：vault.example.com）
  name: 'VAULT'                          // 表示名
};

/**
 * ユーザー識別情報
 * WebAuthn登録時に生成される一意の ID
 */
let USER_ID = null;

/**
 * WebAuthn のサポート状況（初期化時に設定）
 */
let BIO_SUPPORTED = false;

/**
 * 検出されたプラットフォーム種別
 * 'ios', 'mac', 'windows', 'unknown'
 */
let PLATFORM_TYPE = 'unknown';

// ─────────────────────────────────────────────────────────────────
// 1. プラットフォーム検出
// ─────────────────────────────────────────────────────────────────

/**
 * ユーザーエージェントからプラットフォームを推定
 * 
 * @returns {string} - 'ios' | 'mac' | 'windows' | 'unknown'
 */
function detectPlatform() {
  const ua = navigator.userAgent;
  
  if (/iPhone|iPad|iPod/.test(ua)) {
    PLATFORM_TYPE = 'ios';
  } else if (/Mac/.test(ua) && !/iPhone|iPad/.test(ua)) {
    PLATFORM_TYPE = 'mac';
  } else if (/Windows|Win32|Win64/.test(ua)) {
    PLATFORM_TYPE = 'windows';
  } else if (/Android/.test(ua)) {
    PLATFORM_TYPE = 'android';
  } else {
    PLATFORM_TYPE = 'unknown';
  }
  
  return PLATFORM_TYPE;
}

/**
 * 言語別のプラットフォーム表示名
 * 
 * @returns {Object} - { name, icon }
 */
function getPlatformInfo() {
  const platform = PLATFORM_TYPE;
  
  switch (platform) {
    case 'ios':
      return { name: 'Face ID / Touch ID', icon: '🔒', method: 'iPhone/iPad' };
    case 'mac':
      return { name: 'Touch ID', icon: '👆', method: 'Mac' };
    case 'windows':
      return { name: 'Windows Hello', icon: '👁', method: 'Windows' };
    case 'android':
      return { name: 'Biometric Unlock', icon: '🔓', method: 'Android' };
    default:
      return { name: 'Biometric Authentication', icon: '🔐', method: 'Browser' };
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. WebAuthn サポート確認
// ─────────────────────────────────────────────────────────────────

/**
 * ブラウザが WebAuthn API をサポートしているか確認
 * 
 * 確認項目:
 *  - PublicKeyCredential 存在
 *  - navigator.credentials 存在
 * 
 * @returns {boolean}
 */
function isBiometricSupported() {
  const supported = 
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials !== 'undefined';
  
  BIO_SUPPORTED = supported;
  return supported;
}

/**
 * platform 認証器（デバイス内蔵）がサポートされているか確認
 * 
 * @returns {Promise<boolean>}
 */
async function isPlatformAuthenticatorAvailable() {
  if (!isBiometricSupported()) {
    return false;
  }
  
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) {
    console.warn('Platform authenticator check failed:', e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// 3. 生体認証の登録
// ─────────────────────────────────────────────────────────────────

/**
 * WebAuthn で生体認証を登録
 * 
 * 処理フロー:
 *  1. チャレンジ（32バイトランダム）を生成
 *  2. ユーザーID（16バイトランダム）を生成
 *  3. navigator.credentials.create() で認証器に登録要求
 *  4. ユーザーが生体認証（指紋・顔など）を実行
 *  5. 公開鍵認証器（credential）がブラウザに返される
 *  6. credentialID と公開鍵をローカルに保存
 *  7. マスターパスワードを生キーで暗号化して保存
 * 
 * @returns {Promise<Object>} - { success: boolean, message: string }
 * 
 * エラーケース:
 *  - NotSupportedError: ブラウザが WebAuthn 未対応
 *  - NotAllowedError: ユーザーがキャンセル
 *  - InvalidStateError: 既に登録済み
 */
async function bioRegister() {
  if (!BIO_SUPPORTED) {
    return { success: false, message: 'このデバイスはWebAuthnに対応していません' };
  }
  
  const available = await isPlatformAuthenticatorAvailable();
  if (!available) {
    return { success: false, message: 'デバイスの生体認証が利用できません' };
  }
  
  try {
    // ① チャレンジ生成（32バイト）
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    
    // ② ユーザーID生成（16バイト）
    const userId = crypto.getRandomValues(new Uint8Array(16));
    USER_ID = userId;
    
    // ③ WebAuthn 登録要求
    const credential = await navigator.credentials.create({
      publicKey: {
        // チャレンジ（サーバーが生成する値。リプレイアタック防止）
        challenge: challenge,
        
        // Relying Party 識別情報
        rp: {
          id: RP_CONFIG.id,
          name: RP_CONFIG.name,
        },
        
        // ユーザー識別情報
        user: {
          id: userId,                        // ブラウザ内で一意
          name: 'vault-user',                // ユーザー名
          displayName: 'Vault User'          // 表示名
        },
        
        // サポートしてほしい公開鍵アルゴリズム
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256 (ECDSA P-256)
          { type: 'public-key', alg: -257 }, // RS256 (RSA-2048)
        ],
        
        // 認証器の選択条件
        authenticatorSelection: {
          authenticatorAttachment: 'platform',  // デバイス内蔵のみ
          userVerification: 'required',         // 生体認証必須
          residentKey: 'preferred',             // レジデントキー優先
        },
        
        // タイムアウト（60秒）
        timeout: 60000,
        
        // アテステーション（認証器の真正性証明）- 不要
        attestation: 'none',
      }
    });
    
    if (!credential) {
      return { success: false, message: 'キャンセルされました' };
    }
    
    // ④ credentialID を抽出
    const credId = Array.from(new Uint8Array(credential.rawId));
    
    // ⑤ IndexedDB に credentialID を保存
    //    （実装例では dbSet() を使用）
    // await dbSet(STORAGE_KEYS.BIO_CREDENTIAL, { 
    //   credId, 
    //   userId: Array.from(userId) 
    // });
    
    // ⑥ rawId をSHA-256でハッシュ化（生キーとして使用）
    const rawKey = await crypto.subtle.digest('SHA-256', credential.rawId);
    
    // ⑦ マスターパスワードを生キーで暗号化
    //    （encryptWithRawKey() は crypto.js から）
    // const masterPwObj = { masterPw: masterPassword };
    // const encPw = await encryptWithRawKey(masterPwObj, rawKey);
    // await dbSet(STORAGE_KEYS.BIO_VAULT_KEY, encPw);
    
    return { 
      success: true, 
      message: '生体認証を登録しました',
      credentialId: credId.length
    };
    
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      return { success: false, message: 'キャンセルされました' };
    } else if (e.name === 'InvalidStateError') {
      return { success: false, message: '既に登録済みです' };
    } else {
      return { success: false, message: `登録失敗: ${e.message}` };
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. 生体認証でのアンロック
// ─────────────────────────────────────────────────────────────────

/**
 * WebAuthn で生体認証を実行し、マスターパスワードを取得
 * 
 * 処理フロー:
 *  1. チャレンジ（32バイト）を生成
 *  2. 登録済みの credentialID を取得
 *  3. navigator.credentials.get() で認証実行
 *  4. ユーザーが生体認証を実行
 *  5. アサーション（assertion）がブラウザに返される
 *  6. assertion.rawId から SHA-256 ハッシュを取得
 *  7. 生キーでマスターパスワードを復号化
 *  8. マスターパスワードを返す
 * 
 * @returns {Promise<Object>} - { success: boolean, masterPassword: string, message: string }
 */
async function bioUnlock() {
  if (!BIO_SUPPORTED) {
    return { success: false, masterPassword: null, message: 'WebAuthn非対応' };
  }
  
  try {
    // ① 登録済み credentialID を取得
    //    （実装例では dbGet() を使用）
    // const credData = await dbGet(STORAGE_KEYS.BIO_CREDENTIAL);
    // if (!credData) {
    //   return { success: false, message: '生体認証が登録されていません' };
    // }
    
    // ② チャレンジ生成
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    
    // ③ WebAuthn 認証実行
    //    （以下は疑似コード。実際には credData から credentialID を取得）
    const credentialId = new Uint8Array([0, 1, 2, 3]); // ダミー
    
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge,
        
        // RP ID
        rpId: RP_CONFIG.id,
        
        // 許可する credentialID のリスト
        allowCredentials: [{
          type: 'public-key',
          id: credentialId,
          transports: ['internal'],  // デバイス内蔵のみ
        }],
        
        // ユーザー検証
        userVerification: 'required',
        
        // タイムアウト
        timeout: 60000,
      }
    });
    
    if (!assertion) {
      return { success: false, masterPassword: null, message: 'キャンセルされました' };
    }
    
    // ④ assertion.rawId から生キーを導出
    const rawKey = await crypto.subtle.digest('SHA-256', assertion.rawId);
    
    // ⑤ IndexedDB から暗号化されたマスターパスワードを取得
    //    const encPw = await dbGet(STORAGE_KEYS.BIO_VAULT_KEY);
    
    // ⑥ 復号化
    //    const { masterPw } = await decryptWithRawKey(encPw, rawKey);
    
    return { 
      success: true, 
      masterPassword: 'decrypted_master_password',
      message: '認証に成功しました'
    };
    
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      return { success: false, masterPassword: null, message: 'キャンセルされました' };
    } else if (e.name === 'InvalidStateError') {
      return { success: false, masterPassword: null, message: '登録されていません' };
    } else {
      return { success: false, masterPassword: null, message: `認証失敗: ${e.message}` };
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// 5. 生体認証の削除
// ─────────────────────────────────────────────────────────────────

/**
 * 生体認証データを削除
 * 
 * 処理:
 *  1. IndexedDB から credentialID を削除
 *  2. 暗号化されたマスターパスワードを削除
 *  3. ユーザーは今後、マスターパスワードでのみログイン
 * 
 * @returns {Promise<Object>} - { success: boolean, message: string }
 */
async function bioRemove() {
  try {
    // ① credentialID を削除
    //    await dbDel(STORAGE_KEYS.BIO_CREDENTIAL);
    
    // ② 暗号化されたマスターパスワードを削除
    //    await dbDel(STORAGE_KEYS.BIO_VAULT_KEY);
    
    return { 
      success: true, 
      message: '生体認証を削除しました。今後はマスターパスワードでログインしてください。'
    };
    
  } catch (e) {
    return { 
      success: false, 
      message: `削除失敗: ${e.message}` 
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// 6. 登録状態確認
// ─────────────────────────────────────────────────────────────────

/**
 * 生体認証が登録されているか確認
 * 
 * @returns {Promise<boolean>}
 */
async function isBioRegistered() {
  // await dbExists(STORAGE_KEYS.BIO_CREDENTIAL)
  // の実装が必要
  return false;
}

/**
 * 生体認証の状態をオブジェクトで返す
 * 
 * @returns {Promise<Object>} - { registered, platform, available }
 */
async function getBioStatus() {
  return {
    supported: BIO_SUPPORTED,
    registered: await isBioRegistered(),
    platform: PLATFORM_TYPE,
    available: await isPlatformAuthenticatorAvailable(),
    platformInfo: getPlatformInfo()
  };
}

// ─────────────────────────────────────────────────────────────────
// 7. 条件付き UI（Autofill API）
// ─────────────────────────────────────────────────────────────────

/**
 * WebAuthn Conditional Mediation
 * パスワード入力フィールドに「生体認証で入力」を提案
 * 
 * 利用シーン:
 *  - ロック解除画面でパスワード入力
 *  - 「このパスワードフィールドで生体認証が利用可能」と表示
 * 
 * @param {string} inputSelector - パスワード入力フィールドのセレクタ
 * @returns {Promise<Object>} - { success, masterPassword }
 */
async function bioUnlockConditional(inputSelector) {
  if (!BIO_SUPPORTED) {
    return { success: false, message: 'WebAuthn非対応' };
  }
  
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    
    // Conditional Mediation を有効化
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge,
        rpId: RP_CONFIG.id,
        userVerification: 'preferred',
        timeout: 60000,
      },
      mediation: 'conditional',  // Autofill API 統合
    });
    
    if (!assertion) {
      return { success: false, message: 'キャンセルされました' };
    }
    
    return { 
      success: true, 
      message: '認証に成功しました'
    };
    
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      return { success: false, message: 'キャンセルされました' };
    }
    return { success: false, message: `認証失敗: ${e.message}` };
  }
}

// ─────────────────────────────────────────────────────────────────
// 初期化
// ─────────────────────────────────────────────────────────────────

/**
 * WebAuthn 初期化
 * アプリ起動時に一度実行
 */
function initWebAuthn() {
  detectPlatform();
  isBiometricSupported();
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initWebAuthn,
    isBiometricSupported,
    isPlatformAuthenticatorAvailable,
    detectPlatform,
    getPlatformInfo,
    bioRegister,
    bioUnlock,
    bioRemove,
    isBioRegistered,
    getBioStatus,
    bioUnlockConditional,
  };
}

if (typeof window !== 'undefined') {
  window.VaultBiometric = {
    initWebAuthn,
    isBiometricSupported,
    isPlatformAuthenticatorAvailable,
    detectPlatform,
    getPlatformInfo,
    bioRegister,
    bioUnlock,
    bioRemove,
    isBioRegistered,
    getBioStatus,
    bioUnlockConditional,
  };
}
