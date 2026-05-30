# マルチデバイス認証アーキテクチャ

## 概要

このドキュメントは、**iPhone + PC + 家族1名のみアクセス可能** な VAULT のセキュアな共有・認証設計を説明します。

---

## 要件

### 機能要件
1. **iPhone と PC の両方から Vault にアクセス**可能
2. **nori（私）** がマスターアカウント（Vault のオーナー）
3. **家族1名** が限定アクセス（読み取り + 共有のみ）
4. **他の家族・第三者** は完全にブロック
5. **デバイス紛失時** でも安全（デバイスロック必須）

### セキュリティ要件
- end-to-end 暗号化（サーバーは復号不可）
- マスターパスワード + 生体認証（二要素）
- デバイスバインディング（別デバイスではアクセス不可）
- 自動ロック機能
- デバイス登録・撤回機能

---

## アーキテクチャ

### 層構造

```
┌─────────────────────────────────────────────────────┐
│                  VAULT 3層設計                      │
├─────────────────────────────────────────────────────┤
│  UI層                                               │
│  ├─ UnlockScreen (マスターPW + 生体認証)           │
│  ├─ VaultList (エントリ表示)                       │
│  ├─ DetailModal (詳細・コピー・編集)               │
│  └─ ShareModal (共有リンク生成)                     │
├─────────────────────────────────────────────────────┤
│  Integration層 (VaultApp)                           │
│  ├─ 状態管理                                        │
│  ├─ イベント処理                                    │
│  ├─ Device Registry との連携                        │
│  └─ Access Control 適用                             │
├─────────────────────────────────────────────────────┤
│  Core層 (暗号化 + ストレージ)                       │
│  ├─ crypto.js (AES-256-GCM)                        │
│  ├─ storage.js (IndexedDB)                         │
│  ├─ webauthn.js (生体認証)                         │
│  └─ device-registry.js ← 新規（デバイス管理）      │
├─────────────────────────────────────────────────────┤
│  Server (Cloudflare Workers + KV)                   │
│  ├─ 暗号化データ保存                               │
│  ├─ デバイス登録管理                                │
│  ├─ アクセス制御ログ                                │
│  └─ TTL管理                                         │
└─────────────────────────────────────────────────────┘
```

---

## マルチデバイス認証フロー

### 初期セットアップ（PC）

```
1. index.html をブラウザで開く
   ↓
2. マスターパスワードを設定
   ↓
3. 生体認証を登録（Windows Hello）
   ↓
4. Device ID を自動生成 & 登録
   ├─ Device ID = UUID (Device Registry に保存)
   ├─ Device Name = "Windows PC (nori)"
   ├─ Device Type = "windows"
   ├─ Master Key を生成 & 暗号化
   └─ Vault Encryption Key を設定
   ↓
5. Master Credential を生成（共有用）
```

### デバイス共有（iPhone への追加）

```
送信側 (PC):
1. 設定タブ → "デバイス共有"
2. "iPhone を追加" をクリック
3. 共有パスコード（8桁）を生成・表示
   例: 1234-5678

受信側 (iPhone):
1. VAULT を開く → "デバイスに参加"
2. 共有パスコードを入力
3. 以下のデータを受け取る:
   ├─ Master Encryption Key (暗号化済み)
   ├─ Vault 全体のコピー（暗号化済み）
   └─ Device Registry Entry
4. デバイスID を生成・登録
5. Face ID / Touch ID を登録
6. ✓ 完了
```

### アクセス制御フロー（家族1名を追加）

```
オーナー (nori):
1. 設定 → "アクセス管理"
2. "メンバーを招待"
3. 制限を選択:
   - ロール: "Viewer" (読み取りのみ)
   - 期限: 90日間
   - 許可操作: パスワード表示, 共有リンク生成, パスワード確認
   - 禁止操作: 追加・編集・削除, デバイス管理
4. 共有リンク生成 & 送信
   https://vault.com/invite?token=abc123...

ゲスト (家族):
1. リンクを開く
2. マスターパスワード入力（オーナー側で指定）
3. デバイス登録
4. ✓ 読み取り専用アクセス可能
```

---

## 認証方式の詳細

### 方式1: マスターパスワード（基本）

```
入力: マスターパスワード
↓
PBKDF2-SHA256 導出 (200,000反復)
↓
AES-256-GCM で Vault 復号化
↓
Vault データ表示

セキュリティ: ★★★★☆ (オフライン攻撃に強い)
利便性:      ★★☆☆☆ (毎回入力が必要)
```

### 方式2: 生体認証（デバイス固有）

```
入力: 指紋 / 顔認証
↓
WebAuthn credential 取得
↓
SHA-256(credential ID) → 生キー導出
↓
生キーでマスターパスワード復号化
↓
PBKDF2 で Vault 復号化
↓
Vault データ表示

セキュリティ: ★★★★★ (デバイス内蔵認証器の耐改ざん性)
利便性:      ★★★★★ (指紋・顔でワンタップ)
対応デバイス: iOS, macOS, Windows
```

### 方式3: デバイスバインディング（複数デバイス）

```
PC で登録時:
1. Device ID (UUID) 生成
2. Master Encryption Key を生成
3. Device Challenge (ランダム32バイト) を生成
4. Workers に登録

iPhone で参加時:
1. 共有パスコード入力
2. PC から Master Encryption Key を受け取る
3. 独自の Device ID を生成
4. Device Registry に登録
5. 異なるDevice ID で Vault にアクセス可能

特徴:
- 複数デバイス間での鍵共有
- デバイスごとに異なる生体認証登録
- デバイス紛失時に該当デバイスのみ無効化可能
```

---

## Device Registry（デバイス管理システム）

### ローカル（IndexedDB）

```javascript
{
  deviceId: "uuid-1234-5678",           // デバイス一意ID
  deviceName: "Windows PC (nori)",      // 表示名
  deviceType: "windows" | "ios" | "mac",
  createdAt: "2026-05-30T10:00:00Z",
  lastActivity: "2026-05-30T14:30:00Z",
  
  // 鍵管理
  masterKeyEncrypted: { salt, iv, ct },  // マスターキー（暗号化）
  masterKeyAlgo: "PBKDF2-SHA256",
  
  // 生体認証
  bioCredential: { credId, userId },
  bioVaultKey: { iv, ct },
  
  // デバイス証明
  deviceChallenge: [32 bytes],
  deviceSignature: "base64-signature"
}
```

### サーバー側（Cloudflare Workers KV）

```javascript
// key: vault:devices:{userId}
{
  devices: [
    {
      deviceId: "uuid-1234-5678",
      deviceName: "Windows PC (nori)",
      status: "active" | "inactive" | "revoked",
      publicKey: "base64-public-key",  // デバイス証明用
      permissions: {
        read: true,
        write: false,  // オーナーのみ
        share: true,
        manageDevices: false  // オーナーのみ
      },
      role: "owner" | "editor" | "viewer",
      expiresAt: "2027-05-30T10:00:00Z" | null,
      registeredAt: "2026-05-30T10:00:00Z",
      lastActivity: "2026-05-30T14:30:00Z"
    }
  ],
  
  // グローバル設定
  masterUserId: "nori@example.com",
  encryptionVersion: 3,
  backupEncrypted: { salt, iv, ct }  // バックアップ
}
```

---

## アクセス制御（RBAC）

### ロール定義

| ロール | 読み取り | パスワード表示 | 共有生成 | 追加・編集・削除 | デバイス管理 | ロール変更 |
|--------|---------|------------|---------|-------------|----------|---------|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| editor | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| viewer | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| guest | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 実装例（VaultApp で）

```javascript
canViewPassword(role) {
  return ['owner', 'editor', 'viewer'].includes(role);
}

canCreateEntry(role) {
  return ['owner', 'editor'].includes(role);
}

canManageDevices(role) {
  return role === 'owner';
}

async checkPermission(action, role) {
  const permissions = {
    read: ['owner', 'editor', 'viewer', 'guest'],
    view_password: ['owner', 'editor', 'viewer'],
    create_share: ['owner', 'editor', 'viewer'],
    edit_entry: ['owner', 'editor'],
    delete_entry: ['owner', 'editor'],
    manage_devices: ['owner']
  };
  
  return permissions[action]?.includes(role) ?? false;
}
```

---

## デバイス紛失・リセット時の対応

### シナリオ1: iPhone を紛失した場合

```
1. PC から設定 → "デバイス管理"
2. "iPhone (nori)" をクリック
3. "デバイスを削除"
4. ✓ iPhone からのアクセス不可に

結果:
- iPhone の IndexedDB は残る（ロックされたまま）
- Device Registry から削除
- 他のデバイス (PC) は使用継続可能
```

### シナリオ2: デバイスをすべてリセットした場合

```
1. 設定 → "Vault 削除"（すべてのデバイスから）
2. マスターパスワード再設定
3. 生体認証を再登録
4. ✓ 完全にリセット

リスク:
- iCloud Drive バックアップがあれば、別デバイスで復元可能
- バックアップがなければ、Vault 全体が失われる
```

---

## iCloud Drive 連携

### 自動バックアップ戦略

```
iPhone でのみ有効:

1. 1日1回（またはマスターPW変更時）
   ├─ Vault 全体を暗号化
   ├─ iCloud Drive に保存
   │  (ファイル: /VAULT/backup-{date}.json)
   └─ 最新3世代のみ保持

2. ローカル IndexedDB も暗号化
   ├─ マスターPW で AES-256-GCM 暗号化
   └─ iCloud にアップロード不可（プライベート）

セキュリティ:
- iCloud 側の暗号化は Apple が担当
- VAULT は独立して暗号化（多層防御）
- 復号化には マスターPW + デバイスキー が必要
```

### 復元フロー

```
新しい iPhone で復元:

1. VAULT をインストール
2. "バックアップから復元"
3. iCloud ログイン
4. バックアップ一覧から選択
5. マスターパスワード入力
6. ✓ 復元完了

検証:
- バックアップの署名検証
- 整合性チェック（CRC）
- タイムスタンプ検証
```

---

## セキュリティベストプラクティス

### ユーザー向け

1. **マスターパスワード**
   - 12文字以上、複雑（大文字+数字+特殊文字）
   - 定期的に変更（90日ごと）
   - 他と同じパスワードを使用しない

2. **生体認証**
   - 必ず登録する
   - デバイス OS の生体認証設定も有効化

3. **デバイス管理**
   - 不要なデバイスは削除
   - 紛失したデバイスは即座に削除

4. **バックアップ**
   - iCloud バックアップを有効化
   - 定期的にエクスポート（別ストレージ）

### 管理者向け

1. **レート制限**
   - ログイン試行: 5回/分
   - API リクエスト: 100回/分

2. **ログ管理**
   - デバイス登録・削除
   - パスワード変更
   - 共有リンク生成
   - ただし、パスワード本体は記録しない

3. **更新戦略**
   - 暗号化アルゴリズムのメジャーバージョン時のみ再暗号化
   - 鍵の定期ローテーション（年1回推奨）

---

## 実装タイムライン

| フェーズ | 期間 | 内容 |
|--------|------|------|
| **Phase 1** | 1-2週間 | Device Registry 実装 |
| **Phase 2** | 2-3週間 | マルチデバイス認証実装 |
| **Phase 3** | 2週間 | アクセス制御 (RBAC) 実装 |
| **Phase 4** | 1-2週間 | iCloud Drive 連携 |
| **Phase 5** | 1週間 | テスト・デバッグ |
