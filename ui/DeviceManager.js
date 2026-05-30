/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT UI — DEVICE MANAGER COMPONENT
 * ═══════════════════════════════════════════════════════════════════
 * 
 * デバイス管理画面
 * - 登録済みデバイスの一覧
 * - デバイスの共有パスコード生成
 * - デバイスの削除・リセット
 */

class DeviceManagerComponent {
  constructor(options = {}) {
    this.containerId = options.containerId || 'tab-devices';
    this.deviceRegistry = options.deviceRegistry || null;
    this.accessControl = options.accessControl || null;
    this.onDeviceRemove = options.onDeviceRemove || (() => {});
    this.onShareCodeGenerate = options.onShareCodeGenerate || (() => {});
    
    this.shareCode = null;
    this.shareCodeExpiry = null;
  }

  /**
   * コンポーネント初期化
   */
  init() {
    this.render();
    this.attachEventListeners();
  }

  /**
   * 描画
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const currentDevice = this.deviceRegistry?.getCurrentDevice();
    const allDevices = this.deviceRegistry?.getAllDevices() || [];
    const userRole = currentDevice?.role || 'owner';

    let html = `
      <div class="device-manager">
        <h2>📱 デバイス管理</h2>
        
        <div class="device-section">
          <h3>このデバイス</h3>
          <div class="current-device">
            <div class="device-card current">
              <div class="device-icon">${this.getDeviceIcon(currentDevice?.deviceType)}</div>
              <div class="device-info">
                <div class="device-name">${this.escHtml(currentDevice?.deviceName || 'このデバイス')}</div>
                <div class="device-details">
                  <span class="device-id">ID: ${currentDevice?.deviceId.slice(0, 8)}...</span>
                  <span class="device-role">ロール: <strong>${this.translateRole(currentDevice?.role)}</strong></span>
                </div>
                <div class="device-dates">
                  <small>登録: ${new Date(currentDevice?.createdAt).toLocaleDateString('ja-JP')}</small>
                  <small>最終: ${new Date(currentDevice?.lastActivity).toLocaleDateString('ja-JP')}</small>
                </div>
              </div>
              <div class="device-actions">
                <button class="btn btn-small btn-primary" id="btn-gen-share-code">
                  🔗 共有パスコード
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="device-section" id="share-code-display" style="display:none;">
          <h3>デバイス追加用パスコード</h3>
          <div class="share-code-box">
            <div class="share-code" id="share-code-value">••••-••••</div>
            <button class="btn btn-small" id="btn-copy-share-code">📋 コピー</button>
            <button class="btn btn-small" id="btn-refresh-share-code">🔄 再生成</button>
            <div class="share-code-expiry" id="share-code-expiry">有効期限: 10分</div>
          </div>
          <p class="note">このパスコードを別のデバイスで入力することで、Vault にアクセスできます。</p>
        </div>

        <div class="device-section">
          <h3>接続済みデバイス</h3>
          ${allDevices.length === 1 
            ? '<p class="muted">このデバイスのみ登録されています。</p>'
            : `
              <div class="devices-list">
                ${allDevices
                  .filter(d => d.deviceId !== currentDevice?.deviceId)
                  .map((device, i) => this.renderDeviceCard(device, i))
                  .join('')}
              </div>
            `
          }
        </div>

        <div class="device-section">
          <h3>設定</h3>
          <div class="settings-form">
            <label>
              <input type="checkbox" id="check-auto-backup" checked>
              自動バックアップを有効にする（1日1回）
            </label>
            <label>
              <input type="checkbox" id="check-auto-lock" checked>
              アクティビティ30分後に自動ロック
            </label>
            <label>
              <input type="checkbox" id="check-sync-events" checked>
              マルチデバイス同期イベントを記録
            </label>
          </div>
        </div>

        <div class="device-section danger">
          <h3>危険なアクション</h3>
          <button class="btn btn-danger" id="btn-reset-all-devices">
            🚨 すべてのデバイスをリセット
          </button>
          <p class="warning">
            ⚠️ 警告: このアクションはすべてのデバイスから Vault を削除します。
            新しいマスターパスワードを設定する必要があります。
            復帰不可能なので、十分に注意してください。
          </p>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * デバイスカードを描画
   */
  renderDeviceCard(device, index) {
    const statusClass = device.status === 'active' ? 'active' : 'inactive';
    const statusLabel = device.status === 'active' ? '✓ アクティブ' : '休止中';
    
    const canManage = this.accessControl?.can(
      this.deviceRegistry?.getCurrentDevice()?.role,
      'manageDevices'
    ) ?? false;

    return `
      <div class="device-card ${statusClass}" data-device-id="${device.deviceId}">
        <div class="device-icon">${this.getDeviceIcon(device.deviceType)}</div>
        <div class="device-info">
          <div class="device-name">${this.escHtml(device.deviceName)}</div>
          <div class="device-details">
            <span class="device-status">${statusLabel}</span>
            <span class="device-role">ロール: ${this.translateRole(device.role)}</span>
          </div>
          <div class="device-dates">
            <small>登録: ${new Date(device.createdAt).toLocaleDateString('ja-JP')}</small>
            <small>最終: ${new Date(device.lastActivity).toLocaleDateString('ja-JP')}</small>
          </div>
        </div>
        <div class="device-actions">
          ${canManage ? `
            <button class="btn btn-small btn-warning" onclick="deviceManager.revokeDevice('${device.deviceId}')">
              🚫 無効化
            </button>
            <button class="btn btn-small btn-danger" onclick="deviceManager.removeDevice('${device.deviceId}')">
              削除
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * イベントリスナー登録
   */
  attachEventListeners() {
    const btnGenCode = document.getElementById('btn-gen-share-code');
    const btnCopyCode = document.getElementById('btn-copy-share-code');
    const btnRefreshCode = document.getElementById('btn-refresh-share-code');
    const btnReset = document.getElementById('btn-reset-all-devices');
    
    if (btnGenCode) {
      btnGenCode.addEventListener('click', () => this.generateShareCode());
    }
    if (btnCopyCode) {
      btnCopyCode.addEventListener('click', () => this.copyShareCode());
    }
    if (btnRefreshCode) {
      btnRefreshCode.addEventListener('click', () => this.generateShareCode());
    }
    if (btnReset) {
      btnReset.addEventListener('click', () => this.handleResetAllDevices());
    }
  }

  /**
   * 共有パスコードを生成
   */
  async generateShareCode() {
    // ランダムな8桁パスコード生成
    const code = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => (b % 10).toString())
      .join('');
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
    
    this.shareCode = formatted;
    this.shareCodeExpiry = Date.now() + 10 * 60 * 1000; // 10分
    
    const display = document.getElementById('share-code-display');
    const value = document.getElementById('share-code-value');
    
    if (display && value) {
      display.style.display = 'block';
      value.textContent = formatted;
      
      // 10分後に非表示
      setTimeout(() => {
        display.style.display = 'none';
      }, 10 * 60 * 1000);
    }
    
    this.onShareCodeGenerate({ code: formatted, expiry: this.shareCodeExpiry });
  }

  /**
   * 共有パスコードをコピー
   */
  async copyShareCode() {
    if (!this.shareCode) return;
    
    await navigator.clipboard.writeText(this.shareCode);
    alert('パスコードをコピーしました: ' + this.shareCode);
  }

  /**
   * デバイスを無効化（access revoke）
   */
  async revokeDevice(deviceId) {
    if (!confirm('このデバイスを無効化しますか？')) return;
    
    await this.deviceRegistry?.updateDevicePermissions(deviceId, { status: 'revoked' });
    this.render();
  }

  /**
   * デバイスを削除
   */
  async removeDevice(deviceId) {
    if (!confirm('このデバイスを削除しますか？')) return;
    
    await this.deviceRegistry?.removeDevice(deviceId);
    this.onDeviceRemove({ deviceId });
    this.render();
  }

  /**
   * すべてのデバイスをリセット
   */
  async handleResetAllDevices() {
    const confirmed = confirm(
      'すべてのデバイスをリセットしますか？\n' +
      'このアクションは復帰不可能です。\n' +
      'Vault 全体が削除されます。'
    );
    if (!confirmed) return;

    const reConfirmed = prompt(
      'マスターパスワードを入力してリセットを確認してください:'
    );
    if (!reConfirmed) return;

    try {
      // Vault 全体削除
      await VaultStorage.dbClear();
      
      // Device Registry 削除
      await VaultStorage.dbSet('vault_device_registry', []);
      
      // ローカルストレージ初期化
      localStorage.removeItem('vault_device_id');
      localStorage.removeItem('vault_auth_token');
      
      // ページ再読み込み
      location.reload();
    } catch (e) {
      alert('リセット失敗: ' + e.message);
    }
  }

  /**
   * デバイスタイプアイコン
   */
  getDeviceIcon(type) {
    const icons = {
      windows: '🪟',
      macos: '🍎',
      ios: '📱',
      android: '🤖',
      web: '🌐'
    };
    return icons[type] || '📱';
  }

  /**
   * ロール名翻訳
   */
  translateRole(role) {
    const labels = {
      owner: 'オーナー',
      editor: 'エディター',
      viewer: 'ビューアー',
      guest: 'ゲスト'
    };
    return labels[role] || role;
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

// グローバルインスタンス
let deviceManager = null;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeviceManagerComponent;
}

if (typeof window !== 'undefined') {
  window.DeviceManagerComponent = DeviceManagerComponent;
}
