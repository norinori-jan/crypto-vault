/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT UI — SECURITY DASHBOARD COMPONENT
 * ═══════════════════════════════════════════════════════════════════
 * 
 * セキュリティスコアの集約表示・管理
 * 各セキュリティ機能のステータスと改善推奨を表示
 */

class SecurityDashboard {
  constructor(options = {}) {
    this.vaultApp = options.vaultApp || null;
    this.containerId = options.containerId || 'security-dashboard-panel';
    
    // セキュリティスコア履歴 (30日)
    this.scoreHistory = this.loadScoreHistory() || this.initScoreHistory();
    
    // 機能ステータス
    this.features = {
      masterPassword: false,
      bioAuth: false,
      backup: false,
      deviceManager: false,
      hibpCheck: false
    };
    
    this.el = null;
    this.init();
  }

  /**
   * スコア履歴を初期化（30日間のダミーデータ）
   */
  initScoreHistory() {
    const history = [];
    const today = new Date();
    let currentScore = 50; // 基本点

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // 日々のスコア変動をシミュレート
      if (i % 10 === 0) currentScore += Math.floor(Math.random() * 5) - 2;
      if (i % 15 === 0) currentScore += 3; // 改善イベント
      
      currentScore = Math.max(0, Math.min(100, currentScore));
      
      history.push({
        date: date.toISOString().split('T')[0],
        score: currentScore
      });
    }

    return history;
  }

  /**
   * LocalStorage からスコア履歴を復元
   */
  loadScoreHistory() {
    try {
      const stored = localStorage.getItem('vault_score_history');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * スコア履歴を LocalStorage に保存
   */
  saveScoreHistory() {
    try {
      localStorage.setItem('vault_score_history', JSON.stringify(this.scoreHistory));
    } catch (e) {
      console.warn('[SecurityDashboard] Failed to save score history:', e);
    }
  }

  /**
   * UI を初期化
   */
  init() {
    this.el = document.getElementById(this.containerId);
    if (!this.el) {
      console.warn(`[SecurityDashboard] Container not found: ${this.containerId}`);
      return;
    }

    this.updateFeatureStatus();
    this.render();
  }

  /**
   * 機能ステータスを更新
   */
  updateFeatureStatus() {
    // マスターパスワード: 設定済みかチェック
    this.features.masterPassword = !!localStorage.getItem('vault_master_key');

    // 生体認証: 登録済みかチェック
    try {
      const bioData = localStorage.getItem('vault_bio_data');
      this.features.bioAuth = bioData && JSON.parse(bioData).credentialId ? true : false;
    } catch (e) {
      this.features.bioAuth = false;
    }

    // バックアップ: 最近のバックアップがあるかチェック
    try {
      const backups = localStorage.getItem('vault_backups');
      if (backups) {
        const backupList = JSON.parse(backups);
        const lastBackup = backupList[0];
        const lastBackupTime = new Date(lastBackup.createdAt);
        const daysSince = (Date.now() - lastBackupTime) / (1000 * 60 * 60 * 24);
        this.features.backup = daysSince <= 7; // 7日以内なら OK
      }
    } catch (e) {
      this.features.backup = false;
    }

    // デバイス管理: 複数デバイス登録済みかチェック
    try {
      const deviceRegistry = localStorage.getItem('vault_device_registry');
      if (deviceRegistry) {
        const registry = JSON.parse(deviceRegistry);
        this.features.deviceManager = registry.devices && registry.devices.length > 1;
      }
    } catch (e) {
      this.features.deviceManager = false;
    }

    // HIBP チェック: 最近チェック済みかチェック
    try {
      const lastHibpCheck = localStorage.getItem('vault_last_hibp_check');
      if (lastHibpCheck) {
        const checkTime = new Date(lastHibpCheck);
        const daysSince = (Date.now() - checkTime) / (1000 * 60 * 60 * 24);
        this.features.hibpCheck = daysSince <= 7; // 7日以内なら OK
      }
    } catch (e) {
      this.features.hibpCheck = false;
    }
  }

  /**
   * セキュリティスコアを計算
   * @returns {number} 0-100 のスコア
   */
  calculateScore() {
    let score = 50; // 基本点

    // マスターパスワード強度 (0-15点)
    if (this.features.masterPassword) {
      const masterKey = localStorage.getItem('vault_master_key');
      if (masterKey && masterKey.length > 20) {
        score += 15; // 強力
      } else if (masterKey && masterKey.length > 10) {
        score += 10; // 中程度
      } else {
        score += 5; // 弱い
      }
    }

    // 生体認証登録 (0-15点)
    if (this.features.bioAuth) {
      score += 15;
    }

    // バックアップ状態 (0-15点)
    if (this.features.backup) {
      score += 15;
    }

    // デバイス管理 (0-10点)
    if (this.features.deviceManager) {
      score += 10;
    }

    // HIBP 漏洩チェック (0-10点)
    if (this.features.hibpCheck) {
      score += 10;
    }

    // ボーナス (0-5点) — すべてクリア
    if (
      this.features.masterPassword &&
      this.features.bioAuth &&
      this.features.backup &&
      this.features.deviceManager &&
      this.features.hibpCheck
    ) {
      score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * 現在のスコアに基づいて色を返す
   */
  getScoreColor(score) {
    if (score >= 80) return 'var(--safe)'; // 🟢 安全
    if (score >= 60) return 'var(--warn)'; // 🟡 注意
    return 'var(--danger)'; // 🔴 危険
  }

  /**
   * スコアに基づいた説明文
   */
  getScoreDescription(score) {
    if (score >= 90) return '優秀です！セキュリティ体制が整備されています';
    if (score >= 80) return '良好です。いくつかの推奨事項がありますが、十分安全です';
    if (score >= 70) return '中程度です。改善の余地があります';
    if (score >= 50) return '弱めです。重要なセキュリティ機能が不足しています';
    return '要注意です。すぐに改善してください';
  }

  /**
   * 改善推奨事項を取得
   */
  getRecommendations() {
    const recommendations = [];

    if (!this.features.masterPassword) {
      recommendations.push({
        priority: 'high',
        title: 'マスターパスワードを設定',
        description: 'Vault 全体を保護するマスターパスワードがまだ設定されていません',
        action: 'マスターパスワードを設定'
      });
    }

    if (!this.features.bioAuth) {
      recommendations.push({
        priority: 'high',
        title: '生体認証を登録',
        description: 'Face ID / Touch ID / Windows Hello で、より安全かつ手軽にロック解除できます',
        action: '生体認証を登録'
      });
    }

    if (!this.features.backup) {
      recommendations.push({
        priority: 'high',
        title: 'バックアップを作成',
        description: 'iCloud Drive / OneDrive に暗号化されたバックアップを配置します',
        action: 'バックアップを今すぐ作成'
      });
    }

    if (!this.features.deviceManager) {
      recommendations.push({
        priority: 'medium',
        title: '別デバイスを登録',
        description: 'iPhone と PC で同じ Vault にアクセスするため、デバイスを追加登録します',
        action: 'デバイスを登録'
      });
    }

    if (!this.features.hibpCheck) {
      recommendations.push({
        priority: 'medium',
        title: 'パスワード漏洩チェック',
        description: 'Have I Been Pwned で、使用中のパスワードが過去の漏洩データに含まれていないかチェックします',
        action: 'チェックを実行'
      });
    }

    return recommendations;
  }

  /**
   * HTML をレンダリング
   */
  render() {
    const score = this.calculateScore();
    const scoreColor = this.getScoreColor(score);
    const scoreDesc = this.getScoreDescription(score);
    const recommendations = this.getRecommendations();
    
    // 過去30日のスコア変化
    const prevScore = this.scoreHistory.length > 1 
      ? this.scoreHistory[this.scoreHistory.length - 2].score 
      : score;
    const scoreChange = score - prevScore;
    const changeArrow = scoreChange > 0 ? '↑' : scoreChange < 0 ? '↓' : '→';
    const changeColor = scoreChange > 0 ? 'var(--safe)' : scoreChange < 0 ? 'var(--danger)' : 'var(--muted)';

    const html = `
      <div class="security-dashboard">
        <!-- スコアセクション -->
        <div class="score-section">
          <div class="score-display">
            <div class="score-number" style="color: ${scoreColor}">
              ${score}
            </div>
            <div class="score-max">/100</div>
          </div>
          <div class="score-info">
            <div class="score-label">セキュリティスコア</div>
            <div class="score-description">${scoreDesc}</div>
            <div class="score-change" style="color: ${changeColor}">
              ${changeArrow} 過去30日: ${Math.abs(scoreChange)} ポイント
            </div>
          </div>
        </div>

        <!-- 機能チェックリスト -->
        <div class="features-section">
          <div class="section-title">セキュリティ機能のステータス</div>
          <div class="feature-list">
            ${this.renderFeature('マスターパスワード', this.features.masterPassword)}
            ${this.renderFeature('生体認証', this.features.bioAuth)}
            ${this.renderFeature('バックアップ', this.features.backup)}
            ${this.renderFeature('デバイス管理', this.features.deviceManager)}
            ${this.renderFeature('パスワード漏洩チェック', this.features.hibpCheck)}
          </div>
        </div>

        <!-- 改善推奨事項 -->
        <div class="recommendations-section">
          <div class="section-title">セキュリティ強化の推奨</div>
          ${recommendations.length > 0 
            ? `<div class="recommendations-list">
                 ${recommendations.map(r => this.renderRecommendation(r)).join('')}
               </div>`
            : `<div class="recommendations-empty">
                 🎉 すべてのセキュリティ機能が有効です！
               </div>`
          }
        </div>

        <!-- スコア計算ロジック説明 -->
        <div class="logic-section">
          <div class="section-title">スコア計算ロジック</div>
          <div class="logic-details">
            <div class="logic-item">
              <span class="logic-label">基本点:</span>
              <span class="logic-value">50点</span>
            </div>
            <div class="logic-item">
              <span class="logic-label">マスターパスワード強度:</span>
              <span class="logic-value">0～15点</span>
            </div>
            <div class="logic-item">
              <span class="logic-label">生体認証登録:</span>
              <span class="logic-value">0～15点</span>
            </div>
            <div class="logic-item">
              <span class="logic-label">バックアップ状態:</span>
              <span class="logic-value">0～15点</span>
            </div>
            <div class="logic-item">
              <span class="logic-label">デバイス管理:</span>
              <span class="logic-value">0～10点</span>
            </div>
            <div class="logic-item">
              <span class="logic-label">HIBP チェック:</span>
              <span class="logic-value">0～10点</span>
            </div>
            <div class="logic-item logic-bonus">
              <span class="logic-label">ボーナス (全機能有効):</span>
              <span class="logic-value">5点</span>
            </div>
          </div>
        </div>

        <!-- グラフセクション（簡易版） -->
        <div class="graph-section">
          <div class="section-title">過去30日のスコア推移</div>
          <div class="graph-container">
            <svg class="score-graph" width="100%" height="120" style="max-width: 100%;">
              ${this.renderScoreGraph()}
            </svg>
          </div>
        </div>
      </div>

      <style>
        .security-dashboard {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* スコア表示 */
        .score-section {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 20px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .score-display {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }

        .score-number {
          font-size: 48px;
          font-weight: 700;
          font-family: var(--mono);
          text-shadow: 0 0 20px currentColor;
        }

        .score-max {
          font-size: 18px;
          color: var(--muted);
          font-family: var(--mono);
        }

        .score-info {
          flex: 1;
        }

        .score-label {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 2px;
          margin-bottom: 4px;
        }

        .score-description {
          font-size: 13px;
          line-height: 1.4;
          margin-bottom: 8px;
        }

        .score-change {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 1px;
        }

        /* セクションタイトル */
        .section-title {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 2px;
          color: var(--accent);
          margin-bottom: 12px;
          text-transform: uppercase;
        }

        /* 機能リスト */
        .feature-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 4px;
          font-size: 12px;
        }

        .feature-icon {
          flex-shrink: 0;
          font-size: 18px;
          width: 24px;
          text-align: center;
        }

        .feature-text {
          flex: 1;
        }

        .feature-status {
          font-family: var(--mono);
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 3px;
          white-space: nowrap;
        }

        .feature-status.enabled {
          background: rgba(48, 209, 88, 0.2);
          color: var(--safe);
        }

        .feature-status.disabled {
          background: rgba(255, 59, 92, 0.2);
          color: var(--danger);
        }

        /* 推奨事項 */
        .recommendations-section {
          padding: 16px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .recommendations-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .recommendation-item {
          padding: 12px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-left: 3px solid var(--warn);
          border-radius: 4px;
          font-size: 12px;
        }

        .recommendation-item.high-priority {
          border-left-color: var(--danger);
        }

        .recommendation-item.medium-priority {
          border-left-color: var(--warn);
        }

        .recommendation-title {
          font-weight: 700;
          margin-bottom: 4px;
        }

        .recommendation-description {
          color: var(--muted);
          font-size: 11px;
          margin-bottom: 8px;
          line-height: 1.4;
        }

        .recommendation-action {
          display: inline-block;
          padding: 4px 8px;
          background: transparent;
          border: 1px solid var(--share);
          border-radius: 3px;
          color: var(--share);
          font-family: var(--mono);
          font-size: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .recommendation-action:hover {
          background: rgba(123, 97, 255, 0.1);
        }

        .recommendations-empty {
          padding: 20px;
          text-align: center;
          color: var(--safe);
          font-size: 13px;
        }

        /* ロジック説明 */
        .logic-section {
          padding: 16px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .logic-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .logic-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 4px;
          font-family: var(--mono);
          font-size: 11px;
        }

        .logic-label {
          color: var(--muted);
        }

        .logic-value {
          color: var(--accent);
          font-weight: 700;
        }

        .logic-bonus {
          border-color: var(--accent);
          background: rgba(0, 255, 136, 0.05);
        }

        /* グラフ */
        .graph-section {
          padding: 16px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .graph-container {
          overflow-x: auto;
        }

        .score-graph {
          display: block;
        }
      </style>
    `;

    this.el.innerHTML = html;
  }

  /**
   * 機能のチェックリストをレンダリング
   */
  renderFeature(name, enabled) {
    const icon = enabled ? '✅' : '❌';
    const statusClass = enabled ? 'enabled' : 'disabled';
    const statusText = enabled ? '有効' : '未設定';

    return `
      <div class="feature-item">
        <div class="feature-icon">${icon}</div>
        <div class="feature-text">${name}</div>
        <div class="feature-status ${statusClass}">${statusText}</div>
      </div>
    `;
  }

  /**
   * 推奨事項をレンダリング
   */
  renderRecommendation(rec) {
    const priorityClass = rec.priority === 'high' ? 'high-priority' : 'medium-priority';
    const priorityLabel = rec.priority === 'high' ? '🔴' : '🟡';

    return `
      <div class="recommendation-item ${priorityClass}">
        <div class="recommendation-title">${priorityLabel} ${rec.title}</div>
        <div class="recommendation-description">${rec.description}</div>
        <button class="recommendation-action" onclick="console.log('Action: ${rec.action}')">
          ${rec.action}
        </button>
      </div>
    `;
  }

  /**
   * スコアグラフを SVG でレンダリング（簡易版）
   */
  renderScoreGraph() {
    const width = 400;
    const height = 100;
    const padding = 10;
    const dataWidth = width - padding * 2;
    const dataHeight = height - padding * 2;

    const scores = this.scoreHistory.map(h => h.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreRange = maxScore - minScore || 1;

    let pathD = `M ${padding} ${height - padding}`;

    scores.forEach((score, i) => {
      const x = padding + (i / (scores.length - 1)) * dataWidth;
      const y = height - padding - ((score - minScore) / scoreRange) * dataHeight;
      pathD += ` L ${x} ${y}`;
    });

    return `
      <polyline 
        points="${scores.map((score, i) => {
          const x = padding + (i / (scores.length - 1)) * dataWidth;
          const y = height - padding - ((score - minScore) / scoreRange) * dataHeight;
          return `${x},${y}`;
        }).join(' ')}"
        fill="none"
        stroke="var(--accent)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <!-- グリッド線 -->
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--border)" stroke-width="1" opacity="0.3" />
    `;
  }

  /**
   * スコアを更新して LocalStorage に保存
   */
  updateScore() {
    const today = new Date().toISOString().split('T')[0];
    const score = this.calculateScore();

    // 今日のスコア記録があるか確認
    const todayRecord = this.scoreHistory.find(h => h.date === today);

    if (todayRecord) {
      todayRecord.score = score;
    } else {
      this.scoreHistory.push({ date: today, score });
      // 30日を超えたら古いデータを削除
      if (this.scoreHistory.length > 30) {
        this.scoreHistory.shift();
      }
    }

    this.saveScoreHistory();
    this.render();
  }

  /**
   * 外部からスコアを更新
   */
  refresh() {
    this.updateFeatureStatus();
    this.updateScore();
  }
}

// グローバルエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityDashboard;
}
window.SecurityDashboard = SecurityDashboard;
