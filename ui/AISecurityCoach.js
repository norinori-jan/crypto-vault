/**
 * ═══════════════════════════════════════════════════════════════════
 * ui/SecurityCoach.js
 * ═══════════════════════════════════════════════════════════════════
 * マルチAIプロバイダ対応 セキュリティコーチ
 *
 * 対応プロバイダ: Claude / Gemini / OpenAI
 * APIキーはエコシステム共通の localStorage キー方式を踏襲:
 *   ml_claude / ml_gemini / ml_openai
 *
 * 設計方針:
 *  - パスワード実物は絶対にAIへ送らない(統計情報のみ渡す)
 *  - CORSで直接叩けないプロバイダはプロキシURL(sc_proxy_url)経由にフォールバック
 *  - 既存 ui/*.js (VaultList, ShareModal等) と同じ
 *    { containerId, onXxx } パターンに準拠。フレームワーク・ビルド不要。
 *
 * 使い方 (index.html / vault-lab.html 側):
 *   const coach = new SecurityCoach({
 *     containerId: 'tab-coach',
 *     getVaultSummary: () => vaultApp.getCoachSummary() // 下部の実装例参照
 *   });
 */

class SecurityCoach {
  static STORAGE_KEYS = {
    CLAUDE_KEY: 'ml_claude',
    GEMINI_KEY: 'ml_gemini',
    OPENAI_KEY: 'ml_openai',
    PROVIDER: 'sc_provider',       // 'claude' | 'gemini' | 'openai'
    MODEL_PREFIX: 'sc_model_',     // sc_model_claude / sc_model_gemini / sc_model_openai
    PROXY_URL: 'sc_proxy_url',     // 任意: CORS回避用プロキシ (例: sync-workerに/ai/*を追加)
    HISTORY: 'sc_history'
  };

  static DEFAULT_MODELS = {
    claude: 'claude-sonnet-5',
    gemini: 'gemini-2.0-flash',
    openai: 'gpt-4o-mini'
  };

  static PROVIDER_LABELS = {
    claude: 'Claude',
    gemini: 'Gemini',
    openai: 'OpenAI'
  };

  constructor(options = {}) {
    this.containerId = options.containerId || 'security-coach';
    this.getVaultSummary = options.getVaultSummary || (() => null);
    this.onLog = options.onLog || (() => {});
    this.history = this.loadHistory();
    this.busy = false;

    this.render();
    this.bindEvents();
  }

  // ── 設定の読み書き ─────────────────────────────────────────
  getProvider() {
    return localStorage.getItem(SecurityCoach.STORAGE_KEYS.PROVIDER) || 'claude';
  }
  setProvider(p) {
    localStorage.setItem(SecurityCoach.STORAGE_KEYS.PROVIDER, p);
  }
  getModel(provider) {
    return localStorage.getItem(SecurityCoach.STORAGE_KEYS.MODEL_PREFIX + provider)
      || SecurityCoach.DEFAULT_MODELS[provider];
  }
  setModel(provider, model) {
    localStorage.setItem(SecurityCoach.STORAGE_KEYS.MODEL_PREFIX + provider, model);
  }
  getApiKey(provider) {
    const map = {
      claude: SecurityCoach.STORAGE_KEYS.CLAUDE_KEY,
      gemini: SecurityCoach.STORAGE_KEYS.GEMINI_KEY,
      openai: SecurityCoach.STORAGE_KEYS.OPENAI_KEY
    };
    return localStorage.getItem(map[provider]) || '';
  }
  setApiKey(provider, key) {
    const map = {
      claude: SecurityCoach.STORAGE_KEYS.CLAUDE_KEY,
      gemini: SecurityCoach.STORAGE_KEYS.GEMINI_KEY,
      openai: SecurityCoach.STORAGE_KEYS.OPENAI_KEY
    };
    localStorage.setItem(map[provider], key);
  }
  getProxyUrl() {
    return localStorage.getItem(SecurityCoach.STORAGE_KEYS.PROXY_URL) || '';
  }
  setProxyUrl(url) {
    localStorage.setItem(SecurityCoach.STORAGE_KEYS.PROXY_URL, url);
  }

  loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(SecurityCoach.STORAGE_KEYS.HISTORY) || '[]');
    } catch { return []; }
  }
  saveHistory() {
    // 直近30件のみ保持(容量対策)
    const trimmed = this.history.slice(-30);
    localStorage.setItem(SecurityCoach.STORAGE_KEYS.HISTORY, JSON.stringify(trimmed));
  }

  // ── プライバシー保護: 統計のみをコンテキスト化 ──────────────
  buildContextSummary() {
    const s = this.getVaultSummary();
    if (!s) return '(Vault統計は未提供)';
    return [
      `エントリ数: ${s.total ?? '不明'}`,
      `弱いパスワード: ${s.weakCount ?? '不明'}件`,
      `使い回し検出: ${s.reusedCount ?? '不明'}件`,
      `漏洩検出(HIBP): ${s.breachedCount ?? '不明'}件`,
      `平均エントロピー: ${s.avgEntropy != null ? s.avgEntropy.toFixed(1) + ' bit' : '不明'}`
    ].join('\n');
  }

  buildSystemPrompt() {
    return [
      'あなたは crypto-vault というパスワード管理PWAに組み込まれた、',
      '実地学習用のセキュリティコーチです。相手(nori)はホワイトハッカー系の',
      '実践学習(vault-lab: 攻撃シミュレータ/暗号Playground/CTF/脅威モデリング)を',
      '進めている開発者です。',
      '',
      '厳守事項:',
      '- 実際のパスワード文字列は絶対にやり取りしない(渡されても復唱しない)',
      '- 統計情報(件数・強度スコア)のみを根拠にアドバイスする',
      '- 「なぜその暗号技術/設定が推奨されるか」を実地学習に繋がる形で説明する',
      '- 断定的な脅し文句より、具体的な改善アクションを優先する',
      '',
      '現在のVault統計:',
      this.buildContextSummary()
    ].join('\n');
  }

  // ── プロバイダ別 API 呼び出し ─────────────────────────────
  async callProvider(provider, messages) {
    const key = this.getApiKey(provider);
    if (!key) {
      throw new Error(`${SecurityCoach.PROVIDER_LABELS[provider]} のAPIキーが未設定です(設定タブから入力してください)`);
    }
    const model = this.getModel(provider);

    try {
      if (provider === 'claude') return await this._callClaude(key, model, messages);
      if (provider === 'gemini') return await this._callGemini(key, model, messages);
      if (provider === 'openai') return await this._callOpenAI(key, model, messages);
      throw new Error('未知のプロバイダです: ' + provider);
    } catch (err) {
      // 直接呼び出し失敗(主にCORS)→ プロキシがあれば経由して再試行
      const proxyUrl = this.getProxyUrl();
      if (proxyUrl) {
        return await this._callViaProxy(proxyUrl, provider, key, model, messages);
      }
      throw err;
    }
  }

  async _callClaude(key, model, messages) {
    const system = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system,
        messages: userMessages
      })
    });
    if (!res.ok) throw new Error(`Claude APIエラー: ${res.status}`);
    const data = await res.json();
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  }

  async _callGemini(key, model, messages) {
    const system = messages.find(m => m.role === 'system')?.content || '';
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents
      })
    });
    if (!res.ok) throw new Error(`Gemini APIエラー: ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
  }

  async _callOpenAI(key, model, messages) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: 800
      })
    });
    if (!res.ok) throw new Error(`OpenAI APIエラー: ${res.status}(ブラウザ直叩きはCORSで失敗することがあります。sc_proxy_urlの設定を推奨)`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async _callViaProxy(proxyUrl, provider, key, model, messages) {
    const res = await fetch(proxyUrl.replace(/\/$/, '') + '/ai/' + provider, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, model, messages })
    });
    if (!res.ok) throw new Error(`プロキシ経由呼び出し失敗: ${res.status}`);
    const data = await res.json();
    return data.text || data.content || '';
  }

  // ── 送信処理 ────────────────────────────────────────────
  async sendMessage(userText) {
    if (this.busy || !userText.trim()) return;
    this.busy = true;
    this.appendMessage('user', userText);

    const provider = this.getProvider();
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() },
      ...this.history.slice(-8).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userText }
    ];

    this.appendMessage('assistant', '…考え中', true);

    try {
      const reply = await this.callProvider(provider, messages);
      this.replaceLastAssistant(reply || '(応答が空でした)');
      this.onLog({ provider, ok: true });
    } catch (err) {
      this.replaceLastAssistant(`⚠ エラー: ${err.message}`);
      this.onLog({ provider, ok: false, error: err.message });
    } finally {
      this.busy = false;
      this.saveHistory();
    }
  }

  // ── UI ──────────────────────────────────────────────────
  render() {
    const el = document.getElementById(this.containerId);
    if (!el) return;

    const provider = this.getProvider();
    const providerOptions = Object.keys(SecurityCoach.PROVIDER_LABELS)
      .map(p => `<option value="${p}" ${p === provider ? 'selected' : ''}>${SecurityCoach.PROVIDER_LABELS[p]}</option>`)
      .join('');

    el.innerHTML = `
      <style>
        .sc-wrap{display:flex;flex-direction:column;height:100%;font-family:inherit}
        .sc-toolbar{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--muted,#444)}
        .sc-toolbar select,.sc-toolbar button{background:var(--bg,#111);color:inherit;border:1px solid var(--muted,#444);border-radius:6px;padding:6px 8px;font-size:13px}
        .sc-settings{display:none;flex-direction:column;gap:6px;padding:8px;border-bottom:1px solid var(--muted,#444)}
        .sc-settings.open{display:flex}
        .sc-settings input{background:var(--bg,#111);color:inherit;border:1px solid var(--muted,#444);border-radius:6px;padding:6px 8px;font-size:12px}
        .sc-messages{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
        .sc-msg{max-width:85%;padding:8px 10px;border-radius:10px;font-size:13px;white-space:pre-wrap;line-height:1.4}
        .sc-msg.user{align-self:flex-end;background:var(--green,#1e5;)}
        .sc-msg.assistant{align-self:flex-start;background:rgba(255,255,255,0.08)}
        .sc-msg.pending{opacity:0.6;font-style:italic}
        .sc-input-row{display:flex;gap:6px;padding:8px;border-top:1px solid var(--muted,#444)}
        .sc-input-row input{flex:1;background:var(--bg,#111);color:inherit;border:1px solid var(--muted,#444);border-radius:6px;padding:8px}
        .sc-input-row button{border:none;border-radius:6px;padding:8px 14px;background:var(--purple,#7c5cff);color:#fff}
      </style>
      <div class="sc-wrap">
        <div class="sc-toolbar">
          <span style="font-size:12px;opacity:.7">🤖 コーチ:</span>
          <select id="sc-provider-select">${providerOptions}</select>
          <button id="sc-settings-toggle">⚙ 設定</button>
        </div>
        <div class="sc-settings" id="sc-settings-panel">
          ${Object.keys(SecurityCoach.PROVIDER_LABELS).map(p => `
            <label style="font-size:11px;opacity:.8">${SecurityCoach.PROVIDER_LABELS[p]} APIキー
              <input type="password" id="sc-key-${p}" placeholder="ml_${p}" value="${this.getApiKey(p)}">
            </label>
            <label style="font-size:11px;opacity:.8">${SecurityCoach.PROVIDER_LABELS[p]} モデル
              <input type="text" id="sc-model-${p}" value="${this.getModel(p)}">
            </label>
          `).join('')}
          <label style="font-size:11px;opacity:.8">プロキシURL(任意・CORS回避用)
            <input type="text" id="sc-proxy" placeholder="https://sync-worker.../ai" value="${this.getProxyUrl()}">
          </label>
        </div>
        <div class="sc-messages" id="sc-messages"></div>
        <div class="sc-input-row">
          <input type="text" id="sc-input" placeholder="このVaultについて質問する...">
          <button id="sc-send">送信</button>
        </div>
      </div>
    `;

    this.renderHistory();
  }

  renderHistory() {
    const box = document.getElementById('sc-messages');
    if (!box) return;
    box.innerHTML = '';
    this.history.forEach(h => this.appendMessage(h.role, h.content, false, false));
  }

  appendMessage(role, content, pending = false, push = true) {
    const box = document.getElementById('sc-messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `sc-msg ${role}${pending ? ' pending' : ''}`;
    div.textContent = content;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    if (push) this.history.push({ role, content });
    if (pending) this._pendingEl = div;
  }

  replaceLastAssistant(text) {
    if (this._pendingEl) {
      this._pendingEl.textContent = text;
      this._pendingEl.classList.remove('pending');
    }
    if (this.history.length && this.history[this.history.length - 1].role === 'assistant') {
      this.history[this.history.length - 1].content = text;
    } else {
      this.history.push({ role: 'assistant', content: text });
    }
  }

  bindEvents() {
    const el = document.getElementById(this.containerId);
    if (!el) return;

    el.querySelector('#sc-provider-select')?.addEventListener('change', (e) => {
      this.setProvider(e.target.value);
    });

    el.querySelector('#sc-settings-toggle')?.addEventListener('click', () => {
      el.querySelector('#sc-settings-panel')?.classList.toggle('open');
    });

    Object.keys(SecurityCoach.PROVIDER_LABELS).forEach(p => {
      el.querySelector(`#sc-key-${p}`)?.addEventListener('change', (e) => this.setApiKey(p, e.target.value));
      el.querySelector(`#sc-model-${p}`)?.addEventListener('change', (e) => this.setModel(p, e.target.value));
    });
    el.querySelector('#sc-proxy')?.addEventListener('change', (e) => this.setProxyUrl(e.target.value));

    const input = el.querySelector('#sc-input');
    const send = () => {
      const text = input.value;
      input.value = '';
      this.sendMessage(text);
    };
    el.querySelector('#sc-send')?.addEventListener('click', send);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }
}

// グローバル公開(既存 ui/*.js と同じ, importなしでscriptタグから利用)
if (typeof window !== 'undefined') window.SecurityCoach = SecurityCoach;

