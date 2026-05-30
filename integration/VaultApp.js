/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT INTEGRATION LAYER
 * ═══════════════════════════════════════════════════════════════════
 * 
 * core/, ui/, docs/ の3層を統合するメインアプリケーション
 * index.html のロジック層を完全にモジュール化
 * 
 * 依存関係:
 *  - core/crypto.js
 *  - core/storage.js
 *  - core/webauthn.js
 *  - ui/UnlockScreen.js
 *  - ui/VaultList.js
 *  - ui/ShareModal.js
 */

class VaultApp {
  constructor() {
    // 状態管理
    this.masterPassword = null;
    this.vault = [];
    this.currentEntryId = null;
    this.breachCache = {};
    this.workerUrl = '';
    
    // UI コンポーネント
    this.unlockScreen = null;
    this.vaultList = null;
    this.shareModal = null;
    this.detailModal = null;
    
    // 初期化
    this.init();
  }

  /**
   * アプリケーション初期化
   */
  async init() {
    console.log('[VAULT] Initializing application...');
    
    // 1. プラットフォーム検出
    if (typeof VaultBiometric !== 'undefined') {
      VaultBiometric.initWebAuthn();
    }
    
    // 2. IndexedDB サポート確認
    if (!VaultStorage.isIndexedDBSupported()) {
      alert('このブラウザは IndexedDB に対応していません');
      return;
    }
    
    // 3. Worker URL を取得
    this.workerUrl = VaultStorage.getSetting('vault_worker_url', '');
    
    // 4. UI コンポーネント初期化
    await this.initializeUIComponents();
    
    // 5. ルーティング判定（共有リンク or メインアプリ）
    const shareId = new URLSearchParams(location.search).get('s');
    if (shareId) {
      this.handleSharedEntry(shareId);
    } else {
      await this.handleMainApp();
    }
    
    console.log('[VAULT] Application initialized');
  }

  /**
   * UI コンポーネントを初期化
   */
  async initializeUIComponents() {
    // UnlockScreen
    this.unlockScreen = new UnlockScreen({
      containerId: 'unlock-screen',
      onUnlock: (pw) => this.handleUnlock(pw),
      onBioRegister: () => this.handleBioRegister(),
      bioSupported: typeof VaultBiometric !== 'undefined' && 
                    VaultBiometric.isBiometricSupported(),
      bioRegistered: await this.isBioRegistered(),
      isFirstTime: !(await VaultStorage.dbExists(VaultStorage.STORAGE_KEYS.VAULT_BLOB))
    });
    
    // VaultList
    this.vaultList = new VaultList({
      containerId: 'tab-vault',
      onEntryClick: (entry) => this.handleEntryClick(entry)
    });
    
    // ShareModal
    this.shareModal = new ShareModal({
      containerId: 'tab-share',
      workerUrl: this.workerUrl,
      masterPassword: this.masterPassword,
      onCreateShare: (data) => this.handleCreateShare(data),
      onDeleteShare: (shareId) => this.handleDeleteShare(shareId)
    });
  }

  /**
   * メインアプリを処理
   */
  async handleMainApp() {
    const vaultBlob = await VaultStorage.dbGet(VaultStorage.STORAGE_KEYS.VAULT_BLOB);
    
    if (!vaultBlob) {
      // 初回起動
      this.unlockScreen.show();
    } else {
      // 既存 Vault がある → アンロック待機
      this.unlockScreen.show();
    }
  }

  /**
   * マスターパスワードでアンロック
   */
  async handleUnlock(password) {
    try {
      const vaultBlob = await VaultStorage.dbGet(VaultStorage.STORAGE_KEYS.VAULT_BLOB);
      
      if (!vaultBlob) {
        // 初回起動 → Vault 作成
        this.masterPassword = password;
        this.vault = [];
        await this.saveVault();
        this.showMainApp();
      } else {
        // 既存 Vault を復号化
        this.vault = await VaultCrypto.decryptData(vaultBlob, password);
        this.masterPassword = password;
        this.showMainApp();
      }
    } catch (e) {
      throw new Error('パスワードが違うか、データが破損しています');
    }
  }

  /**
   * 生体認証でアンロック
   */
  async handleBioUnlock() {
    if (typeof VaultBiometric === 'undefined') return;
    
    try {
      const result = await VaultBiometric.bioUnlock();
      if (!result.success) throw new Error(result.message);
      
      // 生キーでマスターパスワードを復号化
      const credData = await VaultStorage.dbGet(VaultStorage.STORAGE_KEYS.BIO_CREDENTIAL);
      const encPw = await VaultStorage.dbGet(VaultStorage.STORAGE_KEYS.BIO_VAULT_KEY);
      
      const rawKey = await crypto.subtle.digest('SHA-256', 
        new Uint8Array(credData.credId));
      const { masterPw } = await VaultCrypto.decryptWithRawKey(encPw, rawKey);
      
      // パスワード入力フィールドに設定して自動アンロック
      document.getElementById('master-input').value = masterPw;
      await this.handleUnlock(masterPw);
    } catch (e) {
      throw new Error(`生体認証失敗: ${e.message}`);
    }
  }

  /**
   * 生体認証を登録
   */
  async handleBioRegister() {
    if (typeof VaultBiometric === 'undefined') return;
    if (!this.masterPassword) {
      alert('先にアンロックしてください');
      return;
    }
    
    try {
      const result = await VaultBiometric.bioRegister();
      if (!result.success) throw new Error(result.message);
      
      alert('生体認証を登録しました');
      
      // UI 更新
      const bioRegistered = await VaultStorage.dbExists(VaultStorage.STORAGE_KEYS.BIO_CREDENTIAL);
      this.unlockScreen.bioRegistered = bioRegistered;
      this.unlockScreen.updateUI();
    } catch (e) {
      alert(`登録失敗: ${e.message}`);
    }
  }

  /**
   * メインアプリを表示
   */
  showMainApp() {
    this.unlockScreen.hide();
    const mainApp = document.getElementById('main-app');
    if (mainApp) mainApp.style.display = 'block';
    
    // UI コンポーネント更新
    this.vaultList.setVault(this.vault);
    this.vaultList.setBreachCache(this.breachCache);
    this.shareModal.setVault(this.vault);
    this.shareModal.setWorkerUrl(this.workerUrl);
    this.shareModal.setMasterPassword(this.masterPassword);
  }

  /**
   * Vault を保存
   */
  async saveVault() {
    const encrypted = await VaultCrypto.encryptData(this.vault, this.masterPassword);
    await VaultStorage.dbSet(VaultStorage.STORAGE_KEYS.VAULT_BLOB, encrypted);
    
    const sizeDisplay = document.getElementById('vault-size-display');
    if (sizeDisplay) {
      sizeDisplay.textContent = `${this.vault.length} ENTRIES`;
    }
  }

  /**
   * Vault エントリをクリック
   */
  handleEntryClick(entry) {
    this.currentEntryId = entry.id;
    this.showDetailModal(entry);
  }

  /**
   * 詳細モーダルを表示
   */
  showDetailModal(entry) {
    const modal = document.getElementById('detail-modal');
    if (!modal) return;
    
    // データを入力
    document.getElementById('modal-icon').textContent = this.getIcon(entry.name);
    document.getElementById('modal-name').textContent = entry.name;
    document.getElementById('modal-date').textContent = 
      new Date(entry.createdAt).toLocaleDateString('ja-JP');
    document.getElementById('modal-user').textContent = entry.user || '—';
    document.getElementById('modal-pw').textContent = '••••••••';
    document.getElementById('modal-pw').classList.add('pw-hidden');
    document.getElementById('modal-show-btn').textContent = '👁';
    document.getElementById('modal-url').textContent = entry.url || '—';
    document.getElementById('modal-notes').textContent = entry.notes || '—';
    
    // URL と NOTES の表示判定
    document.getElementById('modal-url-row').style.display = entry.url ? '' : 'none';
    document.getElementById('modal-notes-row').style.display = entry.notes ? '' : 'none';
    
    // 漏洩チェック結果
    const breachRow = document.getElementById('modal-breach-row');
    const breachResult = document.getElementById('modal-breach-result');
    const c = this.breachCache[entry.id];
    if (c) {
      breachRow.style.display = '';
      if (c.count === 0) {
        breachResult.textContent = '✓ 安全';
        breachResult.style.color = 'var(--safe)';
      } else {
        breachResult.textContent = `⚠ ${c.count.toLocaleString()}件の漏洩を検出`;
        breachResult.style.color = c.count < 10 ? 'var(--warn)' : 'var(--danger)';
      }
    } else {
      breachRow.style.display = 'none';
    }
    
    // モーダル表示
    modal.classList.add('open');
  }

  /**
   * 詳細モーダルを閉じる
   */
  closeDetailModal() {
    const modal = document.getElementById('detail-modal');
    if (modal) modal.classList.remove('open');
    this.currentEntryId = null;
  }

  /**
   * パスワード表示切り替え
   */
  toggleModalPassword() {
    const entry = this.vault.find(x => x.id === this.currentEntryId);
    if (!entry) return;
    
    const span = document.getElementById('modal-pw');
    const visible = !span.classList.contains('pw-hidden');
    
    span.textContent = visible ? '••••••••' : entry.pw;
    span.classList.toggle('pw-hidden', visible);
    document.getElementById('modal-show-btn').textContent = visible ? '👁' : '🙈';
  }

  /**
   * フィールドをコピー
   */
  copyField(field) {
    const entry = this.vault.find(x => x.id === this.currentEntryId);
    if (!entry) return;
    
    const text = field === 'user' ? entry.user : entry.pw;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('コピーしました');
    });
  }

  /**
   * エントリを削除
   */
  async deleteEntry() {
    if (!this.currentEntryId || !confirm('削除しますか？')) return;
    
    this.vault = this.vault.filter(x => x.id !== this.currentEntryId);
    await this.saveVault();
    this.vaultList.setVault(this.vault);
    this.closeDetailModal();
    this.showToast('削除しました');
  }

  /**
   * エントリを追加
   */
  async addEntry(data) {
    const { name, user, pw, url, notes } = data;
    
    if (!name || !pw) {
      throw new Error('サービス名とパスワードは必須です');
    }
    
    this.vault.push({
      id: VaultCrypto.generateId(),
      name,
      user: user || '',
      pw,
      url: url || '',
      notes: notes || '',
      createdAt: new Date().toISOString()
    });
    
    await this.saveVault();
    this.vaultList.setVault(this.vault);
    this.showToast('保存しました 🔒');
  }

  /**
   * 漏洩チェック
   */
  async checkAllBreaches() {
    if (!this.vault.length) {
      this.showToast('Vaultにエントリがありません', 'danger');
      return;
    }
    
    const btn = document.getElementById('hibp-scan-btn');
    const bar = document.getElementById('hibp-progress-bar');
    const fill = document.getElementById('hibp-progress-fill');
    const status = document.getElementById('hibp-status');
    const results = document.getElementById('hibp-results');
    
    btn.disabled = true;
    btn.textContent = 'スキャン中...';
    bar.style.display = 'block';
    results.innerHTML = '';
    
    let done = 0;
    let leaked = 0;
    
    for (const entry of this.vault) {
      status.textContent = `チェック中: ${entry.name} (${done + 1}/${this.vault.length})`;
      fill.style.width = ((done / this.vault.length) * 100) + '%';
      
      try {
        const count = await VaultCrypto.checkPasswordBreach(entry.pw);
        this.breachCache[entry.id] = { count, checkedAt: Date.now() };
        if (count > 0) leaked++;
        
        const cls = count === 0 ? 'safe' : count < 10 ? 'warn' : 'danger';
        const label = count === 0 ? '✓ 安全' : `⚠ ${count.toLocaleString()}件`;
        
        results.innerHTML += `
          <div class="hibp-item">
            <div class="vault-icon">${this.getIcon(entry.name)}</div>
            <div class="hibp-info">
              <div class="hibp-name">${this.escHtml(entry.name)}</div>
              <div class="hibp-user">${this.escHtml(entry.user || '')}</div>
              <div class="hibp-count ${cls}">${label}</div>
            </div>
          </div>`;
      } catch {
        results.innerHTML += `
          <div class="hibp-item">
            <div class="vault-icon">${this.getIcon(entry.name)}</div>
            <div class="hibp-info">
              <div class="hibp-name">${this.escHtml(entry.name)}</div>
              <div class="hibp-count" style="color:var(--muted)">チェック失敗</div>
            </div>
          </div>`;
      }
      
      done++;
      await new Promise(r => setTimeout(r, 1500));
    }
    
    fill.style.width = '100%';
    status.textContent = `スキャン完了: ${this.vault.length}件中 ${leaked}件に漏洩を検出`;
    btn.disabled = false;
    btn.textContent = '🔍 再スキャン';
    
    this.vaultList.setBreachCache(this.breachCache);
  }

  /**
   * 共有リンクを作成
   */
  async handleCreateShare(data) {
    if (!this.workerUrl) {
      throw new Error('Worker URL が設定されていません');
    }
    
    const { entry, password, expiresInHours } = data;
    
    // エントリを暗号化
    const blob = await VaultCrypto.encryptData(
      { name: entry.name, user: entry.user, pw: entry.pw, url: entry.url },
      password
    );
    
    // Worker に POST
    const res = await fetch(this.workerUrl + '/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob, expiresInHours, label: entry.name })
    });
    
    if (!res.ok) {
      throw new Error('Worker エラー');
    }
    
    const result = await res.json();
    if (!result.id) throw new Error(result.error || 'Unknown error');
    
    // UI 更新
    const shareUrl = location.origin + location.pathname + '?s=' + result.id;
    this.shareModal.displayResult(result.id, result.expiresAt, expiresInHours);
    
    this.showToast('リンクを生成しました 🔗', 'purple');
  }

  /**
   * 共有リンクを削除
   */
  async handleDeleteShare(shareId) {
    if (!this.workerUrl) return;
    
    await fetch(this.workerUrl + '/share/' + shareId, { method: 'DELETE' });
    this.showToast('リンクを削除しました');
  }

  /**
   * 共有エントリを受け取る
   */
  async handleSharedEntry(shareId) {
    const receiveScreen = document.getElementById('receive-screen');
    if (!receiveScreen) return;
    
    receiveScreen.classList.add('visible');
    
    try {
      const res = await fetch(this.workerUrl + '/share/' + shareId);
      if (!res.ok) {
        throw new Error('リンクが無効または期限切れです');
      }
      
      const data = await res.json();
      const blob = data.blob;
      
      document.getElementById('receive-loading').style.display = 'none';
      document.getElementById('receive-unlock-form').style.display = 'block';
      
      // パスワード入力で復号化
      const pwInput = document.getElementById('receive-pw-input');
      pwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.receiveDecrypt(blob);
      });
    } catch (e) {
      document.getElementById('receive-loading').textContent = e.message;
    }
  }

  /**
   * 受信したデータを復号化
   */
  async receiveDecrypt(blob) {
    const pw = document.getElementById('receive-pw-input').value;
    const error = document.getElementById('receive-error');
    
    if (!pw) {
      error.textContent = 'パスワードを入力してください';
      return;
    }
    
    try {
      const entry = await VaultCrypto.decryptData(blob, pw);
      error.textContent = '';
      
      // データを表示
      document.getElementById('receive-unlock-form').style.display = 'none';
      document.getElementById('recv-name').textContent = entry.name || '—';
      document.getElementById('recv-user').textContent = entry.user || '—';
      document.getElementById('recv-pw').textContent = '••••••••';
      document.getElementById('recv-pw').classList.add('pw-hidden');
      if (entry.url) {
        document.getElementById('recv-url').textContent = entry.url;
        document.getElementById('recv-url-row').style.display = '';
      }
      document.getElementById('receive-content').style.display = 'block';
    } catch {
      error.textContent = 'パスワードが違います';
      document.getElementById('receive-pw-input').value = '';
    }
  }

  /**
   * 生体認証が登録されているか確認
   */
  async isBioRegistered() {
    return await VaultStorage.dbExists(VaultStorage.STORAGE_KEYS.BIO_CREDENTIAL);
  }

  /**
   * サービス名からアイコンを取得
   */
  getIcon(name) {
    const n = (name || '').toLowerCase();
    if (/google|gmail/.test(n)) return '🔵';
    if (/twitter|x\.com/.test(n)) return '🐦';
    if (/facebook/.test(n)) return '📘';
    if (/apple|icloud/.test(n)) return '🍎';
    if (/amazon/.test(n)) return '📦';
    if (/github/.test(n)) return '🐙';
    if (/bank|銀行/.test(n)) return '🏦';
    if (/pay/.test(n)) return '💳';
    if (/netflix/.test(n)) return '🎬';
    return '🔑';
  }

  /**
   * HTML エスケープ
   */
  escHtml(s) {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * トースト表示
   */
  showToast(msg, type = '') {
    const t = document.getElementById('toast');
    if (t) {
      t.textContent = msg;
      t.className = 'toast show' + 
        (type === 'purple' ? ' purple' : type === 'danger' ? ' danger' : '');
      setTimeout(() => t.classList.remove('show'), 2500);
    }
  }
}

// グローバルインスタンス
let vaultApp = null;

// 初期化（ページ読み込み完了時）
document.addEventListener('DOMContentLoaded', () => {
  vaultApp = new VaultApp();
});

// グローバルイベントハンドラ（HTML から呼び出し）
function unlock() { vaultApp?.handleUnlock(document.getElementById('master-input').value); }
function bioUnlock() { vaultApp?.handleBioUnlock(); }
function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (el) el.classList.add('active');
}
function openDetail(id) { vaultApp?.handleEntryClick(vaultApp.vault.find(x => x.id === id)); }
function closeDetailModal() { vaultApp?.closeDetailModal(); }
function toggleModalPw() { vaultApp?.toggleModalPassword(); }
function copyField(field) { vaultApp?.copyField(field); }
function deleteEntry() { vaultApp?.deleteEntry(); }
function checkAllBreaches() { vaultApp?.checkAllBreaches(); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VaultApp;
}
if (typeof window !== 'undefined') {
  window.VaultApp = VaultApp;
}
