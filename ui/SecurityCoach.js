/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT UI — SECURITY COACH COMPONENT
 * ═══════════════════════════════════════════════════════════════════
 * 
 * パスワード強度のリアルタイム表示・指導
 * パスワード入力時に強度・改善アドバイスを提示
 */

class SecurityCoach {
  constructor(options = {}) {
    this.containerId = options.containerId || 'security-coach-panel';
    this.passwordInputSelector = options.passwordInputSelector || 'input[type="password"]';
    this.onPasswordChange = options.onPasswordChange || (() => {});
    
    this.el = null;
    this.passwordInput = null;
    this.currentPassword = '';
    this.strengthScore = 0;
    this.feedback = [];
    this.hibpResult = null;
    this.hibpChecking = false;
    
    this.init();
  }

  /**
   * UI を初期化
   */
  init() {
    this.el = document.getElementById(this.containerId);
    if (!this.el) {
      console.warn(`[SecurityCoach] Container not found: ${this.containerId}`);
      return;
    }

    // ページ内のすべてのパスワード入力フィールドを監視
    document.addEventListener('focus', (e) => {
      if (e.target.type === 'password' || e.target.getAttribute('data-password-coach') === 'true') {
        this.attachToInput(e.target);
      }
    }, true);

    this.render();
  }

  /**
   * パスワード入力フィールドにリスナーをアタッチ
   */
  attachToInput(input) {
    this.passwordInput = input;

    input.addEventListener('input', (e) => {
      this.currentPassword = e.target.value;
      this.analyzePassword(this.currentPassword);
      this.render();
    });

    input.addEventListener('blur', () => {
      // フォーカスを失った時はコーチを非表示
      setTimeout(() => {
        this.render();
      }, 200);
    });
  }

  /**
   * パスワード強度を分析
   */
  analyzePassword(password) {
    this.feedback = [];
    let score = 0;

    if (!password) {
      this.strengthScore = 0;
      this.feedback = [];
      return;
    }

    // 長さチェック
    const length = password.length;
    if (length >= 12) {
      score += 25;
      this.feedback.push('✅ 12文字以上の長さ');
    } else if (length >= 8) {
      score += 15;
      this.feedback.push('⚠️ 8～11文字 (12文字推奨)');
    } else {
      score += 5;
      this.feedback.push('❌ 8文字未満 (12文字以上推奨)');
    }

    // 大文字チェック
    if (/[A-Z]/.test(password)) {
      score += 15;
      this.feedback.push('✅ 大文字を含む');
    } else {
      this.feedback.push('❌ 大文字を含まない');
    }

    // 小文字チェック
    if (/[a-z]/.test(password)) {
      score += 15;
      this.feedback.push('✅ 小文字を含む');
    } else {
      this.feedback.push('❌ 小文字を含まない');
    }

    // 数字チェック
    if (/[0-9]/.test(password)) {
      score += 15;
      this.feedback.push('✅ 数字を含む');
    } else {
      this.feedback.push('❌ 数字を含まない');
    }

    // 記号チェック
    if (/[!@#$%^&*\-_=+\[\]{};:',.<>?\/\\`~]/.test(password)) {
      score += 20;
      this.feedback.push('✅ 記号を含む (セキュリティ向上)');
    } else {
      this.feedback.push('💡 記号を追加するとさらに強固になります');
    }

    // 連続パターンチェック
    if (!/(.)\1{2,}/.test(password)) {
      score += 10;
      this.feedback.push('✅ 連続する同じ文字なし');
    } else {
      this.feedback.push('⚠️ 連続する同じ文字あり (aaa など)');
    }

    // 一般的な辞書ワードチェック（簡易版）
    const commonWords = [
      'password', 'admin', 'user', 'login', 'pass', 'secret',
      'qwerty', 'abc', 'letmein', 'welcome', 'monkey'
    ];
    const isCommon = commonWords.some(word => password.toLowerCase().includes(word));
    if (!isCommon) {
      score += 10;
      this.feedback.push('✅ 一般的な辞書ワードなし');
    } else {
      this.feedback.push('❌ 一般的な辞書ワードを含む');
    }

    this.strengthScore = Math.min(100, Math.max(0, score));

    // Have I Been Pwned チェック（遅延実行）
    if (password.length >= 8) {
      this.checkHIBP(password);
    }
  }

  /**
   * Have I Been Pwned で漏洩チェック（k-Anonymity）
   */
  async checkHIBP(password) {
    if (this.hibpChecking) return;
    
    try {
      this.hibpChecking = true;

      // SHA-1 ハッシュを計算
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-1', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

      // 先頭5文字のみを送信（k-Anonymity プロトコル）
      const prefix = hashHex.substring(0, 5);
      const suffix = hashHex.substring(5);

      // Have I Been Pwned API を呼び出し
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'User-Agent': 'VAULT-SecurityCoach/1.0' }
      });

      if (response.ok) {
        const text = await response.text();
        const hashes = text.split('\r\n');

        // 該当するハッシュがあるか確認
        const found = hashes.some(hash => {
          const [hashSuffix, count] = hash.split(':');
          return hashSuffix === suffix;
        });

        this.hibpResult = {
          breached: found,
          message: found 
            ? `⚠️ このパスワードは過去の漏洩データベースに含まれています。変更を強く推奨します。`
            : `✅ このパスワードは既知の漏洩データに含まれていません。`
        };
      } else {
        this.hibpResult = {
          breached: null,
          message: 'Have I Been Pwned チェックが利用できません'
        };
      }
    } catch (e) {
      this.hibpResult = {
        breached: null,
        message: 'Have I Been Pwned チェックに失敗しました（オフラインの可能性）'
      };
      console.warn('[SecurityCoach] HIBP check failed:', e);
    } finally {
      this.hibpChecking = false;
    }
  }

  /**
   * 強度スコアの色を取得
   */
  getStrengthColor() {
    if (this.strengthScore >= 80) return 'var(--safe)';
    if (this.strengthScore >= 60) return 'var(--warn)';
    if (this.strengthScore >= 40) return 'var(--share)';
    return 'var(--danger)';
  }

  /**
   * 強度スコアの説明を取得
   */
  getStrengthLabel() {
    if (this.strengthScore >= 90) return '非常に強力 🔐';
    if (this.strengthScore >= 80) return '強力 🔐';
    if (this.strengthScore >= 60) return '中程度 🔑';
    if (this.strengthScore >= 40) return '弱い ⚠️';
    return '非常に弱い 🔓';
  }

  /**
   * ブルートフォース攻撃に要する推定時間を計算
   */
  estimateCrackTime() {
    // PBKDF2: 200,000反復 + ハッシュ関数
    // 最新GPU: 1秒あたり約10^9回のハッシュ計算
    // 文字種: 大小英数字 + 記号 ≈ 95種類
    
    const possibleChars = 95; // 大小英数字+記号
    const passwordLength = this.currentPassword.length;
    const totalCombinations = Math.pow(possibleChars, passwordLength);
    const hashePerSecond = 1e9 / 200000; // GPU で PBKDF2 200k反復を実行
    
    const secondsToGuess = totalCombinations / (hashePerSecond * 2); // 平均値は総数の50%
    
    // 時間を人間が理解できるフォーマットに変換
    if (secondsToGuess < 60) return `${Math.ceil(secondsToGuess)}秒`;
    if (secondsToGuess < 3600) return `${Math.ceil(secondsToGuess / 60)}分`;
    if (secondsToGuess < 86400) return `${Math.ceil(secondsToGuess / 3600)}時間`;
    if (secondsToGuess < 31536000) return `${Math.ceil(secondsToGuess / 86400)}日`;
    return `${Math.ceil(secondsToGuess / 31536000)}年`;
  }

  /**
   * パスワード入力フィールドがフォーカスされているかチェック
   */
  isInputFocused() {
    return (
      this.passwordInput && 
      document.activeElement === this.passwordInput && 
      this.currentPassword.length > 0
    );
  }

  /**
   * HTML をレンダリング
   */
  render() {
    const isFocused = this.isInputFocused();
    const display = isFocused ? 'block' : 'none';

    const html = `
      <div class="security-coach" style="display: ${display}">
        <div class="coach-container">
          <!-- タイトル -->
          <div class="coach-title">🎓 Security Coach</div>

          ${this.currentPassword ? `
            <!-- 強度表示 -->
            <div class="strength-section">
              <div class="strength-bar">
                <div class="strength-fill" style="width: ${this.strengthScore}%; background-color: ${this.getStrengthColor()};"></div>
              </div>
              <div class="strength-info">
                <span class="strength-score">${this.strengthScore} / 100</span>
                <span class="strength-label">${this.getStrengthLabel()}</span>
              </div>
            </div>

            <!-- フィードバック -->
            <div class="feedback-section">
              <div class="feedback-list">
                ${this.feedback.map(f => `<div class="feedback-item">${f}</div>`).join('')}
              </div>
            </div>

            <!-- HIBP チェック結果 -->
            ${this.hibpResult ? `
              <div class="hibp-section">
                <div class="hibp-result ${this.hibpResult.breached ? 'breached' : 'safe'}">
                  ${this.hibpResult.message}
                </div>
              </div>
            ` : this.hibpChecking ? `
              <div class="hibp-section">
                <div class="hibp-checking">
                  🔍 Have I Been Pwned をチェック中...
                </div>
              </div>
            ` : ''}

            <!-- PBKDF2 説明 -->
            <div class="pbkdf2-section">
              <div class="pbkdf2-title">🔐 セキュリティ強度の仕組み</div>
              <div class="pbkdf2-content">
                <p>
                  このパスワードは PBKDF2-SHA256 で <strong>200,000回</strong> 反復ハッシュ化されます。
                </p>
                <p>
                  ブルートフォース攻撃に要する推定時間: <strong style="color: ${this.getStrengthColor()}">${this.estimateCrackTime()}</strong>
                </p>
                <p class="pbkdf2-details">
                  200,000 回反復することで、最新のGPUでも1秒あたり約 100 個のパスワードしか試せません。
                  このため、辞書攻撃やブルートフォース攻撃はほぼ不可能になります。
                </p>
              </div>
            </div>

            <!-- 改善提案 -->
            <div class="improvement-section">
              <div class="improvement-title">💡 さらに安全にするには</div>
              <div class="improvement-list">
                ${this.strengthScore < 80 ? '<div class="improvement-item">📝 12文字以上の長さにする</div>' : ''}
                ${!/[A-Z]/.test(this.currentPassword) ? '<div class="improvement-item">📝 大文字を追加する</div>' : ''}
                ${!/[0-9]/.test(this.currentPassword) ? '<div class="improvement-item">📝 数字を追加する</div>' : ''}
                ${!/[!@#$%^&*\-_=+\[\]{};:',.<>?\/\\`~]/.test(this.currentPassword) ? '<div class="improvement-item">📝 記号を追加する</div>' : ''}
                ${!this.hibpResult || this.hibpResult.breached ? '<div class="improvement-item">⚠️ 別のパスワードを使用する</div>' : ''}
              </div>
            </div>
          ` : `
            <div class="coach-placeholder">
              パスワードを入力してください
            </div>
          `}
        </div>
      </div>

      <style>
        .security-coach {
          padding: 20px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
          margin-bottom: 20px;
          animation: slideDown 0.2s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .coach-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .coach-title {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 2px;
          color: var(--accent);
          text-transform: uppercase;
        }

        .coach-placeholder {
          text-align: center;
          color: var(--muted);
          padding: 20px;
          font-size: 12px;
        }

        /* 強度表示 */
        .strength-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .strength-bar {
          width: 100%;
          height: 8px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 4px;
          overflow: hidden;
        }

        .strength-fill {
          height: 100%;
          transition: width 0.3s ease, background-color 0.3s ease;
        }

        .strength-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: var(--mono);
          font-size: 11px;
        }

        .strength-score {
          color: var(--accent);
          font-weight: 700;
        }

        .strength-label {
          color: var(--muted);
        }

        /* フィードバック */
        .feedback-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .feedback-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .feedback-item {
          font-size: 12px;
          padding: 6px 0;
          border-left: 2px solid var(--border);
          padding-left: 8px;
        }

        /* HIBP */
        .hibp-section {
          padding: 12px;
          background: var(--bg);
          border-radius: 4px;
        }

        .hibp-result {
          font-size: 12px;
          padding: 8px;
          border-radius: 4px;
          text-align: center;
        }

        .hibp-result.safe {
          background: rgba(48, 209, 88, 0.1);
          color: var(--safe);
          border: 1px solid var(--safe);
        }

        .hibp-result.breached {
          background: rgba(255, 59, 92, 0.1);
          color: var(--danger);
          border: 1px solid var(--danger);
        }

        .hibp-checking {
          font-size: 12px;
          color: var(--muted);
          text-align: center;
        }

        /* PBKDF2 説明 */
        .pbkdf2-section {
          padding: 12px;
          background: var(--bg);
          border: 1px solid var(--share);
          border-radius: 4px;
        }

        .pbkdf2-title {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--share);
          margin-bottom: 8px;
          letter-spacing: 1px;
        }

        .pbkdf2-content {
          font-size: 11px;
          line-height: 1.5;
          color: var(--muted);
        }

        .pbkdf2-content p {
          margin-bottom: 6px;
        }

        .pbkdf2-details {
          font-size: 10px;
          color: var(--muted);
          margin-top: 8px;
          padding: 8px;
          background: transparent;
          border-left: 2px solid var(--share);
          padding-left: 8px;
        }

        /* 改善提案 */
        .improvement-section {
          padding: 12px;
          background: var(--bg);
          border-radius: 4px;
        }

        .improvement-title {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--warn);
          margin-bottom: 8px;
          letter-spacing: 1px;
        }

        .improvement-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .improvement-item {
          font-size: 11px;
          padding: 4px 8px;
          background: rgba(255, 159, 10, 0.1);
          border-left: 2px solid var(--warn);
          padding-left: 8px;
          border-radius: 2px;
        }
      </style>
    `;

    this.el.innerHTML = html;
  }

  /**
   * 外部からパスワード分析を実行
   */
  analyzeExternalPassword(password) {
    this.currentPassword = password;
    this.analyzePassword(password);
    this.render();
  }
}

// グローバルエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityCoach;
}
window.SecurityCoach = SecurityCoach;
