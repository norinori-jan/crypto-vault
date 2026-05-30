/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT UI — SECURITY LAB COMPONENT
 * ═══════════════════════════════════════════════════════════════════
 * 
 * インタラクティブなセキュリティ学習エリア
 * PBKDF2 / AES-GCM / HIBP の仕組みを実験・体験
 */

class SecurityLab {
  constructor(options = {}) {
    this.containerId = options.containerId || 'security-lab-panel';
    this.el = null;
    
    // シミュレーション結果
    this.pbkdf2Result = null;
    this.aesCryptResult = null;
    this.aesDecryptResult = null;
    this.aesCorruptedResult = null;
    this.hibpResult = null;
    
    this.init();
  }

  /**
   * UI を初期化
   */
  init() {
    this.el = document.getElementById(this.containerId);
    if (!this.el) {
      console.warn(`[SecurityLab] Container not found: ${this.containerId}`);
      return;
    }

    this.render();
    this.attachListeners();
  }

  /**
   * イベントリスナーをアタッチ
   */
  attachListeners() {
    // PBKDF2 シミュレーション
    this.el.addEventListener('click', async (e) => {
      if (e.target.id === 'pbkdf2-simulate-btn') {
        await this.simulatePBKDF2();
      }
      if (e.target.id === 'aes-encrypt-btn') {
        await this.simulateAESEncrypt();
      }
      if (e.target.id === 'aes-decrypt-btn') {
        await this.simulateAESDecrypt();
      }
      if (e.target.id === 'aes-corrupt-btn') {
        await this.simulateAESCorrupted();
      }
      if (e.target.id === 'hibp-demo-btn') {
        await this.demonstrateHIBP();
      }
    });
  }

  /**
   * PBKDF2 シミュレーション
   */
  async simulatePBKDF2() {
    const passwordInput = this.el.querySelector('#pbkdf2-password');
    const iterationsInput = this.el.querySelector('#pbkdf2-iterations');
    
    const password = passwordInput ? passwordInput.value : 'my-secure-password';
    const iterations = parseInt(iterationsInput ? iterationsInput.value : '1000');

    if (!password) {
      alert('パスワードを入力してください');
      return;
    }

    const startTime = performance.now();

    try {
      // Salt を生成（通常は最初の1回）
      const saltArray = new Uint8Array(16);
      crypto.getRandomValues(saltArray);
      const salt = saltArray;

      // PBKDF2 を実行
      const encoder = new TextEncoder();
      const passwordBuffer = encoder.encode(password);
      
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: iterations,
          hash: 'SHA-256'
        },
        keyMaterial,
        256 // 256 bits = 32 bytes
      );

      const endTime = performance.now();
      const duration = endTime - startTime;

      const hashArray = Array.from(new Uint8Array(derivedBits));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      this.pbkdf2Result = {
        password,
        iterations,
        duration: duration.toFixed(2),
        saltHex: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
        hashHex: hashHex.substring(0, 32) + '...' // 最初の32文字のみ表示
      };

      this.updatePBKDF2Display();
    } catch (e) {
      console.error('[SecurityLab] PBKDF2 simulation failed:', e);
      alert('PBKDF2 シミュレーションに失敗しました');
    }
  }

  /**
   * AES-256-GCM 暗号化デモ
   */
  async simulateAESEncrypt() {
    const textInput = this.el.querySelector('#aes-plaintext');
    const text = textInput ? textInput.value : 'Sample secret data';

    if (!text) {
      alert('暗号化するテキストを入力してください');
      return;
    }

    try {
      // 32 byte（256-bit） の鍵を生成
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      // 12 byte の IV を生成（GCM の推奨サイズ）
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // テキストを暗号化
      const encoder = new TextEncoder();
      const plaintext = encoder.encode(text);

      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        plaintext
      );

      // 結果を16進数で表示
      const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
      const ctHex = Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('');

      this.aesCryptResult = {
        plaintext: text,
        iv: ivHex,
        ciphertext: ctHex.substring(0, 64) + '...',
        key: key
      };

      this.updateAESDisplay();
    } catch (e) {
      console.error('[SecurityLab] AES encryption failed:', e);
      alert('AES 暗号化に失敗しました');
    }
  }

  /**
   * AES-256-GCM 復号化デモ
   */
  async simulateAESDecrypt() {
    if (!this.aesCryptResult || !this.aesCryptResult.key) {
      alert('先に「暗号化」ボタンを押してください');
      return;
    }

    try {
      const key = this.aesCryptResult.key;
      const ivHex = this.aesCryptResult.iv;
      const ctHex = this.aesCryptResult.ciphertext.replace('...', '');

      // 16進数を Uint8Array に変換
      const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const ciphertext = new Uint8Array(ctHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

      // 復号化
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );

      const decoder = new TextDecoder();
      const decryptedText = decoder.decode(plaintext);

      this.aesDecryptResult = {
        success: true,
        plaintext: decryptedText,
        message: '✅ 正常に復号化されました'
      };

      this.updateAESDisplay();
    } catch (e) {
      console.error('[SecurityLab] AES decryption failed:', e);
      this.aesDecryptResult = {
        success: false,
        message: '❌ 復号化に失敗しました (データが改変されている可能性があります)'
      };
      this.updateAESDisplay();
    }
  }

  /**
   * AES-GCM 破損データ復号化デモ
   */
  async simulateAESCorrupted() {
    if (!this.aesCryptResult) {
      alert('先に「暗号化」ボタンを押してください');
      return;
    }

    try {
      const key = this.aesCryptResult.key;
      const ivHex = this.aesCryptResult.iv;
      let ctHex = this.aesCryptResult.ciphertext.replace('...', '');

      // 1文字を改変（セキュリティのデモ）
      const ctArray = ctHex.match(/.{1,2}/g);
      if (ctArray.length > 0) {
        const firstByte = parseInt(ctArray[0], 16);
        ctArray[0] = ((firstByte + 1) % 256).toString(16).padStart(2, '0');
        ctHex = ctArray.join('');
      }

      // 改変されたデータで復号化を試みる
      const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const ciphertext = new Uint8Array(ctHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );

      this.aesCorruptedResult = {
        success: true,
        message: '予期しない結果'
      };
    } catch (e) {
      this.aesCorruptedResult = {
        success: false,
        message: '❌ 破損検出！ データが1バイト改変されたため、復号化に失敗しました。\nGCM タグが改変を検知し、不正なデータを拒否します。'
      };
    }

    this.updateAESDisplay();
  }

  /**
   * HIBP k-Anonymity デモンストレーション
   */
  async demonstrateHIBP() {
    const passwordInput = this.el.querySelector('#hibp-password');
    const password = passwordInput ? passwordInput.value : 'example-password';

    if (!password) {
      alert('パスワードを入力してください');
      return;
    }

    try {
      // SHA-1 ハッシュを計算
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-1', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

      const prefix = hashHex.substring(0, 5);
      const suffix = hashHex.substring(5);

      this.hibpResult = {
        password,
        fullHash: hashHex,
        prefix,
        suffix,
        explanation: `
          このデモンストレーションでは、パスワードの SHA-1 ハッシュを計算し、
          Have I Been Pwned に送信するのは先頭 5 文字のみです。
          
          • 完全なハッシュ: ${hashHex}
          • 送信する部分（先頭5文字）: ${prefix} ← サーバーに送信
          • 残り部分（サフィックス）: ${suffix}... ← クライアント側で確認
          
          このプロトコル（k-Anonymity）により、Have I Been Pwned サーバーでも
          あなたのパスワードの全体が何であるかを知ることができません。
          あなたのパスワードはあなたのデバイスの中だけに存在します。
        `
      };

      this.updateHIBPDisplay();
    } catch (e) {
      console.error('[SecurityLab] HIBP demo failed:', e);
      alert('HIBP デモに失敗しました');
    }
  }

  /**
   * PBKDF2 結果を更新
   */
  updatePBKDF2Display() {
    const resultDiv = this.el.querySelector('#pbkdf2-result');
    if (!resultDiv || !this.pbkdf2Result) return;

    resultDiv.innerHTML = `
      <div class="lab-result">
        <div class="result-title">計算完了 ✅</div>
        <div class="result-item">
          <span class="result-label">パスワード:</span>
          <code>${this.pbkdf2Result.password}</code>
        </div>
        <div class="result-item">
          <span class="result-label">反復回数:</span>
          <code>${this.pbkdf2Result.iterations.toLocaleString()}</code>
        </div>
        <div class="result-item">
          <span class="result-label">計算時間:</span>
          <code>${this.pbkdf2Result.duration} ms</code>
        </div>
        <div class="result-item">
          <span class="result-label">Salt:</span>
          <code>${this.pbkdf2Result.saltHex}</code>
        </div>
        <div class="result-item">
          <span class="result-label">導出キー:</span>
          <code>${this.pbkdf2Result.hashHex}</code>
        </div>
        <div class="result-explanation">
          💡 反復回数を 10 倍にすると計算時間も約 10 倍になります。
          200,000 回反復することで、GPU での全探索攻撃はほぼ不可能になります。
        </div>
      </div>
    `;
  }

  /**
   * AES 結果を更新
   */
  updateAESDisplay() {
    const resultDiv = this.el.querySelector('#aes-result');
    if (!resultDiv) return;

    let html = '';

    if (this.aesCryptResult) {
      html += `
        <div class="lab-result">
          <div class="result-title">暗号化完了 ✅</div>
          <div class="result-item">
            <span class="result-label">平文:</span>
            <code>${this.aesCryptResult.plaintext}</code>
          </div>
          <div class="result-item">
            <span class="result-label">IV (12 bytes):</span>
            <code>${this.aesCryptResult.iv}</code>
          </div>
          <div class="result-item">
            <span class="result-label">暗号文:</span>
            <code>${this.aesCryptResult.ciphertext}</code>
          </div>
        </div>
      `;
    }

    if (this.aesDecryptResult) {
      html += `
        <div class="lab-result">
          <div class="result-title">${this.aesDecryptResult.success ? '復号化成功 ✅' : '復号化失敗 ❌'}</div>
          <div class="result-item">
            <span class="result-message">${this.aesDecryptResult.message}</span>
          </div>
          ${this.aesDecryptResult.success ? `
            <div class="result-item">
              <span class="result-label">復号化テキスト:</span>
              <code>${this.aesDecryptResult.plaintext}</code>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (this.aesCorruptedResult) {
      html += `
        <div class="lab-result">
          <div class="result-title">${this.aesCorruptedResult.success ? '予期しない結果' : '改変検出 ✅'}</div>
          <div class="result-item">
            <span class="result-message">${this.aesCorruptedResult.message}</span>
          </div>
          <div class="result-explanation">
            💡 GCM (Galois/Counter Mode) は認証付き暗号化です。
            データの 1 ビットでも改変されると、復号化に失敗します。
            これにより、改ざん攻撃を即座に検知できます。
          </div>
        </div>
      `;
    }

    resultDiv.innerHTML = html;
  }

  /**
   * HIBP 結果を更新
   */
  updateHIBPDisplay() {
    const resultDiv = this.el.querySelector('#hibp-result');
    if (!resultDiv || !this.hibpResult) return;

    resultDiv.innerHTML = `
      <div class="lab-result">
        <div class="result-title">k-Anonymity デモ ✅</div>
        <div class="result-item">
          <span class="result-label">パスワード:</span>
          <code>${this.hibpResult.password}</code>
        </div>
        <div class="result-item">
          <span class="result-label">SHA-1 完全ハッシュ:</span>
          <code>${this.hibpResult.fullHash}</code>
        </div>
        <div class="result-item hibp-highlight">
          <span class="result-label">🔒 送信部分（先頭5文字）:</span>
          <code style="color: var(--share);">${this.hibpResult.prefix}</code>
        </div>
        <div class="result-item hibp-highlight">
          <span class="result-label">🔐 残り部分（クライアント検証）:</span>
          <code style="color: var(--safe);">${this.hibpResult.suffix}</code>
        </div>
        <div class="result-explanation">
          ${this.hibpResult.explanation}
        </div>
      </div>
    `;
  }

  /**
   * HTML をレンダリング
   */
  render() {
    const html = `
      <div class="security-lab">
        <!-- PBKDF2 シミュレータ -->
        <div class="lab-section">
          <div class="lab-section-title">⓵ PBKDF2 シミュレータ</div>
          <div class="lab-content">
            <div class="form-group">
              <label class="field-label">パスワード</label>
              <input 
                type="text" 
                id="pbkdf2-password" 
                placeholder="例: my-secure-password" 
                value="my-secure-password"
              />
            </div>

            <div class="form-group">
              <label class="field-label">反復回数</label>
              <select id="pbkdf2-iterations">
                <option value="1000">1,000回</option>
                <option value="10000">10,000回</option>
                <option value="100000">100,000回</option>
                <option value="200000" selected>200,000回 (現在の推奨)</option>
                <option value="500000">500,000回</option>
              </select>
            </div>

            <button class="btn btn-share" id="pbkdf2-simulate-btn">計算を実行</button>

            <div id="pbkdf2-result"></div>

            <div class="lab-explanation">
              <strong>PBKDF2 とは？</strong><br>
              Password-Based Key Derivation Function 2 は、
              パスワードから暗号化キーを導出する関数です。
              反復回数を増やすことで、ブルートフォース攻撃にかかる時間を指数関数的に増加させます。
            </div>
          </div>
        </div>

        <!-- AES-256-GCM 暗号化デモ -->
        <div class="lab-section">
          <div class="lab-section-title">⓶ AES-256-GCM 暗号化デモ</div>
          <div class="lab-content">
            <div class="form-group">
              <label class="field-label">平文 (暗号化する内容)</label>
              <input 
                type="text" 
                id="aes-plaintext" 
                placeholder="例: This is secret data" 
                value="This is secret data"
              />
            </div>

            <div class="button-group">
              <button class="btn btn-share" id="aes-encrypt-btn">暗号化</button>
            </div>

            <div id="aes-result"></div>

            ${this.aesCryptResult ? `
              <div class="button-group">
                <button class="btn btn-share" id="aes-decrypt-btn">復号化</button>
                <button class="btn btn-danger" id="aes-corrupt-btn">1バイト改変して復号化</button>
              </div>
            ` : ''}

            <div class="lab-explanation">
              <strong>AES-256-GCM とは？</strong><br>
              Advanced Encryption Standard (AES) は最強の暗号化アルゴリズムです。
              GCM (Galois/Counter Mode) モードは認証付き暗号化を提供し、
              データの改ざんを即座に検知します。
            </div>
          </div>
        </div>

        <!-- HIBP k-Anonymity デモ -->
        <div class="lab-section">
          <div class="lab-section-title">⓷ Have I Been Pwned k-Anonymity の仕組み</div>
          <div class="lab-content">
            <div class="form-group">
              <label class="field-label">パスワード</label>
              <input 
                type="text" 
                id="hibp-password" 
                placeholder="例: MySecurePassword123" 
                value="MySecurePassword123"
              />
            </div>

            <button class="btn btn-share" id="hibp-demo-btn">デモを実行</button>

            <div id="hibp-result"></div>

            <div class="lab-explanation">
              <strong>k-Anonymity とは？</strong><br>
              Have I Been Pwned に問い合わせるときに、パスワード全体を送信するのではなく、
              SHA-1 ハッシュの先頭 5 文字のみを送信します。
              サーバーは残りの文字を知ることができないため、プライバシーが保護されます。
              あなたのパスワードはあなたのデバイスの中だけに存在します。
            </div>
          </div>
        </div>
      </div>

      <style>
        .security-lab {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .lab-section {
          padding: 20px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .lab-section-title {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 2px;
          color: var(--accent);
          margin-bottom: 16px;
          text-transform: uppercase;
        }

        .lab-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .button-group {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .button-group .btn {
          flex: 1;
          min-width: 120px;
          margin-top: 0;
        }

        .lab-result {
          padding: 16px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .result-title {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 2px;
          color: var(--accent);
          text-transform: uppercase;
        }

        .result-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
        }

        .result-label {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 1px;
        }

        .result-message {
          padding: 8px 12px;
          background: rgba(0, 255, 136, 0.1);
          border-left: 3px solid var(--accent);
          border-radius: 2px;
          font-family: var(--mono);
          font-size: 11px;
        }

        code {
          background: transparent;
          color: var(--accent);
          font-family: var(--mono);
          font-size: 11px;
          word-break: break-all;
          padding: 4px 8px;
          border-left: 2px solid var(--accent);
          padding-left: 8px;
        }

        .hibp-highlight code {
          padding: 6px 8px;
          border-radius: 2px;
          border: none;
        }

        .result-explanation {
          padding: 12px;
          background: transparent;
          border-left: 2px solid var(--share);
          padding-left: 12px;
          font-size: 11px;
          line-height: 1.5;
          color: var(--muted);
        }

        .lab-explanation {
          padding: 12px;
          background: transparent;
          border-left: 2px solid var(--warn);
          padding-left: 12px;
          font-size: 11px;
          line-height: 1.6;
          color: var(--muted);
        }

        .lab-explanation strong {
          color: var(--warn);
        }
      </style>
    `;

    this.el.innerHTML = html;
  }
}

// グローバルエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityLab;
}
window.SecurityLab = SecurityLab;
