# VAULT — セキュアパスワードマネージャー

ローカルファーストの暗号化パスワードマネージャー。サーバーレス構成。

## ファイル構成

```
crypto-vault/
├── index.html        ← メインアプリ（これをブラウザで開くだけ）
├── share-worker.js   ← Cloudflare Workers用バックエンド（共有機能）
└── README.md
```

---

## 使い方

### 1. メインアプリの起動

`index.html` をブラウザで開くだけ。サーバー不要。

- **初回**: 好きなマスターパスワードを入力 → UNLOCK
- **以降**: 同じパスワードでUnlock

### 2. 各タブの説明

| タブ | 機能 |
|------|------|
| 🗄 VAULT | パスワード一覧・検索 |
| ⚡ GEN | 安全なパスワードを自動生成 |
| ＋ ADD | 新規エントリを追加 |
| 🔍 CHECK | Have I Been Pwned でパスワード漏洩チェック |
| 🔗 SHARE | 暗号化リンクで他人と安全共有 |
| ⚙ | 設定（生体認証・エクスポート等） |

---

## 共有機能のセットアップ（オプション）

共有機能を使うには Cloudflare Workers のデプロイが必要。

### Workers のデプロイ手順

1. [dash.cloudflare.com](https://dash.cloudflare.com) にログイン
2. **Workers & Pages** → **Create Worker**
3. `share-worker.js` の内容を貼り付けてデプロイ
4. **Settings** → **Variables** → **KV Namespace Bindings**
   - Variable name: `VAULT_SHARE`
   - 新規 KV Namespace を作成して紐付け
5. Worker の URL をコピー（例: `https://vault-share.yourname.workers.dev`）

### アプリへの設定

1. VAULTアプリの **⚙ 設定タブ** を開く
2. **WORKER URL** に上記URLを貼り付けて **SAVE**

### 共有の流れ

**送信側:**
1. 🔗 SHARE タブ → エントリを選択
2. 有効期限・解除パスワードを設定（省略するとマスターPWと同じ）
3. **共有リンクを生成** → URLをコピーして相手に送る

**受信側:**
1. URLを開く
2. 解除パスワードを入力 → パスワード情報が表示される

> ⚠️ データはエンドツーエンド暗号化（AES-256-GCM）。  
> サーバーはBlob（暗号化済み）を保持するだけで中身を解読できません。

---

## セキュリティ仕様

- **暗号化**: AES-256-GCM
- **鍵導出**: PBKDF2 (SHA-256, 200,000 反復)
- **保存場所**: IndexedDB（端末内のみ）
- **生体認証**: WebAuthn (Touch ID / Face ID / Windows Hello)
- **漏洩チェック**: k-Anonymity方式（実際のパスワードは送信しない）
- **共有**: エンドツーエンド暗号化（サーバーは復号不可）
