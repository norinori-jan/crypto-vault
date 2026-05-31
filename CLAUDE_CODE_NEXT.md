# VAULT LAB — Claude Code 次セッション引き継ぎ指示書

## 現在の状態 (2024年)

`C:\Users\norin\crypto-vault\` の構成:

```
crypto-vault/
├── index.html              ← メインVaultアプリ（🧪 LABタブ追加済み）
├── vault-lab.html          ← ホワイトハッカー学習プラットフォーム（150KB）
├── share-worker.js         ← Cloudflare Workers バックエンド
├── sw.js                   ← Service Worker（PWA）
├── manifest.json           ← PWAマニフェスト
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
```

---

## vault-lab.html に実装済みのモジュール

| モジュール | タブ | 機能 |
|-----------|------|------|
| Attack Simulator | ATTACK | SQLi / XSS / Hash / CSRF 体験 |
| Crypto Playground | CRYPTO | AES-GCM / PBKDF2 / ECDH / RNG ライブ実行 |
| CTF Challenge | CTF | 6問（Beginner×2 / Intermediate×2 / Expert×2） |
| Threat Model | THREAT | STRIDE分析 / 攻撃ツリー / 設定チェッカー |
| Packet Analyzer | PACKET | JWT解析 / HTTPヘッダー / Cookie / リクエスト改ざん |
| Security Score | SCORE | スコアリング / 30日グラフ / Security Coach |
| Skill Passport | PASSPORT | XP / レーダーチャート / バッジ16個 / ロードマップ |

---

## 次にClaude Codeで実装すること（優先順高い順）

### 【TASK 1】vault-lab.html を index.html に完全統合する

現在は別ファイル（リンク遷移）になっている。
`index.html` のタブパネルとして直接埋め込む。

```
// index.html の showApp() 内に追加
import('./vault-lab-modules.js').then(m => m.initLab());
```

または、vault-lab.html の `<style>` と `<script>` を
index.html に統合し、1ファイルにする。

### 【TASK 2】モバイル（iPhone）ボトムナビとの統合

index.html のボトムナビに「🧪 LAB」を追加済みだが、
vault-lab.html 側もボトムナビ対応にする。

vault-lab.html の .nav を index.html のスタイルに合わせる:
- ボトムナビ固定 (position: fixed; bottom: 0)
- safe-area-inset-bottom 対応
- タップターゲット 48px

### 【TASK 3】CTFに3問追加（Expert Level）

現在6問。以下を追加:

**Expert #7: タイミング攻撃**
```javascript
// 文字列比較の処理時間差から情報を推測する
// safe compare vs unsafe compare の時間計測デモ
async function timingAttackDemo() {
  const secret = "FLAG-TIMING-007";
  // 文字ごとに一致確認して平均処理時間を計測
  // → 一致文字数が増えると処理時間が微増する様子を可視化
}
```

**Expert #8: Padding Oracle Attack 概念デモ**
- CBC モードの padding oracle を視覚的に説明
- バイト単位で復号していく様子をアニメーション表示

**Expert #9: ステガノグラフィー**
- 画像のLSB（最下位ビット）にフラグを隠す
- Canvas APIで画像を操作してフラグを埋め込み・抽出

### 【TASK 4】Security Timeline をvault-lab.htmlに統合

`ui/SecurityTimeline.js` の内容を SCORE タブの下部に追加。
localStorage からイベントを読み取り、タイムラインを表示する。

```javascript
// 追加するイベント形式
const events = JSON.parse(localStorage.getItem('vault_security_events') || '[]');
// 例: {type: 'biometric_registered', ts: Date.now(), detail: 'Face ID'}
```

### 【TASK 5】ゲストモード + 家族共有との連携

index.html のゲストモードで vault-lab.html へのアクセスを制限:
- オーナー: 全LABアクセス可
- ゲスト: CTF Challengeのみ（学習目的として開放）

```javascript
// index.html の showApp() に追加
const isGuest = (sessionRole === 'guest');
const labBtn = document.querySelector('[onclick*="vault-lab"]');
if (labBtn) {
  labBtn.textContent = isGuest ? '🏴 CTF Only' : '🧪 LAB';
  labBtn.onclick = () => {
    if (isGuest) window.location.href = 'vault-lab.html#ctf';
    else window.location.href = 'vault-lab.html';
  };
}
```

---

## 技術的な注意事項

### WebCrypto API の制約
- `crypto.subtle` は HTTPS または localhost でのみ動作
- file:// プロトコルでは一部機能が動かない場合がある
- → PWA (sw.js) でキャッシュするか、ローカルサーバー推奨

### localStorage キー一覧（vault-lab.html が使用）
```
vaultlab_state    → {xp, flags, skills} JSON
vault_worker_url  → Cloudflare Worker URL
vault_security_events → タイムラインイベント配列
```

### フラグ一覧（CTF正解）
```
FLAG-B64DEC-001   ← Base64デコード
FLAG-ROT13-002    ← ROT13
FLAG-HASH-ID-003  ← ハッシュ識別（2問正解で取得）
FLAG-JWT-DEC-004  ← JWT解析
FLAG-AVALANCHE-005 ← 雪崩効果（50%以上のビット差異）
FLAG-KANON-006    ← k-Anonymityデモ実行
FLAG-JWT-PA-007   ← Packet Analyzer JWTサンプルのペイロード内
FLAG-SQLI-001     ← SQLi攻撃成功
FLAG-XSS-001      ← XSS攻撃成功
FLAG-HASH-001     ← ハッシュ計測実行
FLAG-CSRF-001     ← CSRF防御確認
```

---

## index.html の現在の変更点（Claude Codeが実施済み）

- 行117-122付近: 「🧪 LAB」タブボタンを追加
- タブクリックで `window.open('vault-lab.html','_blank')` または遷移

---

## 推奨する次のプロンプト（Claude Codeに貼り付け）

```
C:\Users\norin\crypto-vault の vault-lab.html と index.html を読み、
CLAUDE_CODE_NEXT.md の TASK 1〜5 を順番に実装してください。

まず TASK 1（完全統合）から開始し、
次に TASK 3（CTF Expert問題追加）を実装してください。

vault-lab.html のスタイル変数（--bg, --green など）は
index.html の既存スタイルと統一してください。
```
