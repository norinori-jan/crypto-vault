/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT CORE — DEVICE REGISTRY
 * ═══════════════════════════════════════════════════════════════════
 * 
 * マルチデバイス管理とアクセス制御
 * デバイスの登録・認証・権限管理を統合管理
 */

class DeviceRegistry {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'vault_device_registry';
    this.serverUrl = options.serverUrl || '';
    
    this.devices = [];
    this.currentDeviceId = null;
    this.init();
  }

  /**
   * 初期化
   */
  async init() {
    // ローカル Device Registry を読み込み
    const stored = await VaultStorage.dbGet(this.storageKey);
    if (stored) {
      this.devices = stored;
    }
    
    // 現在のデバイスID を取得 or 生成
    const currentId = localStorage.getItem('vault_device_id');
    if (currentId) {
      this.currentDeviceId = currentId;
    } else {
      this.currentDeviceId = this.generateDeviceId();
      localStorage.setItem('vault_device_id', this.currentDeviceId);
    }
  }

  /**
   * デバイスID を生成
   */
  generateDeviceId() {
    // UUID v4 相当の簡易実装
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    arr[6] = (arr[6] & 0x0f) | 0x40;
    arr[8] = (arr[8] & 0x3f) | 0x80;
    
    return Array.from(arr)
      .map((b, i) => {
        if (i === 4 || i === 6 || i === 8 || i === 10) return '-';
        return b.toString(16).padStart(2, '0');
      })
      .join('')
      .replace(/^(.{8})-(.{4})-(.{4})-(.{4})-(.{12})$/, '$1-$2-$3-$4-$5');
  }

  /**
   * デバイスを登録
   */
  async registerDevice(deviceInfo) {
    const {
      deviceName = 'Unknown Device',
      deviceType = 'unknown',
      masterKeyEncrypted = null,
      bioCredential = null,
      bioVaultKey = null
    } = deviceInfo;

    const deviceChallenge = crypto.getRandomValues(new Uint8Array(32));

    const device = {
      deviceId: this.currentDeviceId,
      deviceName,
      deviceType,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      
      masterKeyEncrypted,
      masterKeyAlgo: 'PBKDF2-SHA256',
      
      bioCredential,
      bioVaultKey,
      
      deviceChallenge: Array.from(deviceChallenge),
      status: 'active',
      permissions: {
        read: true,
        write: true,      // オーナーデバイス
        share: true,
        manageDevices: true
      },
      role: 'owner'
    };

    this.devices.push(device);
    await this.saveDevices();
    
    // サーバーに登録
    if (this.serverUrl) {
      await this.syncToServer(device);
    }

    return device;
  }

  /**
   * デバイスを取得
   */
  getDevice(deviceId) {
    return this.devices.find(d => d.deviceId === deviceId);
  }

  /**
   * 現在のデバイスを取得
   */
  getCurrentDevice() {
    return this.getDevice(this.currentDeviceId);
  }

  /**
   * 全デバイスを取得
   */
  getAllDevices() {
    return this.devices;
  }

  /**
   * デバイスを削除
   */
  async removeDevice(deviceId) {
    this.devices = this.devices.filter(d => d.deviceId !== deviceId);
    await this.saveDevices();
    
    // サーバーから削除
    if (this.serverUrl) {
      await fetch(`${this.serverUrl}/devices/${deviceId}`, {
        method: 'DELETE'
      });
    }
  }

  /**
   * デバイスの権限を更新
   */
  async updateDevicePermissions(deviceId, permissions) {
    const device = this.getDevice(deviceId);
    if (!device) return;

    device.permissions = { ...device.permissions, ...permissions };
    device.lastActivity = new Date().toISOString();
    
    await this.saveDevices();

    if (this.serverUrl) {
      await this.syncToServer(device);
    }
  }

  /**
   * デバイスをサーバーに同期
   */
  async syncToServer(device) {
    if (!this.serverUrl) return;

    try {
      const res = await fetch(`${this.serverUrl}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(device)
      });

      if (!res.ok) {
        throw new Error(`Sync failed: ${res.status}`);
      }

      return await res.json();
    } catch (e) {
      console.warn('Device registry sync failed:', e);
    }
  }

  /**
   * デバイスをローカルに保存
   */
  async saveDevices() {
    await VaultStorage.dbSet(this.storageKey, this.devices);
  }

  /**
   * サーバーからデバイスを同期
   */
  async syncFromServer() {
    if (!this.serverUrl) return;

    try {
      const res = await fetch(`${this.serverUrl}/devices`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.getAuthToken()}` }
      });

      if (!res.ok) {
        throw new Error(`Fetch failed: ${res.status}`);
      }

      const { devices } = await res.json();
      this.devices = devices;
      await this.saveDevices();

      return devices;
    } catch (e) {
      console.error('Device sync from server failed:', e);
      return this.devices;
    }
  }

  /**
   * 認証トークン取得（実装必要）
   */
  getAuthToken() {
    return localStorage.getItem('vault_auth_token') || '';
  }
}

// ─────────────────────────────────────────────────────────────────
// ACCESS CONTROL
// ─────────────────────────────────────────────────────────────────

/**
 * ロールベースのアクセス制御（RBAC）
 */
class AccessControl {
  constructor() {
    this.roles = {
      owner: {
        read: true,
        write: true,
        share: true,
        delete: true,
        manageDevices: true,
        manageUsers: true,
        changeRole: true,
        viewPassword: true,
        exportData: true
      },
      editor: {
        read: true,
        write: true,
        share: true,
        delete: true,
        manageDevices: false,
        manageUsers: false,
        changeRole: false,
        viewPassword: true,
        exportData: false
      },
      viewer: {
        read: true,
        write: false,
        share: true,
        delete: false,
        manageDevices: false,
        manageUsers: false,
        changeRole: false,
        viewPassword: true,
        exportData: false
      },
      guest: {
        read: true,
        write: false,
        share: false,
        delete: false,
        manageDevices: false,
        manageUsers: false,
        changeRole: false,
        viewPassword: false,
        exportData: false
      }
    };
  }

  /**
   * アクション実行権限を確認
   */
  can(role, action) {
    const rolePerms = this.roles[role];
    if (!rolePerms) return false;
    return rolePerms[action] ?? false;
  }

  /**
   * 複数のアクションをチェック
   */
  canAll(role, actions) {
    return actions.every(action => this.can(role, action));
  }

  /**
   * いずれかのアクションを実行可能か
   */
  canAny(role, actions) {
    return actions.some(action => this.can(role, action));
  }

  /**
   * ロールを検証
   */
  isValidRole(role) {
    return role in this.roles;
  }
}

// ─────────────────────────────────────────────────────────────────
// DEVICE CHALLENGE
// ─────────────────────────────────────────────────────────────────

/**
 * デバイスチャレンジ認証（複数デバイス間の信頼確立）
 */
class DeviceChallenge {
  /**
   * チャレンジを生成
   */
  static generateChallenge() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * チャレンジに署名
   */
  static async signChallenge(challenge, masterPassword) {
    // HMAC-SHA256 で署名
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(masterPassword),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(challenge)
    );

    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * チャレンジ署名を検証
   */
  static async verifyChallenge(challenge, signature, masterPassword) {
    const expected = await this.signChallenge(challenge, masterPassword);
    return expected === signature;
  }
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DeviceRegistry,
    AccessControl,
    DeviceChallenge
  };
}

if (typeof window !== 'undefined') {
  window.VaultDeviceRegistry = DeviceRegistry;
  window.VaultAccessControl = AccessControl;
  window.VaultDeviceChallenge = DeviceChallenge;
}
