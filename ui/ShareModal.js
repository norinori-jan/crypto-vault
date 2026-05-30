/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT UI — SHARE MODAL COMPONENT
 * ═══════════════════════════════════════════════════════════════════
 * 
 * 共有リンク生成・受信・表示のUIコンポーネント
 * エンドツーエンド暗号化された共有処理を担当
 */

class ShareModal {
  constructor(options = {}) {
    this.containerId = options.containerId || 'tab-share';
    this.modalId = options.modalId || 'share-result';
    this.workerUrl = options.workerUrl || '';
    this.masterPassword = options.masterPassword || '';
    
    this.onCreateShare = options.onCreateShare || (() => {});
    this.onDeleteShare = options.onDeleteShare || (() => {});
    
    this.vault = [];
    this.selectedEntryId = null;
    this.lastShareId = null;
    
    this.init();
  }

  /**
   * UI要素を初期化
   */
  init() {
    this.el = document.getElementById(this.containerId);
    if (!this.el) return;

    this.configNotice = this.el.querySelector('#share-config-notice');
    this.entryList = this.el.querySelector('#share-entry-list');
    this.expiresSelect = this.el.querySelector('#share-expires');
    this.passInput = this.el.querySelector('#share-pass');
    this.passBtn = this.el.querySelector('#share-pass-btn');
    this.createBtn = this.el.querySelector('.btn-share');
    this.resultBox = this.el.querySelector('#share-result');
    this.urlDisplay = this.el.querySelector('#share-url-display');
    this.resultInfo = this.el.querySelector('#share-result-info');
    this.errorMsg = this.el.querySelector('#share-error');
    this.copyUrlBtn = this.el.querySelector('.btn-share.btn-sm');
    this.deleteBtn = this.el.querySelector('[onclick*="deleteShare"]');

    this.passVisible = false;
    this.attachListeners();
  }

  /**
   * イベントリスナーをアタッチ
   */
  attachListeners() {
    if (this.passBtn) {
      this.passBtn.addEventListener('click', () => this.togglePassVisibility());
    }

    if (this.createBtn) {
      this.createBtn.addEventListener('click', () => this.handleCreateShare());
    }

    if (this.copyUrlBtn) {
      this.copyUrlBtn.addEventListener('click', () => this.handleCopyUrl());
    }

    if (this.deleteBtn) {
      this.deleteBtn.addEventListener('click', () => this.handleDeleteShare());
    }
  }

  /**
   * Vault データを設定
   */
  setVault(vault) {
    this.vault = vault || [];
    this.renderEntryList();
  }

  /**
   * Worker URL を設定
   */
  setWorkerUrl(url) {
    this.workerUrl = url || '';
    this.updateConfigNotice();
  }

  /**
   * マスターパスワードを設定
   */
  setMasterPassword(pw) {
    this.masterPassword = pw || '';
  }

  /**
   * 設定通知を更新
   */
  updateConfigNotice() {
    if (this.configNotice) {
      this.configNotice.style.display = this.workerUrl ? 'none' : 'block';
    }
  }

  /**
   * エントリリストをレンダリング
   */
  renderEntryList() {
    if (!this.entryList) return;

    if (!this.vault.length) {
      this.entryList.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🔑</div>
          Vaultにエントリがありません
        </div>`;
      return;
    }

    this.entryList.innerHTML = this.vault.map(e => `
      <div class="share-entry-item" data-id="${e.id}">
        <div class="vault-icon" style="width:24px;height:24px;font-size:12px">${this.getIcon(e.name)}</div>
        <div style="flex:1;font-size:13px">
          ${this.escHtml(e.name)}
          <div style="font-family:var(--mono);font-size:10px;color:var(--muted)">
            ${this.escHtml(e.user || '')}
          </div>
        </div>
        <div class="share-check">○</div>
      </div>
    `).join('');

    // クリックイベント
    this.entryList.querySelectorAll('.share-entry-item').forEach(el => {
      el.addEventListener('click', (e) => {
        this.selectEntry(el.dataset.id);
      });
    });
  }

  /**
   * エントリを選択
   */
  selectEntry(id) {
    this.entryList.querySelectorAll('.share-entry-item').forEach(item => {
      item.classList.remove('selected');
      item.querySelector('.share-check').textContent = '○';
    });

    const selected = this.entryList.querySelector(`[data-id="${id}"]`);
    if (selected) {
      selected.classList.add('selected');
      selected.querySelector('.share-check').textContent = '●';
      this.selectedEntryId = id;
    }
  }

  /**
   * パスワード表示切り替え
   */
  togglePassVisibility() {
    this.passVisible = !this.passVisible;
    if (this.passInput) {
      this.passInput.type = this.passVisible ? 'text' : 'password';
      this.passBtn.textContent = this.passVisible ? '🙈' : '👁';
    }
  }

  /**
   * 共有リンク生成
   */
  async handleCreateShare() {
    if (this.errorMsg) this.errorMsg.textContent = '';

    if (!this.selectedEntryId) {
      if (this.errorMsg) this.errorMsg.textContent = 'エントリを選択してください';
      return;
    }

    if (!this.workerUrl) {
      if (this.errorMsg) this.errorMsg.textContent = 'Worker URLを設定してください';
      return;
    }

    const entry = this.vault.find(x => x.id === this.selectedEntryId);
    if (!entry) return;

    const sharePw = this.passInput?.value || this.masterPassword;
    const hours = parseInt(this.expiresSelect?.value || 24);

    this.createBtn.disabled = true;
    this.createBtn.textContent = 'リンク生成中...';

    try {
      await this.onCreateShare({
        entry,
        password: sharePw,
        expiresInHours: hours
      });

      // 成功時に結果を表示
      if (this.resultBox) {
        this.resultBox.classList.add('visible');
      }
    } catch (e) {
      if (this.errorMsg) {
        this.errorMsg.textContent = `エラー: ${e.message}`;
      }
    } finally {
      this.createBtn.disabled = false;
      this.createBtn.textContent = '🔗 共有リンクを生成';
    }
  }

  /**
   * URL をコピー
   */
  async handleCopyUrl() {
    if (!this.urlDisplay) return;

    const url = this.urlDisplay.textContent;
    try {
      await navigator.clipboard.writeText(url);
      this.showToast('URLをコピーしました 🔗', 'purple');
    } catch (e) {
      this.showToast('コピー失敗', 'danger');
    }
  }

  /**
   * 共有リンク削除
   */
  async handleDeleteShare() {
    if (!this.lastShareId) return;

    this.deleteBtn.disabled = true;
    try {
      await this.onDeleteShare(this.lastShareId);
      if (this.resultBox) {
        this.resultBox.classList.remove('visible');
      }
      this.showToast('リンクを削除しました');
    } catch (e) {
      this.showToast(`削除失敗: ${e.message}`, 'danger');
    } finally {
      this.deleteBtn.disabled = false;
    }
  }

  /**
   * 生成結果を表示
   */
  displayResult(shareId, expiresAt, expiresInHours) {
    if (!this.urlDisplay || !this.resultInfo) return;

    this.lastShareId = shareId;
    const shareUrl = `${location.origin}${location.pathname}?s=${shareId}`;

    this.urlDisplay.textContent = shareUrl;
    this.resultInfo.innerHTML = `
      有効期限: ${new Date(expiresAt).toLocaleString('ja-JP')}<br>
      ${this.passInput?.value ? '解除PW: 別途受信者に伝えてください' : '解除PW: マスターパスワードと同じ'}
    `;

    if (this.resultBox) {
      this.resultBox.classList.add('visible');
    }
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

// EXPORTS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShareModal;
}
if (typeof window !== 'undefined') {
  window.ShareModal = ShareModal;
}
