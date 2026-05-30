# iCloud Drive バックアップ・復元アーキテクチャ

## 概要

crypto-vault のセキュアなバックアップ・復元システム。複数プラットフォーム対応で、iCloud Drive（iOS/Mac）、OneDrive（Windows）、Google Drive（クロスプラットフォーム）をサポートします。

---

## セキュリティ要件

### 多層暗号化戦略

```
ユーザーのデータ流

Vault（平文）
   ↓
[AES-256-GCM by マスターパスワード]
   ↓
暗号化Vault blob
   ↓
[AES-256-GCM by Device Key]  ← デバイス側暗号化（追加層）
   ↓
バックアップファイル（二重暗号化）
   ↓
iCloud Drive / OneDrive / Google Drive
   ↓
[iCloud の標準TLS暗号化]
   ↓
Apple / Microsoft / Google サーバー
```

### ユーザーが意識すべき点

1. **マスターパスワード**で Vault を暗号化（必須）
2. **デバイスキー**で追加層を暗号化（自動）
3. **クラウドプロバイダ**は復号化不可（モノリシック設計）
4. **バックアップ自体はローカルにも保存**（オフライン復元対応）

---

## バックアップフロー

### 自動バックアップ（iPhone で自動実行）

```
1. 毎日 00:00 UTC にトリガー
   または マスターパスワード変更時

2. IndexedDB から Vault を読み込み
   {
     vault: [entries...],
     version: 3,
     timestamp: 2026-05-31T10:00:00Z,
     deviceId: "uuid-1234"
   }

3. AES-256-GCM で暗号化（マスターPW）
   {
     salt: base64,
     iv: base64,
     ct: base64,
     tag: base64
   }

4. 追加デバイスキー層で暗号化
   {
     salt: base64,
     iv: base64,
     ct: base64,
     tag: base64
   }

5. バックアップファイル生成
   vault-backup-2026-05-31.json
   {
     version: 3,
     encryptionLayers: ["device-key", "master-password"],
     deviceId: "uuid-1234",
     createdAt: "2026-05-31T10:00:00Z",
     blob: {
       layer1: { salt, iv, ct, tag },
       layer2: { salt, iv, ct, tag }
     },
     checksum: "sha256-hash"
   }

6. iCloud Drive にアップロード
   /VAULT/backups/vault-backup-2026-05-31.json

7. ローカル IndexedDB にも保存
   storage_key: "vault_backup_local_2026-05-31"

8. 最新3世代のみ保持
   → 古いバージョンを削除
```

### 手動バックアップ

```
UI: 設定 → "バックアップ・復元" → "バックアップを作成"

1. マスターパスワード入力で確認
2. 手動トリガーでバックアップ生成
3. ローカル Download フォルダに save option
4. iCloud Drive にアップロード
```

---

## 復元フロー

### iPhone で iCloud Drive から復元

```
1. VAULT インストール → 初回起動
2. "バックアップから復元" ボタン表示
3. iCloud ログイン
4. バックアップ一覧表示（日時順）
   ├─ 2026-05-31 10:00 (1.2 MB)
   ├─ 2026-05-30 10:00 (1.2 MB)
   └─ 2026-05-29 10:00 (1.2 MB)
5. バージョン選択
6. マスターパスワード入力
7. デバイスキー自動取得
8. 2層デコード実行
   └─ Layer 1 (device key decode)
   └─ Layer 2 (master password decode)
9. 検証
   ├─ チェックサム確認
   ├─ タイムスタンプ確認
   ├─ Vault エントリ数確認
10. ✓ 復元完了 → IndexedDB に再度保存
```

### Windows から OneDrive 復元

```
同じフロー、OneDrive ライブラリ経由
```

### Google Drive から復元（クロスプラットフォーム）

```
同じフロー、Google Drive API 経由
```

---

## バックアップファイル仕様

### ファイル構造

```json
{
  "version": 3,
  "type": "vault-backup",
  "encryptionLayers": ["device-key", "master-password"],
  
  "metadata": {
    "deviceId": "uuid-1234-5678",
    "deviceName": "iPhone (nori)",
    "createdAt": "2026-05-31T10:00:00Z",
    "createdBy": "auto|manual|emergency",
    "entryCount": 25,
    "vaultSize": 12288,
    "formatVersion": 3,
    "appVersion": "1.0.0"
  },
  
  "encryption": {
    "layer1": {
      "algo": "AES-256-GCM",
      "key_derivation": "device_id_sha256",
      "iv": "base64-12-bytes",
      "salt": "base64-16-bytes",
      "ciphertext": "base64-encrypted-data",
      "tag": "base64-16-bytes"
    },
    "layer2": {
      "algo": "AES-256-GCM",
      "key_derivation": "PBKDF2-SHA256-200k",
      "iv": "base64-12-bytes",
      "salt": "base64-16-bytes",
      "ciphertext": "base64-encrypted-data",
      "tag": "base64-16-bytes"
    }
  },
  
  "integrity": {
    "checksum": "sha256-hash-of-plaintext",
    "checksumAlgo": "SHA-256",
    "signature": "optional-hmac-sha256"
  }
}
```

### ファイルサイズ推定

```
Vault エントリ 25個:
  ├─ 平文 Vault: ~12 KB
  ├─ 暗号化後: ~12 KB（上書き）
  ├─ JSON 包装: ~1 KB
  ├─ メタデータ: ~0.5 KB
  └─ 合計: ~13.5 KB

年間バックアップ（365個）:
  ├─ ローカル: ~5 MB
  ├─ iCloud 保持（3世代）: ~40 KB
  └─ 合計クラウド: ~40 KB
```

---

## キー管理

### Device Key の導出

```
Device ID (UUID)
   ↓
SHA-256(Device ID + Salt)
   ↓
256-bit Device Key
   ↓
AES-256-GCM 暗号化に使用
```

**特徴**:
- デバイス固有（別デバイスでは使用不可）
- マスターパスワードとは独立
- 紛失時は新デバイスで新キー生成

### Master Password の使用

```
ユーザー入力
   ↓
PBKDF2-SHA256 (200,000反復)
   ↓
256-bit Master Key
   ↓
AES-256-GCM 暗号化に使用
```

---

## サポートプラットフォーム

### iOS / macOS（推奨）
```
✅ iCloud Drive（ネイティブ）
   - CloudKit API 使用
   - UIActivityViewController 経由で Export も可能
   - 自動同期
```

### Windows
```
✅ OneDrive（推奨）
   - OAuth 2.0 認証
   - Microsoft Graph API 使用
   - Web から管理可能

✅ Google Drive（フォールバック）
   - OAuth 2.0 認証
   - Google Drive API 使用
```

### Web（ブラウザ）
```
⚠️ ローカルダウンロードのみ
   - iCloud Drive / OneDrive / Google Drive への自動アップロード不可
   - 手動ダウンロード → 別途アップロード推奨
```

---

## 自動同期設定

### iPhone でのタイムスケジュール

```javascript
// BackupSettings で設定可能

autoBackupEnabled: true           // 自動バックアップ有効
autoBackupSchedule: "daily"       // daily | weekly | monthly
autoBackupTime: "00:00"           // 00:00 UTC
autoBackupOnPasswordChange: true  // PW変更時も実行
maxLocalBackups: 7                // ローカル保持世代数
maxCloudBackups: 3                // iCloud 保持世代数
```

### 同期失敗時の動作

```
1. ネットワーク切断時
   → 次回接続時に自動リトライ
   → 最大5回まで試行

2. iCloud 容量超過時
   → ローカルには保存
   → UI に警告表示
   → ユーザーに対応促促

3. 認証失敗時
   → iCloud ログイン画面に遷移
   → ユーザー操作で再認証
```

---

## 復元検証

### チェックサム検証

```
バックアップファイル:
  metadata.entryCount = 25

復元後:
  restored.vault.length = 25
  
  ✓ 一致 → OK
  ✗ 不一致 → エラー
```

### 整合性チェック

```
1. ファイル署名検証（あれば）
2. タイムスタンプ検証
3. Device ID 検証（同デバイスか？）
4. Vault の構造検証（すべてのキーが揃っているか）
5. エントリの形式検証
```

---

## 災害復旧（Emergency Restore）

### デバイス紛失時

```
新しい iPhone で:

1. VAULT をインストール
2. "緊急復元"
3. iCloud アカウントログイン（同じ Apple ID）
4. バックアップリスト表示
5. 最新版を選択
6. マスターパスワード入力
7. ✓ デバイスキー自動更新
8. ✓ 復元完了
```

### 複数デバイス失敗時

```
PC で:
1. VAULT ウェブ版を開く
2. iCloud / OneDrive / Google Drive 連携
3. バックアップを手動ダウンロード
4. "オフライン復元" で復旧
```

---

## セキュリティベストプラクティス

### ユーザー向け

1. **定期的にバックアップを確認**
   - 月1回は復元テストを実行
   - 実際に復元できるか検証

2. **強力なマスターパスワード**
   - バックアップの復号化に必須
   - 失われると復元不可能

3. **iCloud / OneDrive のセキュリティ**
   - 2要素認証を有効化
   - ログインアラート設定

4. **ローカルバックアップも保持**
   - USB ドライブに定期保存
   - オフサイトストレージ利用

### 管理者向け

1. **バージョン管理**
   - 暗号化アルゴリズム変更時は新フォーマット
   - 旧バージョンとの互換性維持

2. **監査ログ**
   - バックアップ作成時刻
   - 復元実行時刻
   - デバイス情報
   - ただしパスワード本体は記録しない

3. **レート制限**
   - バックアップ作成: 1回/時間
   - 復元操作: 1回/分

---

## 実装タイムライン

| フェーズ | 期間 | 内容 |
|--------|------|------|
| **Phase 1** | 3日 | 暗号化・復号化エンジン実装 |
| **Phase 2** | 2日 | iCloud / OneDrive / Google Drive 統合 |
| **Phase 3** | 2日 | UI 実装（BackupSettings） |
| **Phase 4** | 1日 | Workers エンドポイント実装 |
| **Phase 5** | 2日 | テスト・エラーハンドリング |
| **Phase 6** | 1日 | ドキュメント・運用ガイド |
