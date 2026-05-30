/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT UI — VAULT LIST COMPONENT
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Vault一覧表示とエントリ管理のUIコンポーネント
 * 検索・フィルタリング・詳細表示を統合
 */

class VaultList {
  constructor(options = {}) {
    this.containerId = options.containerId || 'tab-vault';
    this.onEntryClick = options.onEntryClick || (() => {});
    this.onAdd = options.onAdd || (() => {});
    this.vault = [];
    this.filtered = [];
    this.breachCache = {};

    this.init();
  }

  /**
   * UI要素を初期化
   */
  init() {
    this.el = document.getElementById(this.containerId);
    if (!this.el) return;

    this.searchInput = this.el.querySelector('#search-input');
    this.countDisplay = this.el.querySelector('#vault-count');
    this.listContainer = this.el.querySelector('#vault-list');

    this.attachListeners();
  }

  /**
   * イベントリスナーをアタッチ
   */
  attachListeners() {
    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => this.render());
    }
  }

  /**
   * Vault データを設定
   */
  setVault(vault) {
    this.vault = vault || [];
    this.render();
  }

  /**
   * 漏洩チェック結果を設定
   */
  setBreachCache(cache) {
    this.breachCache = cache || {};
    this.render();
  }

  /**
   * リストをレンダリング
   */
  render() {
    if (!this.listContainer) return;

    // 検索フィルタ
    const query = (this.searchInput?.value || '').toLowerCase();
    this.filtered = this.vault.filter(e =>
      e.name.toLowerCase().includes(query) ||
      (e.user || '').toLowerCase().includes(query)
    );

    // カウント表示
    if (this.countDisplay) {
      this.countDisplay.textContent =
        `${this.filtered.length} / ${this.vault.length} ENTRIES`;
    }

    // 空状態
    if (!this.vault.length) {
      this.listContainer.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🔐</div>
          Vaultは空です<br>GENでパスワードを生成してADDで追加
        </div>`;
      return;
    }

    // 検索結果なし
    if (!this.filtered.length) {
      this.listContainer.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🔍</div>
          結果なし
        </div>`;
      return;
    }

    // エントリリスト
    this.listContainer.innerHTML = this.filtered.map(e => `
      <div class="vault-item" data-id="${e.id}" onclick="event.stopPropagation(); this.closest('.vault-item').dispatchEvent(new CustomEvent('entryClick', {detail: '${e.id}'}))">
        <div class="vault-item-header">
          <div class="vault-icon">${this.getIcon(e.name)}</div>
          <div style="flex:1">
            <div class="vault-name">${this.escHtml(e.name)}</div>
            <div class="vault-user">${this.escHtml(e.user || '—')}</div>
          </div>
          ${this.getBreachBadge(e.id)}
        </div>
      </div>
    `).join('');

    // イベントリスナーをアタッチ
    this.listContainer.querySelectorAll('.vault-item').forEach(el => {
      el.addEventListener('entryClick', (e) => {
        const id = e.detail;
        const entry = this.vault.find(x => x.id === id);
        if (entry) this.onEntryClick(entry);
      });
    });
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
   * 漏洩バッジを取得
   */
  getBreachBadge(id) {
    const c = this.breachCache[id];
    if (!c) return '<span class="breach-badge breach-unknown">未確認</span>';
    if (c.count === 0) return '<span class="breach-badge breach-safe">✓ 安全</span>';
    if (c.count < 10) return '<span class="breach-badge breach-warn">⚠ 漏洩</span>';
    return `<span class="breach-badge breach-danger">⚠ ${c.count.toLocaleString()}件</span>`;
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
}

// EXPORTS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VaultList;
}
if (typeof window !== 'undefined') {
  window.VaultList = VaultList;
}
