/**
 * ═══════════════════════════════════════════════════════════════════
 * ui/AISecurityCoach.js  (旧 SecurityCoach.js から改名)
 * ═══════════════════════════════════════════════════════════════════
 * ※ crypto-vault には元々パスワード生成用の「SecurityCoach」が存在するため、
 *   名前衝突を避けて本モジュールは AISecurityCoach として実装する。
 *
 * マルチAIプロバイダ対応 暗号/セキュリティ学習コーチ
 *  - 対応プロバイダ: Claude / Gemini / OpenAI (ml_claude / ml_gemini / ml_openai)
 *  - AIの回答を flowchart-lab / quick-ref へ「#import=base64(JSON)」URLハッシュで
 *    送れるようにする(既存の音楽アプリ間連携と同じ方式。localStorageキー衝突を
 *    避けるため、あえて localStorage は使わずハッシュ方式に統一)
 *
 * 使い方:
 *   const coach = new AISecurityCoach({
 *     containerId: 'tab-ai-coach',
 *     getVaultSummary: () => vaultApp.getCoachSummary()
 *   });
 */

class AISecurityCoach {
  static STORAGE_KEYS = {
    CLAUDE_KEY: 'ml_claude',
    GEMINI_KEY: 'ml_gemini',
    OPENAI_KEY: 'ml_openai',
    PROVIDER: 'aisc_provider',
    MODEL_PREFIX: 'aisc_model_',
    PROXY_URL: 'aisc_proxy_url',       // CORS回避用(multidevice-worker等の/ai/*)
    HISTORY: 'aisc_history',
    FLOWCHART_URL: 'aisc_flowchart_url', // flowchart-labのベースURL
    QUICKREF_URL: 'aisc_quickref_url'    // quick-refのベースURL
  };

  static DEFAULT_MODELS = {
    claude: 'claude-sonnet-5',
    gemini: 'gemini-2.0-flash',
    openai: 'gpt-4o-mini'
  };

  static PROVIDER_LABELS = { claude: 'Claude', gemini: 'Gemini', openai: 'OpenAI' };

  // security-hub の SecBridge (bridge.js) と連携する際のフィーチャーID
  // これがアンロックされていないと flowchart-lab / quick-ref への連携ボタンは使えない
  static SECBRIDGE_EXPORT_FEATURE = 'ai_coach_export';

  constructor(options = {}) {
    this.containerId = options.containerId || 'ai-security-coach';
    this.getVaultSummary = options.getVaultSummary || (() => null);
    this.onLog = options.onLog || (() => {});
    this.history = this.loadHistory();
    this.busy = false;

    this.render();
    this.bindEvents();
  }

  // ── 設定 ──────────────────────────────────────────────────
  getProvider() { return localStorage.getItem(AISecurityCoach.STORAGE_KEYS.PROVIDER) || 'claude'; }
  setProvider(p) { localStorage.setItem(AISecurityCoach.STORAGE_KEYS.PROVIDER, p); }
  getModel(p) { return localStorage.getItem(AISecurityCoach.STORAGE_KEYS.MODEL_PREFIX + p) || AISecurityCoach.DEFAULT_MODELS[p]; }
  setModel(p, m) { localStorage.setItem(AISecurityCoach.STORAGE_KEYS.MODEL_PREFIX + p, m); }
  getApiKey(p) {
    const map = { claude: 'CLAUDE_KEY', gemini: 'GEMINI_KEY', openai: 'OPENAI_KEY' };
    return localStorage.getItem(AISecurityCoach.STORAGE_KEYS[map[p]]) || '';
  }
  setApiKey(p, key) {
    const map = { claude: 'CLAUDE_KEY', gemini: 'GEMINI_KEY', openai: 'OPENAI_KEY' };
    localStorage.setItem(AISecurityCoach.STORAGE_KEYS[map[p]], key);
  }
  getProxyUrl() { return localStorage.getItem(AISecurityCoach.STORAGE_KEYS.PROXY_URL) || ''; }
  setProxyUrl(url) { localStorage.setItem(AISecurityCoach.STORAGE_KEYS.PROXY_URL, url); }
  getFlowchartUrl() { return localStorage.getItem(AISecurityCoach.STORAGE_KEYS.FLOWCHART_URL) || ''; }
  setFlowchartUrl(url) { localStorage.setItem(AISecurityCoach.STORAGE_KEYS.FLOWCHART_URL, url); }
  getQuickRefUrl() { return localStorage.getItem(AISecurityCoach.STORAGE_KEYS.QUICKREF_URL) || ''; }
  setQuickRefUrl(url) { localStorage.setItem(AISecurityCoach.STORAGE_KEYS.QUICKREF_URL, url); }

  loadHistory() {
    try { return JSON.parse(localStorage.getItem(AISecurityCoach.STORAGE_KEYS.HISTORY) || '[]'); }
    catch { return []; }
  }
  saveHistory() {
    localStorage.setItem(AISecurityCoach.STORAGE_KEYS.HISTORY, JSON.stringify(this.history.slice(-30)));
  }

  // ── コンテキスト構築(統計のみ、パスワード実物は渡さない) ──
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
      'あなたは crypto-vault / whitehacker-lab に組み込まれた、',
      '暗号・セキュリティの実地学習コーチ(AI Security Coach)です。',
      '相手(nori)は攻撃シミュレータ/暗号Playground/CTF/脅威モデリングで',
      '実践学習を進めています。',
      '',
      '厳守事項:',
      '- 実際のパスワード文字列はやり取りしない(統計のみ扱う)',
      '- 「なぜその暗号技術/設定が推奨されるか」を仕組みから説明する',
      '- 説明は後でフローチャート化・ノート化しやすいよう、',
      '  可能なら手順やステップを明確に区切って書く',
      '',
      '現在のVault統計:',
      this.buildContextSummary()
    ].join('\n');
  }

  // ── プロバイダ呼び出し(前バージョンと同等) ──────────────
  async callProvider(provider, messages) {
    const key = this.getApiKey(provider);
    if (!key) throw new Error(`${AISecurityCoach.PROVIDER_LABELS[provider]} のAPIキーが未設定です`);
    const model = this.getModel(provider);
    try {
      if (provider === 'claude') return await this._callClaude(key, model, messages);
      if (provider === 'gemini') return await this._callGemini(key, model, messages);
      if (provider === 'openai') return await this._callOpenAI(key, model, messages);
      throw new Error('未知のプロバイダ: ' + provider);
    } catch (err) {
      const proxyUrl = this.getProxyUrl();
      if (proxyUrl) return await this._callViaProxy(proxyUrl, provider, key, model, messages);
      throw err;
    }
  }

  async _callClaude(key, model, messages) {
    const system = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model, max_tokens: 900, system, messages: userMessages })
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents })
    });
    if (!res.ok) throw new Error(`Gemini APIエラー: ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
  }

  async _callOpenAI(key, model, messages) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: messages.map(m => ({ role: m.role, content: m.content })), max_tokens: 900 })
    });
    if (!res.ok) throw new Error(`OpenAI APIエラー: ${res.status}(CORS失敗時はaisc_proxy_urlを設定)`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async _callViaProxy(proxyUrl, provider, key, model, messages) {
    const res = await fetch(proxyUrl.replace(/\/$/, '') + '/ai/' + provider, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, model, messages })
    });
    if (!res.ok) throw new Error(`プロキシ経由失敗: ${res.status}`);
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
    const pendingDiv = this.appendMessage('assistant', '…考え中', true);

    try {
      const reply = await this.callProvider(provider, messages);
      this.replaceLastAssistant(pendingDiv, reply || '(応答が空でした)');
      this.onLog({ provider, ok: true });
    } catch (err) {
      this.replaceLastAssistant(pendingDiv, `⚠ エラー: ${err.message}`);
      this.onLog({ provider, ok: false, error: err.message });
    } finally {
      this.busy = false;
      this.saveHistory();
    }
  }

  // ── 連携: flowchart-lab へ図解として送る ───────────────────
  toBase64Json(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }

  async sendToFlowchart(sourceText) {
    const flowchartUrl = this.getFlowchartUrl();
    if (!flowchartUrl) { alert('設定タブで flowchart-lab のURLを入力してください'); return; }

    // AIに「解説文 → ステップ構造(JSON)」への変換を依頼
    const structurePrompt = [
      '次の説明文を、フローチャート用のステップ構造に変換してください。',
      '出力はJSONのみ。前置き・Markdown装飾・コードフェンスは一切禁止。',
      'スキーマ: {"title": string, "nodes": [{"id": string, "label": string}], ',
      '"edges": [{"from": string, "to": string, "label": string(optional)}]}',
      '',
      '説明文:',
      sourceText
    ].join('\n');

    const provider = this.getProvider();
    let raw;
    try {
      raw = await this.callProvider(provider, [
        { role: 'system', content: '厳密にJSONのみを返すアシスタント。' },
        { role: 'user', content: structurePrompt }
      ]);
    } catch (err) {
      alert('フローチャート変換に失敗: ' + err.message);
      return;
    }

    let parsed;
    try {
      const cleaned = raw.trim().replace(/^```json/i, '').replace(/```$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      alert('AIの出力をJSONとして解釈できませんでした。もう一度試してください。');
      return;
    }

    const payload = {
      version: 1,
      source: 'ai-security-coach',
      type: 'flowchart',
      title: parsed.title || '暗号セキュリティ解説',
      nodes: parsed.nodes || [],
      edges: parsed.edges || [],
      createdAt: new Date().toISOString()
    };

    const url = flowchartUrl.replace(/#.*$/, '') + '#import=' + this.toBase64Json(payload);
    window.open(url, '_blank');
  }

  // ── 連携: quick-ref へ学習ノートとして送る ─────────────────
  // is_transfer(illust-studio) / ms_transfer(music-suite) と同じ
  // 「localStorageに書いて画面遷移」方式。GitHub Pagesは同一オリジン
  // (norinori-jan.github.io)なので別リポジトリでもlocalStorageを共有できる。
  sendToQuickRef(sourceText, titleHint) {
    const quickRefUrl = this.getQuickRefUrl();
    if (!quickRefUrl) { alert('設定タブで quick-ref のURLを入力してください'); return; }

    const payload = {
      title: titleHint || '暗号セキュリティ学習メモ',
      body: sourceText,
      tags: ['crypto-learning', 'ai-security-coach'],
      createdAt: new Date().toISOString()
    };

    localStorage.setItem('cv_transfer', JSON.stringify(payload));
    window.open(quickRefUrl, '_blank');
  }

  // ── SecBridge連携(security-hub / whitehacker-lab) ─────────
  isSecBridgeAvailable() {
    return typeof window !== 'undefined' && typeof window.SecBridge !== 'undefined';
  }

  // flowchart-lab / quick-ref へのエクスポートがアンロックされているか
  // bridge.js が読み込まれていないページでは常に許可(依存を強制しない)
  isExportUnlocked() {
    if (!this.isSecBridgeAvailable()) return true;
    try {
      return window.SecBridge.hasFeature(AISecurityCoach.SECBRIDGE_EXPORT_FEATURE);
    } catch {
      return true;
    }
  }

  // 学習完了を whitehacker-lab の進捗として記録する
  markCompletion(content) {
    if (!this.isSecBridgeAvailable()) {
      alert('SecBridge (bridge.js) がこのページに読み込まれていません');
      return;
    }
    const skillId = prompt('スキルID(例: crypto-aes-basics)を入力してください', '');
    if (!skillId) return;
    const unlocksInput = prompt('アンロックするフィーチャーID(カンマ区切り, 任意。エクスポート機能を解放するなら "ai_coach_export")', '');
    const unlocks = unlocksInput
      ? unlocksInput.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    try {
      const result = window.SecBridge.completeSkill(skillId, {
        score: null,
        meta: { source: 'ai-security-coach', summary: content.slice(0, 200) },
        unlocks
      });
      alert(
        '学習完了を記録しました' +
        (result.unlockedFeatures.length ? `\n新規アンロック: ${result.unlockedFeatures.join(', ')}` : '')
      );
      // 再描画してエクスポートボタンのロック状態を更新
      this.renderHistory();
    } catch (err) {
      alert('記録に失敗しました: ' + err.message);
    }
  }

  // ── UI ──────────────────────────────────────────────────
  render() {
    const el = document.getElementById(this.containerId);
    if (!el) return;
    const provider = this.getProvider();
    const providerOptions = Object.keys(AISecurityCoach.PROVIDER_LABELS)
      .map(p => `<option value="${p}" ${p === provider ? 'selected' : ''}>${AISecurityCoach.PROVIDER_LABELS[p]}</option>`).join('');

    el.innerHTML = `
      <style>
        .aisc-wrap{display:flex;flex-direction:column;height:100%;font-family:inherit}
        .aisc-toolbar{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--muted,#444)}
        .aisc-toolbar select,.aisc-toolbar button{background:var(--bg,#111);color:inherit;border:1px solid var(--muted,#444);border-radius:6px;padding:6px 8px;font-size:13px}
        .aisc-settings{display:none;flex-direction:column;gap:6px;padding:8px;border-bottom:1px solid var(--muted,#444)}
        .aisc-settings.open{display:flex}
        .aisc-settings input{background:var(--bg,#111);color:inherit;border:1px solid var(--muted,#444);border-radius:6px;padding:6px 8px;font-size:12px}
        .aisc-messages{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
        .aisc-msg{max-width:88%;padding:8px 10px;border-radius:10px;font-size:13px;white-space:pre-wrap;line-height:1.4}
        .aisc-msg.user{align-self:flex-end;background:var(--green,#1e5e3a)}
        .aisc-msg.assistant{align-self:flex-start;background:rgba(255,255,255,0.08)}
        .aisc-msg.pending{opacity:0.6;font-style:italic}
        .aisc-actions{display:flex;gap:6px;margin-top:4px}
        .aisc-actions button{font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--muted,#444);background:transparent;color:inherit;cursor:pointer}
        .aisc-actions button[disabled]{opacity:0.45;cursor:not-allowed}
        .aisc-input-row{display:flex;gap:6px;padding:8px;border-top:1px solid var(--muted,#444)}
        .aisc-input-row input{flex:1;background:var(--bg,#111);color:inherit;border:1px solid var(--muted,#444);border-radius:6px;padding:8px}
        .aisc-input-row button{border:none;border-radius:6px;padding:8px 14px;background:var(--purple,#7c5cff);color:#fff}
      </style>
      <div class="aisc-wrap">
        <div class="aisc-toolbar">
          <span style="font-size:12px;opacity:.7">🤖 AI Security Coach:</span>
          <select id="aisc-provider-select">${providerOptions}</select>
          <button id="aisc-settings-toggle">⚙ 設定</button>
        </div>
        <div class="aisc-settings" id="aisc-settings-panel">
          ${Object.keys(AISecurityCoach.PROVIDER_LABELS).map(p => `
            <label style="font-size:11px;opacity:.8">${AISecurityCoach.PROVIDER_LABELS[p]} APIキー
              <input type="password" id="aisc-key-${p}" value="${this.getApiKey(p)}">
            </label>
            <label style="font-size:11px;opacity:.8">${AISecurityCoach.PROVIDER_LABELS[p]} モデル
              <input type="text" id="aisc-model-${p}" value="${this.getModel(p)}">
            </label>
          `).join('')}
          <label style="font-size:11px;opacity:.8">プロキシURL(任意・CORS回避)
            <input type="text" id="aisc-proxy" value="${this.getProxyUrl()}">
          </label>
          <label style="font-size:11px;opacity:.8">flowchart-lab URL
            <input type="text" id="aisc-flowchart-url" placeholder="https://norinori-jan.github.io/flowchart-lab/" value="${this.getFlowchartUrl()}">
          </label>
          <label style="font-size:11px;opacity:.8">quick-ref URL
            <input type="text" id="aisc-quickref-url" placeholder="https://norinori-jan.github.io/quick-ref/" value="${this.getQuickRefUrl()}">
          </label>
        </div>
        <div class="aisc-messages" id="aisc-messages"></div>
        <div class="aisc-input-row">
          <input type="text" id="aisc-input" placeholder="暗号/セキュリティについて質問する...">
          <button id="aisc-send">送信</button>
        </div>
      </div>
    `;
    this.renderHistory();
  }

  buildActionBar(content) {
    const actions = document.createElement('div');
    actions.className = 'aisc-actions';
    const unlocked = this.isExportUnlocked();

    actions.innerHTML = `
      <button class="aisc-to-flowchart" ${unlocked ? '' : 'disabled title="whitehacker-labでスキルを完了するとアンロックされます"'}>
        ${unlocked ? '📊 flowchart-labへ' : '🔒 flowchart-lab'}
      </button>
      <button class="aisc-to-quickref" ${unlocked ? '' : 'disabled title="whitehacker-labでスキルを完了するとアンロックされます"'}>
        ${unlocked ? '📝 quick-refへ' : '🔒 quick-ref'}
      </button>
      <button class="aisc-mark-complete">✅ 学習完了を記録</button>
    `;

    if (unlocked) {
      actions.querySelector('.aisc-to-flowchart').addEventListener('click', () => this.sendToFlowchart(content));
      actions.querySelector('.aisc-to-quickref').addEventListener('click', () => this.sendToQuickRef(content));
    } else {
      actions.querySelector('.aisc-to-flowchart').addEventListener('click', () => {
        alert('flowchart-lab/quick-refへの連携は、whitehacker-labでスキルを完了して\n"ai_coach_export" をアンロックすると使えるようになります');
      });
      actions.querySelector('.aisc-to-quickref').addEventListener('click', () => {
        alert('flowchart-lab/quick-refへの連携は、whitehacker-labでスキルを完了して\n"ai_coach_export" をアンロックすると使えるようになります');
      });
    }
    actions.querySelector('.aisc-mark-complete').addEventListener('click', () => this.markCompletion(content));

    return actions;
  }

  renderHistory() {
    const box = document.getElementById('aisc-messages');
    if (!box) return;
    box.innerHTML = '';
    this.history.forEach(h => this.appendMessage(h.role, h.content, false, false));
  }

  appendMessage(role, content, pending = false, push = true) {
    const box = document.getElementById('aisc-messages');
    if (!box) return null;
    const wrap = document.createElement('div');

    const bubble = document.createElement('div');
    bubble.className = `aisc-msg ${role}${pending ? ' pending' : ''}`;
    bubble.textContent = content;
    wrap.appendChild(bubble);

    if (role === 'assistant' && !pending) {
      wrap.appendChild(this.buildActionBar(content));
    }

    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
    if (push) this.history.push({ role, content });
    return bubble;
  }

  replaceLastAssistant(bubbleEl, text) {
    if (bubbleEl) {
      bubbleEl.textContent = text;
      bubbleEl.classList.remove('pending');
      // 送信後に flowchart/quick-ref ボタンを付与
      const wrap = bubbleEl.parentElement;
      if (wrap && !wrap.querySelector('.aisc-actions')) {
        wrap.appendChild(this.buildActionBar(text));
      }
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
    el.querySelector('#aisc-provider-select')?.addEventListener('change', e => this.setProvider(e.target.value));
    el.querySelector('#aisc-settings-toggle')?.addEventListener('click', () => el.querySelector('#aisc-settings-panel')?.classList.toggle('open'));
    Object.keys(AISecurityCoach.PROVIDER_LABELS).forEach(p => {
      el.querySelector(`#aisc-key-${p}`)?.addEventListener('change', e => this.setApiKey(p, e.target.value));
      el.querySelector(`#aisc-model-${p}`)?.addEventListener('change', e => this.setModel(p, e.target.value));
    });
    el.querySelector('#aisc-proxy')?.addEventListener('change', e => this.setProxyUrl(e.target.value));
    el.querySelector('#aisc-flowchart-url')?.addEventListener('change', e => this.setFlowchartUrl(e.target.value));
    el.querySelector('#aisc-quickref-url')?.addEventListener('change', e => this.setQuickRefUrl(e.target.value));

    const input = el.querySelector('#aisc-input');
    const send = () => { const t = input.value; input.value = ''; this.sendMessage(t); };
    el.querySelector('#aisc-send')?.addEventListener('click', send);
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  }
}

if (typeof window !== 'undefined') window.AISecurityCoach = AISecurityCoach;

