# VAULT CORE API SPECIFICATION

## 概要

VAULT は end-to-end 暗号化されたパスワードマネージャーです。全データはクライアント側で AES-256-GCM で暗号化され、サーバー（Cloudflare Workers）には暗号化済みデータのみが保存されます。

---

## 暗号化 API リファレンス

### 1. `deriveKey(password, salt)`

**説明**: PBKDF2-SHA256 でマスターパスワードから暗号化キーを導出

**パラメータ**:
- `password` (string): マスターパスワード（4文字以上推奨）
- `salt` (Uint8Array): 16バイトのランダムsalt

**戻り値**: `Promise<CryptoKey>` - AES-256-GCM で使用可能な鍵

**アルゴリズム**:
- PBKDF2-SHA256
- 200,000 反復（2024年推奨値）
- 出力: 256-bit キー

**例**:
```javascript
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await VaultCrypto.deriveKey('myMasterPassword', salt);
```

---

### 2. `encryptData(data, password)`

**説明**: JSON データを AES-256-GCM で暗号化（salt + IV 自動生成）

**パラメータ**:
- `data` (Object|Array): 暗号化対象データ（JSON化可能）
- `password` (string): マスターパスワード

**戻り値**: `Promise<Object>`
```javascript
{
  salt: [16 bytes],    // ランダムに生成
  iv: [12 bytes],      // ランダムに生成
  ct: [n bytes]        // 暗号文
}
```

**処理の詳細**:
1. ランダムな salt (16 bytes) を生成
2. ランダムな IV (12 bytes) を生成
3. salt からマスターキーを導出（deriveKey）
4. データを JSON 文字列化
5. AES-256-GCM で暗号化
6. 認証タグは GCM により自動生成（改ざん検出機能）

**用途**:
- Vault 全体を IndexedDB に保存
- 共有リンク用エントリの暗号化

**例**:
```javascript
const vault = [
  { name: 'Google', user: 'user@gmail.com', pw: 'password123', url: 'https://google.com' }
];
const encrypted = await VaultCrypto.encryptData(vault, 'masterPassword');
// → { salt: [...], iv: [...], ct: [...] }

// IndexedDB に保存
await VaultStorage.dbSet('vault_blob', encrypted);
```

---

### 3. `decryptData(blob, password)`

**説明**: `encryptData` で生成されたデータを復号化

**パラメータ**:
- `blob` (Object): `{ salt, iv, ct }`（encryptData の戻り値）
- `password` (string): マスターパスワード

**戻り値**: `Promise<Object|Array>` - 復号化されたデータ

**処理の詳細**:
1. blob から salt, IV, ciphertext を抽出
2. salt から同じマスターキーを導出（毎回同じsalt で同じキーが得られる）
3. AES-GCM で復号化（認証タグも検証）
4. JSON 文字列をパース

**エラーハンドリング**:
- `DOMException`: パスワードが違う or データ破損
- `SyntaxError`: JSON パース失敗

**用途**:
- Vault アンロック時の復号化
- 共有リンク受信時の復号化

**例**:
```javascript
const encrypted = await VaultStorage.dbGet('vault_blob');
try {
  const vault = await VaultCrypto.decryptData(encrypted, 'masterPassword');
  console.log(vault); // [{ name: 'Google', ... }]
} catch (e) {
  console.error('Wrong password or corrupted data:', e);
}
```

---

### 4. `encryptWithRawKey(data, rawKey)`

**説明**: 生キー（Uint8Array）で AES-256-GCM 暗号化（WebAuthn用）

**パラメータ**:
- `data` (Object|Array): 暗号化対象データ
- `rawKey` (Uint8Array): 256-bit の生キー（通常は SHA-256 ハッシュ）

**戻り値**: `Promise<Object>`
```javascript
{
  iv: [12 bytes],      // ランダムに生成
  ct: [n bytes]        // 暗号文
}
```

**特徴**:
- salt は不要（キーが既に一意）
- WebAuthn credential ID から導出した生キーで暗号化

**用途**:
- マスターパスワードをデバイスローカルに保存（生体認証用）

**例**:
```javascript
// WebAuthn credential から SHA-256 ハッシュを生成
const rawKey = await crypto.subtle.digest('SHA-256', credential.rawId);

// マスターパスワードを暗号化
const encPw = await VaultCrypto.encryptWithRawKey(
  { masterPw: 'myMasterPassword' },
  rawKey
);

// IndexedDB に保存
await VaultStorage.dbSet('bio_vault_key', encPw);
```

---

### 5. `decryptWithRawKey(blob, rawKey)`

**説明**: `encryptWithRawKey` で生成されたデータを復号化

**パラメータ**:
- `blob` (Object): `{ iv, ct }`
- `rawKey` (Uint8Array): 同じ生キー

**戻り値**: `Promise<Object>` - 復号化されたデータ

**例**:
```javascript
// WebAuthn で認証実行
const assertion = await navigator.credentials.get({ publicKey: {...} });

// 同じ方法で生キーを導出
const rawKey = await crypto.subtle.digest('SHA-256', assertion.rawId);

// マスターパスワードを復号化
const encPw = await VaultStorage.dbGet('bio_vault_key');
const { masterPw } = await VaultCrypto.decryptWithRawKey(encPw, rawKey);
```

---

### 6. `checkPasswordBreach(password)`

**説明**: Have I Been Pwned (HIBP) API を使用してパスワード漏洩をチェック

**パラメータ**:
- `password` (string): チェック対象パスワード

**戻り値**: `Promise<number>` - 漏洩件数（0 = 安全）

**プロトコル**（k-Anonymity方式）:
1. SHA-1 ハッシュを計算
2. **先頭5文字のみ** を HIBP API に送信
3. API から該当するハッシュサフィックスのリストを取得
4. ローカルでサフィックスをマッチング
5. 実パスワードはネットに出ない ✅

**用途**:
- パスワード漏洩チェック

**例**:
```javascript
const count = await VaultCrypto.checkPasswordBreach('password123');
if (count > 0) {
  console.log(`⚠ ${count}件のデータ侵害で検出`);
} else {
  console.log('✓ 安全');
}
```

---

## ストレージ API

### `dbSet(key, value)`
データを IndexedDB に保存

### `dbGet(key)`
IndexedDB からデータを取得

### `dbDel(key)`
IndexedDB からデータを削除

---

## セキュリティ仕様

| 項目 | 仕様 | 理由 |
|------|------|------|
| 暗号化 | AES-256-GCM | NIST推奨、認証タグ自動 |
| 鍵導出 | PBKDF2-SHA256, 200K反復 | パスワード攻撃耐性 |
| Salt | 16 bytes ランダム | レインボーテーブル対策 |
| IV | 12 bytes ランダム | リプレイアタック対策 |
| 保存場所 | IndexedDB（ブラウザ） | デバイス内のみ |
| 生体認証 | WebAuthn (FIDO2) | パスワード不要 |
| 共有 | end-to-end暗号化 | サーバーは復号不可 |

---

## 環境対応

| 環境 | 対応状況 |
|-----|--------|
| Chrome / Edge | ✅ 完全対応 |
| Firefox | ✅ 完全対応 |
| Safari | ✅ 完全対応 |
| iPhone Safari | ✅ 完全対応 |
| Android Chrome | ✅ 完全対応 |

---

## エラーハンドリング

```javascript
try {
  const vault = await VaultCrypto.decryptData(blob, password);
} catch (e) {
  if (e.name === 'DOMException') {
    // パスワード違い or データ破損
    console.error('Decryption failed:', e.message);
  } else if (e instanceof SyntaxError) {
    // JSON パース失敗
    console.error('Invalid data format:', e);
  }
}
```
