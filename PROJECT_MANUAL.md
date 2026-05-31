# PROJECT MANUAL — crypto‑vault + vault‑lab 統合  
**Author: nori**  
**Purpose: 自分が迷わないための “開発者向けマニュアル”**

---

## 1. 現在のプロジェクト構成（2024–2026）

\\\
crypto-vault/
├── index.html              ← メインアプリ（🧪 LAB タブ追加済み）
├── vault-lab.html          ← ホワイトハッカー学習プラットフォーム（150KB）
├── CLAUDE_CODE_NEXT.md     ← Claude Code 用の引き継ぎ書
├── PROJECT_MANUAL.md       ← このマニュアル
├── core/
│   ├── crypto.js
│   ├── storage.js
│   ├── webauthn.js
│   ├── device-registry.js
│   └── backup.js
├── ui/
│   ├── UnlockScreen.js
│   ├── VaultList.js
│   ├── ShareModal.js
│   ├── DeviceManager.js
│   ├── BackupSettings.js
│   ├── SecurityDashboard.js
│   ├── SecurityCoach.js
│   ├── SecurityLab.js
│   └── SecurityTimeline.js
└── workers/
    ├── multidevice-worker.js
    └── backup-worker.js
\\\

---

## 2. vault-lab.html に実装済みのモジュール

| モジュール | タブ | 機能 |
|-----------|------|------|
| Attack Simulator | ATTACK | SQLi / XSS / Hash / CSRF |
| Crypto Playground | CRYPTO | AES-GCM / PBKDF2 / ECDH / RNG |
| CTF Challenge | CTF | 6問（Beginner〜Expert） |
| Threat Model | THREAT | STRIDE / 攻撃ツリー / 設定チェッカー |
| Packet Analyzer | PACKET | JWT / HTTP / Cookie / 改ざん |
| Security Score | SCORE | スコアリング / 30日グラフ |
| Skill Passport | PASSPORT | XP / レーダーチャート / バッジ16個 |

---

## 3. vault-lab.html の改善点（すでに実装済み）

### ✔ 進捗の永続化  
localStorage に XP・フラグ・スキルを保存。

### ✔ CTF の連鎖アンロック  
クリアすると次の問題が自動で開く。

### ✔ バッジ追加  
STRIDE / AttackTree / PacketJWT / SecurityScore の4つを追加。

---

## 4. Claude Code に依頼する “次のタスク”

### TASK 1 — vault-lab.html を index.html に完全統合  
- 現在は別ページ  
- 最終的には index.html のタブパネルとして統合  
- vault-lab-modules.js に分割して import する案が最適

### TASK 2 — モバイル（iPhone）ボトムナビ統合  
- vault-lab.html の nav を index.html の bottom-nav に合わせる  
- safe-area 対応

### TASK 3 — CTF Expert 問題を 3 問追加  
- Timing Attack  
- Padding Oracle  
- Steganography

### TASK 4 — Security Timeline を vault-lab.html に統合  
- SCORE タブの下部に追加  
- localStorage のイベントを読み込む

### TASK 5 — ゲストモード / 家族共有との連携  
- ゲストは CTF のみアクセス可  
- オーナーは全 LAB アクセス可

---

## 5. Claude Code に渡す “推奨プロンプト”

\\\
C:\Users\norin\crypto-vault の vault-lab.html と index.html を読み、
CLAUDE_CODE_NEXT.md の TASK 1〜5 を順番に実装してください。

まず TASK 1（完全統合）から開始し、
次に TASK 3（CTF Expert問題追加）を実装してください。

vault-lab.html のスタイル変数（--bg, --green など）は
index.html の既存スタイルと統一してください。
\\\

---

## 6. 開発の進め方（nori 用）

### ✔ 1. vault-lab.html を単体で改善  
→ Claude Code に渡す  
→ 改善されたら crypto-vault にコピー

### ✔ 2. index.html に統合  
→ Claude Code に差分生成させる  
→ 手動で適用（VSCode の Copilot は長文置換が苦手）

### ✔ 3. Git コミット  
→ まだ早いが、統合が安定したらコミット

---

## 7. よく使う PowerShell コマンド

### vault-lab.html を crypto-vault にコピー

\\\
Copy-Item -Path "C:\Users\norin\Downloads\vault-lab.html" 
          -Destination "C:\Users\norin\crypto-vault\vault-lab.html" -Force
\\\

### CLAUDE_CODE_NEXT.md をコピー

\\\
Copy-Item -Path "C:\Users\norin\Downloads\CLAUDE_CODE_NEXT.md" 
          -Destination "C:\Users\norin\crypto-vault\CLAUDE_CODE_NEXT.md" -Force
\\\

---

## 8. 注意点（重要）

- VSCode の Copilot Chat は長い HTML 置換が苦手  
- “Replacing X lines” と表示されても実際に編集されていないことがある  
- index.html の編集はあなたが貼った部分を私が差分生成する方式が最も安全

---

## 9. このマニュアルの目的

- 自分が迷わない  
- Claude Code に何を渡せばいいか一目でわかる  
- vault-lab.html と crypto-vault の関係を整理  
- どこまで終わっていて、次に何をすればいいか明確化  
- いつでも再開できる

---

## 10. 最後に

このマニュアルはあなたのプロジェクトの “地図”。  
迷ったらここに戻れば、すぐに次の一手がわかる。

