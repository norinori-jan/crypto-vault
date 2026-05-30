# VAULT WORKERS デプロイ手順

## 概要

VAULT の共有機能は Cloudflare Workers を使用しています。このガイドでは、Windows PowerShell を使用したセットアップ手順を説明します。

---

## 前提条件

- Cloudflare アカウント（無料でも可能）
- Wrangler CLI（Cloudflare Workers デプロイツール）
- Node.js v14 以上
- PowerShell 5.0 以上（Windows）

---

## Step 1: Wrangler CLI のインストール

### PowerShell で実行

```powershell
# npm インストール
npm install -g wrangler

# バージョン確認
wrangler --version
```

### または、npm を使用

```powershell
# ローカルにインストール
npm install wrangler --save-dev

# 実行時は npx を使用
npx wrangler --version
```

---

## Step 2: Cloudflare にログイン

```powershell
wrangler login
```

ブラウザが開き、Cloudflare アカウントにログインするよう促されます。

---

## Step 3: プロジェクトの初期化

```powershell
# 作業ディレクトリに移動
cd C:\Users\norin\crypto-vault

# 新しい Wrangler プロジェクトを初期化
wrangler init --name vault-share

# 質問に答える:
# - What type of Worker do you want to create? → "Fetch"
# - Would you like to use Git? → "yes" or "no"
# - Would you like to use TypeScript? → "no"
```

---

## Step 4: `wrangler.toml` を編集

```toml
# wrangler.toml

name = "vault-share"
type = "javascript"
account_id = "YOUR_ACCOUNT_ID"
workers_dev = true
route = ""

# KV Namespace バインディング（後で追加）
[[kv_namespaces]]
binding = "VAULT_SHARE"
id = "YOUR_KV_NAMESPACE_ID"
```

---

## Step 5: KV Namespace を作成

```powershell
# 本番用 KV Namespace を作成
wrangler kv:namespace create "vault-share"

# 出力例:
# ✓ Created namespace with title "vault-share"
# Add the following to your wrangler.toml:
# [[kv_namespaces]]
# binding = "VAULT_SHARE"
# id = "YOUR_KV_NAMESPACE_ID"

# 上記の情報を wrangler.toml にコピー
```

---

## Step 6: share-worker.js を配置

```powershell
# share-worker.js を src/index.js にコピー
Copy-Item -Path "C:\Users\norin\crypto-vault\share-worker.js" `
          -Destination "src/index.js" -Force
```

---

## Step 7: デプロイ

```powershell
# デプロイ実行
wrangler deploy

# 成功時の出力:
# ✓ Uploaded vault-share (1.2 KiB)
# ✓ Deployed to https://vault-share.YOUR_USERNAME.workers.dev
```

---

## Step 8: Worker URL を VAULT に設定

```powershell
# ブラウザで VAULT を開く
#設定タブ (⚙) → WORKER URL に以下を入力:
# https://vault-share.YOUR_USERNAME.workers.dev

# または、PowerShell で config ファイルに保存
$workerUrl = "https://vault-share.YOUR_USERNAME.workers.dev"
$workerUrl | Out-File -FilePath "$env:APPDATA\vault-config.txt"
```

---

## トラブルシューティング

### エラー: `wrangler: command not found`

**解決策**:
```powershell
# グローバルインストール確認
npm list -g wrangler

# もしインストールされていなければ:
npm install -g wrangler
```

### エラー: `Error: No environment found with name "production"`

**解決策**: `wrangler.toml` に以下を追加
```toml
env = "production"
[env.production]
```

### KV Namespace が見つからない

**解決策**:
```powershell
# 全 KV Namespace を表示
wrangler kv:namespace list

# 新しく作成
wrangler kv:namespace create "vault-share"
```

### デプロイが遅い or タイムアウト

**原因**: Workers バンドルサイズが大きすぎる

**解決策**:
```powershell
# バンドルサイズを確認
wrangler build

# 不要なコードを削除
```

---

## 本番環境への公開

### オプション1: GitHub Actions で自動デプロイ

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### オプション2: 手動デプロイ

```powershell
# テスト環境でのテスト
wrangler dev

# ブラウザで http://localhost:8787 にアクセス

# 本番環境にデプロイ
wrangler deploy
```

---

## セキュリティ設定

### CORS ヘッダー（既に share-worker.js に含まれています）

```javascript
const CORS = {
  'Access-Control-Allow-Origin': '*',  // or specific domain
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
```

**本番環境では、特定ドメインのみを許可**:
```javascript
'Access-Control-Allow-Origin': 'https://vault.yourname.com',
```

### 環境変数の管理

```powershell
# wrangler.toml に環境変数を定義
# [env.production]
# vars = { ENVIRONMENT = "production" }

# または、Cloudflare Dashboard から設定
```

---

## テスト

### POST /share - 共有リンク作成

```powershell
$body = @{
    blob = @{
        salt = @(0, 1, 2)
        iv = @(0, 1, 2)
        ct = @(0, 1, 2)
    }
    expiresInHours = 24
    label = "Google"
} | ConvertTo-Json

curl -X POST `
     -H "Content-Type: application/json" `
     -d $body `
     "https://vault-share.YOUR_USERNAME.workers.dev/share"
```

### GET /share/:id - 取得

```powershell
curl "https://vault-share.YOUR_USERNAME.workers.dev/share/abc123..."
```

### DELETE /share/:id - 削除

```powershell
curl -X DELETE `
     "https://vault-share.YOUR_USERNAME.workers.dev/share/abc123..."
```

---

## 監視とログ

Cloudflare Dashboard で確認:
1. 左サイドバー → Workers & Pages
2. 対象の Worker をクリック
3. Analytics タブでリクエスト数・エラー率を確認
4. Logs タブでリアルタイムログを確認

---

## アップデート

```powershell
# share-worker.js を更新
# (新しいコード)

# src/index.js に上書き
Copy-Item -Path "C:\Users\norin\crypto-vault\share-worker.js" `
          -Destination "src/index.js" -Force

# 再デプロイ
wrangler deploy
```

---

## 削除

```powershell
# Worker を削除
wrangler delete

# KV Namespace を削除
wrangler kv:namespace delete --namespace-id YOUR_KV_NAMESPACE_ID
```
