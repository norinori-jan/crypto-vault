/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT UI — BACKUP SETTINGS COMPONENT
 * ═══════════════════════════════════════════════════════════════════
 * 
 * バックアップ・復元UI
 */

class BackupSettingsComponent {
  constructor(options = {}) {
    this.containerId = options.containerId || 'tab-backup';
    this.backupEngine = options.backupEngine || null;
    this.onBackupComplete = options.onBackupComplete || (() => {});
    this.onRestoreComplete = options.onRestoreComplete || (() => {});
  }

  /**
   * 初期化
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

    const metadata = this.backupEngine?.backupMetadata || [];
    const localBackups = metadata.filter(b => b.location === 'local');
    const cloudBackups = metadata.filter(b => b.location !== 'local');

    let html = `
      <div class="backup-settings">
        <h2>💾 バックアップ・復元</h2>
        
        <div class="backup-section">
          <h3>自動バックアップ</h3>
          <div class="settings-group">
            <label>
              <input type="checkbox" id="check-auto-backup" checked>
              自動バックアップを有効にする
            </label>
            <div class="setting-detail">
              <label>スケジュール:
                <select id="select-backup-schedule">
                  <option value="daily" selected>毎日（00:00 UTC）</option>
                  <option value="weekly">毎週（日曜日）</option>
                  <option value="manual">手動のみ</option>
                </select>
              </label>
            </div>
            <div class="setting-detail">
              <label>
                <input type="checkbox" id="check-backup-on-pw-change" checked>
                パスワード変更時にもバックアップを実行
              </label>
            </div>
          </div>
        </div>

        <div class="backup-section">
          <h3>クラウドプロバイダ</h3>
          <div class="provider-selector">
            <label>
              <input type="radio" name="cloud-provider" value="icloud" checked>
              ☁️ iCloud Drive（iOS/Mac推奨）
            </label>
            <label>
              <input type="radio" name="cloud-provider" value="onedrive">
              🪟 OneDrive（Windows推奨）
            </label>
            <label>
              <input type="radio" name="cloud-provider" value="gdrive">
              📁 Google Drive（クロスプラットフォーム）
            </label>
          </div>
        </div>

        <div class="backup-section">
          <h3>バックアップ操作</h3>
          <div class="backup-actions">
            <button class="btn btn-primary" id="btn-backup-now">
              💾 バックアップを作成
            </button>
            <button class="btn btn-secondary" id="btn-restore">
              📥 バックアップから復元
            </button>
          </div>
        </div>

        <div class="backup-section">
          <h3>バックアップ履歴</h3>
          
          ${localBackups.length > 0 ? `
            <div class="backup-list">
              <h4>ローカルバックアップ</h4>
              ${localBackups
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5)
                .map((backup, i) => this.renderBackupItem(backup, i))
                .join('')}
              <p class="backup-note">最新 ${Math.min(5, localBackups.length)} 個を表示</p>
            </div>
          ` : '<p class="muted">ローカルバックアップがありません</p>'}
          
          ${cloudBackups.length > 0 ? `
            <div class="backup-list">
              <h4>クラウドバックアップ</h4>
              ${cloudBackups
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5)
                .map((backup, i) => this.renderBackupItem(backup, i))
                .join('')}
              <p class="backup-note">最新 ${Math.min(5, cloudBackups.length)} 個を表示</p>
            </div>
          ` : '<p class="muted">クラウドバックアップがありません</p>'}
        </div>

        <div class="backup-section info">
          <h3>ℹ️ 情報</h3>
          <ul>
            <li>バックアップは<strong>2層暗号化</strong>（デバイスキー + マスターパスワード）</li>
            <li>サーバーは復号化不可（エンドツーエンド暗号化）</li>
            <li>ローカルバックアップは最新7世代を保持</li>
            <li>クラウドバックアップは最新3世代を保持</li>
            <li>復元時にマスターパスワードが必須</li>
          </ul>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * バックアップアイテムを描画
   */
  renderBackupItem(backup, index) {
    const date = new Date(backup.createdAt);
    const location = backup.location === 'local' ? '📱 ローカル' : 
                     backup.location === 'icloud' ? '☁️ iCloud' :
                     backup.location === 'onedrive' ? '🪟 OneDrive' :
                     '📁 Google Drive';

    return `
      <div class="backup-item" data-backup-id="${backup.id}">
        <div class="backup-info">
          <div class="backup-date">${date.toLocaleDateString('ja-JP')} ${date.toLocaleTimeString('ja-JP')}</div>
          <div class="backup-details">
            <span>${location}</span>
            <span class="entry-count">${backup.entryCount} エントリ</span>
          </div>
        </div>
        <div class="backup-item-actions">
          <button class="btn btn-small" onclick="backupSettings.restoreFrom('${backup.id}')">
            📥 復元
          </button>
          <button class="btn btn-small btn-danger" onclick="backupSettings.deleteBackup('${backup.id}')">
            🗑️ 削除
          </button>
        </div>
      </div>
    `;
  }

  /**
   * イベントリスナー登録
   */
  attachEventListeners() {
    const btnBackupNow = document.getElementById('btn-backup-now');
    const btnRestore = document.getElementById('btn-restore');
    
    if (btnBackupNow) {
      btnBackupNow.addEventListener('click', () => this.handleBackupNow());
    }
    if (btnRestore) {
      btnRestore.addEventListener('click', () => this.handleRestore());
    }
  }

  /**
   * 今すぐバックアップ
   */
  async handleBackupNow() {
    const pw = prompt('マスターパスワードを入力してください:');
    if (!pw) return;

    const btn = document.getElementById('btn-backup-now');
    btn.disabled = true;
    btn.textContent = 'バックアップ中...';

    try {
      const vault = await VaultStorage.dbGet(VaultStorage.STORAGE_KEYS.VAULT_BLOB);
      if (!vault) {
        alert('Vault データが見つかりません');
        return;
      }

      // バックアップ作成
      const backupFile = await this.backupEngine.backup(vault, pw);
      
      // ローカル保存
      await this.backupEngine.saveLocalBackup(backupFile);
      
      // クラウドアップロード
      const cloudSuccess = await this.backupEngine.uploadToCloud(backupFile);
      
      const msg = cloudSuccess 
        ? 'バックアップを作成しました ✓' 
        : 'ローカルのみ保存されました（クラウドアップロードは失敗）';
      alert(msg);
      
      this.onBackupComplete();
      this.render();
    } catch (e) {
      alert('バックアップ失敗: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 バックアップを作成';
    }
  }

  /**
   * 復元画面を表示
   */
  async handleRestore() {
    const pw = prompt('マスターパスワードを入力してください:');
    if (!pw) return;

    // バックアップ一覧を表示
    const metadata = this.backupEngine?.backupMetadata || [];
    const backupList = metadata
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    if (backupList.length === 0) {
      alert('バックアップがありません');
      return;
    }

    // 選択ダイアログ
    let options = backupList.map((b, i) => {
      const date = new Date(b.createdAt).toLocaleString('ja-JP');
      return `${i + 1}. ${date} (${b.entryCount} エントリ)`;
    }).join('\n');

    const selected = prompt('復元するバックアップを選択してください:\n' + options);
    if (!selected) return;

    const idx = parseInt(selected) - 1;
    if (idx < 0 || idx >= backupList.length) {
      alert('無効な選択');
      return;
    }

    await this.restoreFrom(backupList[idx].id, pw);
  }

  /**
   * バックアップから復元
   */
  async restoreFrom(backupId, password = null) {
    if (!password) {
      password = prompt('マスターパスワードを入力してください:');
      if (!password) return;
    }

    try {
      const backupFile = await VaultStorage.dbGet(backupId);
      if (!backupFile) {
        alert('バックアップが見つかりません');
        return;
      }

      const restoredVault = await this.backupEngine.restore(backupFile, password);
      
      // Vault を復元
      const encrypted = await VaultCrypto.encryptData(restoredVault, password);
      await VaultStorage.dbSet(VaultStorage.STORAGE_KEYS.VAULT_BLOB, encrypted);
      
      alert(`✓ 復元完了\n${restoredVault.length} エントリを復元しました`);
      this.onRestoreComplete();
    } catch (e) {
      alert('復元失敗: ' + e.message);
    }
  }

  /**
   * バックアップを削除
   */
  async deleteBackup(backupId) {
    if (!confirm('このバックアップを削除しますか？')) return;

    try {
      await VaultStorage.dbDel(backupId);
      
      const metadata = this.backupEngine.backupMetadata;
      this.backupEngine.backupMetadata = metadata.filter(b => b.id !== backupId);
      await VaultStorage.dbSet(this.backupEngine.storageKey, 
        this.backupEngine.backupMetadata);
      
      alert('削除しました');
      this.render();
    } catch (e) {
      alert('削除失敗: ' + e.message);
    }
  }
}

let backupSettings = null;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BackupSettingsComponent;
}

if (typeof window !== 'undefined') {
  window.BackupSettingsComponent = BackupSettingsComponent;
}
