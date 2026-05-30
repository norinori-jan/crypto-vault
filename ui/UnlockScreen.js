/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT UI — UNLOCK SCREEN COMPONENT
 * ═══════════════════════════════════════════════════════════════════
 * 
 * ロック解除画面のUIロジック
 * マスターパスワード入力 + 生体認証の統合
 */

class UnlockScreen {
  constructor(options = {}) {
    this.containerId = options.containerId || 'unlock-screen';
    this.onUnlock = options.onUnlock || (() => {});
    this.onBioRegister = options.onBioRegister || (() => {});
    this.bioSupported = options.bioSupported || false;
    this.bioRegistered = options.bioRegistered || false;
    this.isFirstTime = options.isFirstTime || false;
    
    this.pwVisible = false;
    this.init();
  }

  /**
   * UI要素を初期化
   */
  init() {
    this.el = document.getElementById(this.containerId);
    if (!this.el) return;

    this.pwInput = this.el.querySelector('input[type="password"]');
    this.bioSection = this.el.querySelector('#bio-unlock-section');
    this.bioBtn = this.el.querySelector('.bio-btn');
    this.unlockBtn = this.el.querySelector('.btn');
    this.errorMsg = this.el.querySelector('.error-msg');
    this.hint = this.el.querySelector('#unlock-hint');

    this.attachListeners();
    this.updateUI();
  }

  /**
   * イベントリスナーをアタッチ
   */
  attachListeners() {
    // マスターパスワード入力: Enter で送信
    if (this.pwInput) {
      this.pwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleUnlock();
      });
    }

    // アンロックボタン
    if (this.unlockBtn) {
      this.unlockBtn.addEventListener('click', () => this.handleUnlock());
    }

    // 生体認証ボタン
    if (this.bioBtn) {
      this.bioBtn.addEventListener('click', () => this.handleBioUnlock());
    }
  }

  /**
   * UI状態を更新
   */
  updateUI() {
    // 生体認証セクション表示判定
    if (this.bioSection) {
      this.bioSection.style.display = 
        this.bioSupported && this.bioRegistered ? '' : 'none';
    }

    // ヒントテキスト
    if (this.hint) {
      this.hint.textContent = this.isFirstTime
        ? '初回起動 — 新しいVaultを作成します'
        : 'Vaultのロックを解除してください';
    }
  }

  /**
   * マスターパスワード入力でのアンロック
   */
  async handleUnlock() {
    const pw = this.pwInput?.value || '';
    const error = this.errorMsg;

    // バリデーション
    if (!pw || pw.length < 4) {
      if (error) error.textContent = 'パスワードは4文字以上必要です';
      return;
    }

    if (error) error.textContent = '';
    this.unlockBtn.disabled = true;
    this.unlockBtn.textContent = 'アンロック中...';

    try {
      await this.onUnlock(pw);
    } catch (e) {
      if (error) error.textContent = e.message || 'アンロック失敗';
      this.pwInput.value = '';
    } finally {
      this.unlockBtn.disabled = false;
      this.unlockBtn.textContent = 'UNLOCK';
    }
  }

  /**
   * 生体認証でのアンロック
   */
  async handleBioUnlock() {
    if (!this.bioSupported || !this.bioRegistered) return;

    this.bioBtn.disabled = true;
    this.bioBtn.textContent = '認証中...';

    try {
      await this.onBioUnlock?.();
    } catch (e) {
      const error = this.el.querySelector('#unlock-error');
      if (error) error.textContent = e.message || '生体認証に失敗しました';
    } finally {
      this.bioBtn.disabled = false;
      this.bioBtn.textContent = this.getBioButtonLabel();
    }
  }

  /**
   * 生体認証ボタンのラベルを取得
   */
  getBioButtonLabel() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad/.test(ua)) return 'Face ID / Touch ID でロック解除';
    if (/Mac/.test(ua)) return 'Touch ID でロック解除';
    if (/Windows/.test(ua)) return 'Windows Hello でロック解除';
    return '生体認証でロック解除';
  }

  /**
   * エラーメッセージを表示
   */
  showError(message) {
    if (this.errorMsg) {
      this.errorMsg.textContent = message;
    }
  }

  /**
   * 画面を非表示
   */
  hide() {
    if (this.el) this.el.style.display = 'none';
  }

  /**
   * 画面を表示
   */
  show() {
    if (this.el) this.el.style.display = 'flex';
  }
}

// EXPORTS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnlockScreen;
}
if (typeof window !== 'undefined') {
  window.UnlockScreen = UnlockScreen;
}
