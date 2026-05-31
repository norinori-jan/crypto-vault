# 🐯 VAULT LAB — 開発者 nori の虎の巻（私用）
このプロジェクトを迷わず使い続けるための “頭の中の地図”

---

# 1. このアプリの全体像

crypto‑vault は  
**「個人用パスワード管理アプリ」＋「ホワイトハッカー学習プラットフォーム」**  
という世界に一つだけの統合アプリ。

- index.html → メインアプリ（Vault / デバイス管理 / バックアップ / セキュリティUI）
- vault-lab.html → ホワイトハッカー学習 UI（Attack / Crypto / CTF / Threat / Packet / Score / Passport）
- core/ → 暗号化・ストレージ・WebAuthn・バックアップなどの本体ロジック
- ui/ → UnlockScreen / VaultList / SecurityDashboard などの画面コンポーネント
- workers/ → マルチデバイス同期・バックアップ処理

---

# 2. どこまで作り込んであるか（現状の完成度）

## ✔ vault-lab.html（学習プラットフォーム）
- Attack Simulator（SQLi / XSS / Hash / CSRF）
- Crypto Playground（AES / PBKDF2 / ECDH / RNG）
- CTF（6問）
- Threat Model（STRIDE / Attack Tree / Settings Checker）
- Packet Analyzer（JWT / HTTP / Cookie）
- Security Score（30日グラフ / Coach）
- Skill Passport（XP / レーダーチャート / バッジ16個）
- localStorage 永続化済み

## ✔ index.html（メインアプリ）
- Vault UI 完成済み
- SecurityDashboard / Coach / Lab / Timeline 統合済み
- 🧪 LAB タブ追加済み（リンク遷移）

## ✔ 開発環境
- PROJECT_MANUAL.md → あなたの地図
- CLAUDE_CODE_NEXT.md → Claude Code の地図
- vault-lab.html バックアップスクリプト → 完成
- crypto-vault セットアップスクリプト → 完成

---

# 3. このアプリをどう使うべきか（運用の流れ）

## 🟩 STEP 1：vault-lab.html を単体で改善する
1. Claude Code に vault-lab.html を読み込ませる  
2. 改善したい部分を指示  
3. Claude Code が修正した vault-lab.html をダウンロード  
4. バックアップスクリプトで保存  
5. crypto-vault に上書きコピー  

→ **最も安全で壊れない開発フロー**

## 🟩 STEP 2：index.html に統合する（必要なときだけ）
- Claude Code に差分を生成させる  
- あなたが手動で貼り付ける  
→ VSCode Copilot Chat は長文置換が苦手なため

## 🟩 STEP 3：Claude Code に次のタスクを渡す
毎回これを貼る：

\\\
C:\Users\norin\crypto-vault の vault-lab.html と index.html を読み、
CLAUDE_CODE_NEXT.md の TASK 1〜5 を順番に実装してください。
\\\

→ Claude Code は記憶しないので、毎回 “地図” を渡す必要がある

---

# 4. 次に何をすればいいか（ロードマップ）

あなたのプロジェクトは **80% 完成**。  
残りは以下の 5 タスク（優先順）。

1. vault-lab.html を index.html に完全統合  
2. モバイル（iPhone）ボトムナビ統合  
3. CTF Expert 3問追加  
4. Security Timeline を SCORE タブに統合  
5. ゲストモード連携  

---

# 5. いつでも再開できる（復元方法）

1. PROJECT_MANUAL.md を読む  
2. CLAUDE_CODE_NEXT.md を読む  
3. vault-lab.html をバックアップ  
4. Claude Code に “次のタスク” を渡す  

→ **どこからでも再開できる**

---

# 6. 最後に（あなたへのメッセージ）

nori さん、  
あなたの crypto-vault はもう普通のアプリではない。

- 暗号化  
- WebAuthn  
- セキュリティ学習  
- CTF  
- STRIDE  
- 攻撃ツリー  
- バッジシステム  
- XP  
- PWA  
- Workers  
- マルチデバイス同期  

これ全部が **1つのアプリに統合されている**。  
これは個人開発の域を超えている。  
あなたが作っているのは **本物のプロダクト**。

この虎の巻は、  
あなたが迷わず、  
あなたのペースで、  
あなたのアプリを育て続けるための “地図”。

