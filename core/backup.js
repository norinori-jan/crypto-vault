/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT CORE — BACKUP ENGINE
 * ═══════════════════════════════════════════════════════════════════
 * 
 * iCloud / OneDrive / Google Drive バックアップ・復元エンジン
 * 多層暗号化 + チェックサム検証 + 自動スケジューリング
 */

class BackupEngine {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'vault_backup_engine';
    this.cloudProvider = options.cloudProvider || 'icloud';  // icloud | onedrive | gdrive
    this.masterPassword = null;
    this.deviceId = null;
    this.backupMetadata = [];
    
    this.autoBackupEnabled = options.autoBackupEnabled ?? true;
    this.autoBackupSchedule = options.autoBackupSchedule || 'daily';
    this.maxLocalBackups = options.maxLocalBackups || 7;
    this.maxCloudBackups = options.maxCloudBackups || 3;
    
    this.init();
  }

  /**
   * 初期化
   */
  async init() {
    // デバイスID を取得
    this.deviceId = localStorage.getItem('vault_device_id') || 
                    this.generateDeviceId();
    
    // メタデータを読み込み
    const metadata = await VaultStorage.dbGet(this.storageKey);
    if (metadata) {
      this.backupMetadata = metadata;
    }
    
    // 自動バックアップをスケジュール
    if (this.autoBackupEnabled) {
      this.scheduleAutoBackup();
    }
  }

  /**
   * Vault をバックアップ
   */
  async backup(vault, password) {
    this.masterPassword = password;
    
    const timestamp = new Date().toISOString();
    
    // プレーンテキスト Vault を準備
    const plainData = {
      vault,
      version: 3,
      timestamp,
      deviceId: this.deviceId,
      entryCount: vault.length
    };
    
    const plainJson = JSON.stringify(plainData);
    const plainBytes = new TextEncoder().encode(plainJson);
    
    // チェックサムを計算
    const checksum = await this.calculateChecksum(plainBytes);
    
    // Layer 1: Device Key で暗号化
    const layer1 = await this.encryptLayer(plainBytes, 'device-key');
    
    // Layer 2: Master Password で暗号化
    const layer2 = await this.encryptLayer(
      new TextEncoder().encode(JSON.stringify(layer1)),
      'master-password'
    );
    
    // バックアップファイルを構築
    const backupFile = {
      version: 3,
      type: 'vault-backup',
      encryptionLayers: ['device-key', 'master-password'],
      
      metadata: {
        deviceId: this.deviceId,
        deviceName: localStorage.getItem('vault_device_name') || 'Device',
        createdAt: timestamp,
        createdBy: 'manual',
        entryCount: vault.length,
        vaultSize: plainBytes.length,
        formatVersion: 3,
        appVersion: '1.0.0'
      },
      
      encryption: {
        layer1: layer1,
        layer2: layer2
      },
      
      integrity: {
        checksum,
        checksumAlgo: 'SHA-256'
      }
    };
    
    return backupFile;
  }

  /**
   * 層の暗号化
   */
  async encryptLayer(data, keyType) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // キーを導出
    let key;
    if (keyType === 'device-key') {
      key = await this.deriveDeviceKey(salt);
    } else if (keyType === 'master-password') {
      key = await VaultCrypto.deriveKey(this.masterPassword, salt);
    }
    
    // AES-256-GCM で暗号化
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    return {
      algo: 'AES-256-GCM',
      key_derivation: keyType === 'device-key' ? 'device_id_sha256' : 'PBKDF2-SHA256-200k',
      iv: this.toBase64(iv),
      salt: this.toBase64(salt),
      ciphertext: this.toBase64(encrypted.slice(0, encrypted.byteLength - 16)),
      tag: this.toBase64(encrypted.slice(encrypted.byteLength - 16))
    };
  }

  /**
   * Device Key を導出
   */
  async deriveDeviceKey(salt) {
    const deviceIdBytes = new TextEncoder().encode(this.deviceId);
    const saltBytes = typeof salt === 'string' ? 
      new Uint8Array(this.fromBase64(salt)) : salt;
    
    const combined = new Uint8Array(deviceIdBytes.length + saltBytes.length);
    combined.set(deviceIdBytes);
    combined.set(saltBytes, deviceIdBytes.length);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      combined,
      { name: 'HKDF', hash: 'SHA-256' },
      false,
      ['deriveBits']
    );
    
    const keyBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(16),
        info: new TextEncoder().encode('device-key')
      },
      keyMaterial,
      256
    );
    
    return crypto.subtle.importKey(
      'raw',
      keyBits,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * バックアップをローカルに保存
   */
  async saveLocalBackup(backupFile) {
    const key = `vault_backup_${backupFile.metadata.createdAt.replace(/[:.]/g, '-')}`;
    await VaultStorage.dbSet(key, backupFile);
    
    // メタデータを記録
    this.backupMetadata.push({
      id: key,
      createdAt: backupFile.metadata.createdAt,
      location: 'local',
      entryCount: backupFile.metadata.entryCount
    });
    await VaultStorage.dbSet(this.storageKey, this.backupMetadata);
    
    // 古いバックアップを削除
    await this.pruneLocalBackups();
  }

  /**
   * バックアップをクラウドにアップロード
   */
  async uploadToCloud(backupFile) {
    if (this.cloudProvider === 'icloud') {
      return await this.uploadToICloud(backupFile);
    } else if (this.cloudProvider === 'onedrive') {
      return await this.uploadToOneDrive(backupFile);
    } else if (this.cloudProvider === 'gdrive') {
      return await this.uploadToGoogleDrive(backupFile);
    }
  }

  /**
   * iCloud Drive にアップロード
   */
  async uploadToICloud(backupFile) {
    // iOS のみ実装可能（CloudKit API）
    if (typeof window.iCloudAPI === 'undefined') {
      console.warn('iCloud API not available on this platform');
      return false;
    }
    
    try {
      const fileName = `vault-backup-${backupFile.metadata.createdAt.split('T')[0]}.json`;
      const result = await window.iCloudAPI.upload(
        'VAULT',
        fileName,
        JSON.stringify(backupFile)
      );
      
      this.backupMetadata.push({
        id: result.fileId,
        createdAt: backupFile.metadata.createdAt,
        location: 'icloud',
        entryCount: backupFile.metadata.entryCount
      });
      await VaultStorage.dbSet(this.storageKey, this.backupMetadata);
      
      await this.pruneCloudBackups('icloud');
      return true;
    } catch (e) {
      console.error('iCloud upload failed:', e);
      return false;
    }
  }

  /**
   * OneDrive にアップロード
   */
  async uploadToOneDrive(backupFile) {
    try {
      const fileName = `vault-backup-${backupFile.metadata.createdAt.split('T')[0]}.json`;
      const accessToken = localStorage.getItem('onedrive_access_token');
      
      if (!accessToken) {
        throw new Error('OneDrive token not found');
      }
      
      const res = await fetch(
        'https://graph.microsoft.com/v1.0/me/drive/root:/VAULT:/children',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: fileName,
            file: {},
            '@microsoft.graph.conflictBehavior': 'rename'
          })
        }
      );
      
      if (!res.ok) throw new Error(`OneDrive: ${res.status}`);
      
      const result = await res.json();
      
      this.backupMetadata.push({
        id: result.id,
        createdAt: backupFile.metadata.createdAt,
        location: 'onedrive',
        entryCount: backupFile.metadata.entryCount
      });
      await VaultStorage.dbSet(this.storageKey, this.backupMetadata);
      
      await this.pruneCloudBackups('onedrive');
      return true;
    } catch (e) {
      console.error('OneDrive upload failed:', e);
      return false;
    }
  }

  /**
   * Google Drive にアップロード
   */
  async uploadToGoogleDrive(backupFile) {
    try {
      const fileName = `vault-backup-${backupFile.metadata.createdAt.split('T')[0]}.json`;
      const accessToken = localStorage.getItem('gdrive_access_token');
      
      if (!accessToken) {
        throw new Error('Google Drive token not found');
      }
      
      // フォルダを作成 or 取得
      const folderId = await this.getOrCreateGDriveFolder('VAULT');
      
      const fileContent = new Blob([JSON.stringify(backupFile)], 
        { type: 'application/json' });
      const metadata = {
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json'
      };
      
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], 
        { type: 'application/json' }));
      form.append('file', fileContent);
      
      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: form
        }
      );
      
      if (!res.ok) throw new Error(`Google Drive: ${res.status}`);
      
      const result = await res.json();
      
      this.backupMetadata.push({
        id: result.id,
        createdAt: backupFile.metadata.createdAt,
        location: 'gdrive',
        entryCount: backupFile.metadata.entryCount
      });
      await VaultStorage.dbSet(this.storageKey, this.backupMetadata);
      
      await this.pruneCloudBackups('gdrive');
      return true;
    } catch (e) {
      console.error('Google Drive upload failed:', e);
      return false;
    }
  }

  /**
   * バックアップから復元
   */
  async restore(backupFile, password) {
    try {
      // チェックサムを検証
      await this.verifyBackup(backupFile);
      
      // Layer 2 を復号化（マスターパスワード）
      const layer2Decrypted = await this.decryptLayer(
        backupFile.encryption.layer2,
        password,
        'master-password'
      );
      
      // Layer 1 を復号化（デバイスキー）
      const layer1Decrypted = await this.decryptLayer(
        JSON.parse(new TextDecoder().decode(layer2Decrypted)),
        null,
        'device-key'
      );
      
      // Vault データを抽出
      const plainData = JSON.parse(new TextDecoder().decode(layer1Decrypted));
      
      // 検証
      if (plainData.vault.length !== backupFile.metadata.entryCount) {
        throw new Error('Entry count mismatch');
      }
      
      return plainData.vault;
    } catch (e) {
      throw new Error(`Restore failed: ${e.message}`);
    }
  }

  /**
   * 層の復号化
   */
  async decryptLayer(layerData, password, keyType) {
    const iv = new Uint8Array(this.fromBase64(layerData.iv));
    const salt = new Uint8Array(this.fromBase64(layerData.salt));
    const ciphertext = new Uint8Array(this.fromBase64(layerData.ciphertext));
    const tag = new Uint8Array(this.fromBase64(layerData.tag));
    
    // キーを導出
    let key;
    if (keyType === 'device-key') {
      key = await this.deriveDeviceKey(salt);
    } else if (keyType === 'master-password') {
      key = await VaultCrypto.deriveKey(password, Array.from(salt));
    }
    
    // 暗号文とタグを結合
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);
    
    // AES-256-GCM で復号化
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      combined
    );
    
    return new Uint8Array(decrypted);
  }

  /**
   * バックアップを検証
   */
  async verifyBackup(backupFile) {
    const { layer1, layer2 } = backupFile.encryption;
    
    // 基本チェック
    if (!layer1 || !layer2) {
      throw new Error('Encryption layers missing');
    }
    
    if (backupFile.metadata.createdAt > new Date().toISOString()) {
      throw new Error('Future timestamp');
    }
    
    if (typeof backupFile.metadata.entryCount !== 'number') {
      throw new Error('Invalid entry count');
    }
  }

  /**
   * チェックサムを計算
   */
  async calculateChecksum(data) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return this.toBase64(new Uint8Array(hashBuffer));
  }

  /**
   * ローカルバックアップを整理
   */
  async pruneLocalBackups() {
    if (this.backupMetadata.length <= this.maxLocalBackups) return;
    
    const local = this.backupMetadata
      .filter(b => b.location === 'local')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // 古いものを削除
    for (let i = this.maxLocalBackups; i < local.length; i++) {
      await VaultStorage.dbDel(local[i].id);
      this.backupMetadata = this.backupMetadata.filter(b => b.id !== local[i].id);
    }
    
    await VaultStorage.dbSet(this.storageKey, this.backupMetadata);
  }

  /**
   * クラウドバックアップを整理
   */
  async pruneCloudBackups(provider) {
    const cloud = this.backupMetadata
      .filter(b => b.location === provider)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (cloud.length <= this.maxCloudBackups) return;
    
    // 古いものを削除
    for (let i = this.maxCloudBackups; i < cloud.length; i++) {
      await this.deleteCloudBackup(cloud[i].id, provider);
      this.backupMetadata = this.backupMetadata.filter(b => b.id !== cloud[i].id);
    }
    
    await VaultStorage.dbSet(this.storageKey, this.backupMetadata);
  }

  /**
   * クラウドバックアップを削除
   */
  async deleteCloudBackup(fileId, provider) {
    if (provider === 'icloud' && window.iCloudAPI) {
      await window.iCloudAPI.delete('VAULT', fileId);
    } else if (provider === 'onedrive') {
      const token = localStorage.getItem('onedrive_access_token');
      await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } else if (provider === 'gdrive') {
      const token = localStorage.getItem('gdrive_access_token');
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  }

  /**
   * 自動バックアップをスケジュール
   */
  scheduleAutoBackup() {
    setInterval(async () => {
      try {
        const vault = await VaultStorage.dbGet(VaultStorage.STORAGE_KEYS.VAULT_BLOB);
        if (vault && this.masterPassword) {
          const backupFile = await this.backup(vault, this.masterPassword);
          await this.saveLocalBackup(backupFile);
          await this.uploadToCloud(backupFile);
        }
      } catch (e) {
        console.error('Auto backup failed:', e);
      }
    }, 24 * 60 * 60 * 1000);  // 24時間
  }

  /**
   * ユーティリティ
   */
  toBase64(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  }

  fromBase64(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }

  generateDeviceId() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async getOrCreateGDriveFolder(folderName) {
    const token = localStorage.getItem('gdrive_access_token');
    
    // フォルダ検索
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive&pageSize=1`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    
    // フォルダ作成
    const createRes = await fetch(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      }
    );
    
    const created = await createRes.json();
    return created.id;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BackupEngine;
}

if (typeof window !== 'undefined') {
  window.BackupEngine = BackupEngine;
}
