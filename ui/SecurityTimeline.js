/**
 * ═══════════════════════════════════════════════════════════════════
 * VAULT UI — SECURITY TIMELINE COMPONENT
 * ═══════════════════════════════════════════════════════════════════
 * 
 * セキュリティアクションの履歴・タイムラインを表示
 * スコア変化グラフ・改善イベント追跡
 */

class SecurityTimeline {
  constructor(options = {}) {
    this.containerId = options.containerId || 'security-timeline-panel';
    this.vaultApp = options.vaultApp || null;
    
    // タイムラインイベント
    this.events = this.loadEvents() || this.initDefaultEvents();
    
    this.el = null;
    this.init();
  }

  /**
   * デフォルトイベントを初期化
   */
  initDefaultEvents() {
    const today = new Date();
    const events = [];

    // サンプルイベント（過去30日）
    const eventTemplates = [
      {
        daysAgo: 0,
        type: 'backup',
        title: 'バックアップ作成',
        description: 'iCloud Drive に 2層暗号化で保存',
        icon: '💾'
      },
      {
        daysAgo: 2,
        type: 'bioauth',
        title: '生体認証登録',
        description: 'Face ID (iPad) - 暗号化保存',
        icon: '👆'
      },
      {
        daysAgo: 6,
        type: 'breach',
        title: 'HIBP 漏洩検出',
        description: 'パスワード変更 (PBKDF2反復)',
        icon: '⚠️'
      },
      {
        daysAgo: 11,
        type: 'device_remove',
        title: 'デバイス削除',
        description: 'iPhone X のアクセス権を取り消し',
        icon: '🔒'
      },
      {
        daysAgo: 16,
        type: 'device_add',
        title: 'デバイス追加',
        description: 'iPad (WiFi) - パスコード登録',
        icon: '📱'
      },
      {
        daysAgo: 21,
        type: 'initialization',
        title: 'Vault 初期化',
        description: 'マスターパスワード設定',
        icon: '🆕'
      }
    ];

    eventTemplates.forEach(template => {
      const date = new Date(today);
      date.setDate(date.getDate() - template.daysAgo);
      
      events.push({
        id: `event-${Date.now()}-${Math.random()}`,
        date: date.toISOString(),
        ...template
      });
    });

    return events;
  }

  /**
   * LocalStorage からイベントを復元
   */
  loadEvents() {
    try {
      const stored = localStorage.getItem('vault_timeline_events');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * イベントを LocalStorage に保存
   */
  saveEvents() {
    try {
      localStorage.setItem('vault_timeline_events', JSON.stringify(this.events));
    } catch (e) {
      console.warn('[SecurityTimeline] Failed to save events:', e);
    }
  }

  /**
   * UI を初期化
   */
  init() {
    this.el = document.getElementById(this.containerId);
    if (!this.el) {
      console.warn(`[SecurityTimeline] Container not found: ${this.containerId}`);
      return;
    }

    this.render();
  }

  /**
   * イベントを追加
   */
  addEvent(eventData) {
    const event = {
      id: `event-${Date.now()}-${Math.random()}`,
      date: new Date().toISOString(),
      type: eventData.type || 'info',
      title: eventData.title || 'Unknown Event',
      description: eventData.description || '',
      icon: eventData.icon || '📌'
    };

    this.events.unshift(event);
    this.saveEvents();
    this.render();

    return event;
  }

  /**
   * イベントタイプの色を取得
   */
  getEventColor(type) {
    const colors = {
      initialization: 'var(--accent)',  // 🟢
      device_add: 'var(--accent)',
      backup: 'var(--accent)',
      bioauth: 'var(--accent)',
      password_change: 'var(--warn)',   // 🟡
      breach: 'var(--danger)',          // 🔴
      device_remove: 'var(--danger)',
      security_update: 'var(--accent)',
      info: 'var(--muted)'
    };

    return colors[type] || colors.info;
  }

  /**
   * 日時をフォーマット
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateOnly = date.toDateString();
    const todayOnly = today.toDateString();
    const yesterdayOnly = yesterday.toDateString();

    if (dateOnly === todayOnly) {
      return `今日 ${date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (dateOnly === yesterdayOnly) {
      return `昨日 ${date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${month}月${day}日`;
    }
  }

  /**
   * 期間内のイベント統計を取得
   */
  getStatistics() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentEvents = this.events.filter(e => new Date(e.date) >= thirtyDaysAgo);

    const stats = {
      totalEvents: recentEvents.length,
      byType: {},
      securityActions: 0
    };

    recentEvents.forEach(event => {
      if (!stats.byType[event.type]) {
        stats.byType[event.type] = 0;
      }
      stats.byType[event.type]++;

      // セキュリティ改善アクションをカウント
      if (['device_add', 'backup', 'bioauth', 'password_change'].includes(event.type)) {
        stats.securityActions++;
      }
    });

    return stats;
  }

  /**
   * スコア変化グラフデータを取得（簡易版）
   */
  getScoreTrendData() {
    try {
      const scoreHistory = localStorage.getItem('vault_score_history');
      if (!scoreHistory) return null;

      return JSON.parse(scoreHistory);
    } catch (e) {
      return null;
    }
  }

  /**
   * スコアグラフを SVG で描画
   */
  renderScoreTrendGraph() {
    const data = this.getScoreTrendData();
    if (!data || data.length === 0) {
      return '<div style="text-align: center; color: var(--muted); padding: 20px;">スコアデータがありません</div>';
    }

    const width = 350;
    const height = 120;
    const padding = 20;
    const dataWidth = width - padding * 2;
    const dataHeight = height - padding * 2;

    const scores = data.map(d => d.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreRange = maxScore - minScore || 1;

    // ポイント配列を生成
    const points = scores.map((score, i) => {
      const x = padding + (i / (scores.length - 1)) * dataWidth;
      const y = height - padding - ((score - minScore) / scoreRange) * dataHeight;
      return `${x},${y}`;
    });

    return `
      <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="max-width: 100%;">
        <!-- グリッド線 -->
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" 
              stroke="var(--border)" stroke-width="1" opacity="0.5" />
        
        <!-- グラフ -->
        <polyline 
          points="${points.join(' ')}"
          fill="none"
          stroke="var(--accent)"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        
        <!-- ポイント -->
        ${points.map((point, i) => {
          const [x, y] = point.split(',');
          return `<circle cx="${x}" cy="${y}" r="3" fill="var(--accent)" />`;
        }).join('')}
        
        <!-- Y軸ラベル -->
        <text x="${padding - 10}" y="${padding + 10}" font-size="10" fill="var(--muted)" text-anchor="end">100</text>
        <text x="${padding - 10}" y="${height - padding + 4}" font-size="10" fill="var(--muted)" text-anchor="end">0</text>
      </svg>
    `;
  }

  /**
   * HTML をレンダリング
   */
  render() {
    const stats = this.getStatistics();
    const scoreTrendHtml = this.renderScoreTrendGraph();

    const html = `
      <div class="security-timeline">
        <!-- スコアグラフ -->
        <div class="timeline-section">
          <div class="section-title">過去30日間のスコア推移</div>
          <div class="score-graph-container">
            ${scoreTrendHtml}
          </div>
        </div>

        <!-- 統計情報 -->
        <div class="timeline-section">
          <div class="section-title">セキュリティイベント統計</div>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${stats.totalEvents}</div>
              <div class="stat-label">過去30日のイベント</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.securityActions}</div>
              <div class="stat-label">改善アクション完了</div>
            </div>
          </div>
        </div>

        <!-- タイムライン -->
        <div class="timeline-section">
          <div class="section-title">セキュリティ活動履歴</div>
          <div class="timeline-events">
            ${this.events.slice(0, 15).map((event, idx) => this.renderEvent(event, idx)).join('')}
          </div>
        </div>
      </div>

      <style>
        .security-timeline {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .timeline-section {
          padding: 16px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .section-title {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 2px;
          color: var(--accent);
          margin-bottom: 16px;
          text-transform: uppercase;
        }

        /* スコアグラフ */
        .score-graph-container {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 12px;
          overflow-x: auto;
        }

        /* 統計 */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
        }

        .stat-card {
          padding: 16px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 4px;
          text-align: center;
        }

        .stat-value {
          font-size: 32px;
          font-weight: 700;
          color: var(--accent);
          font-family: var(--mono);
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 10px;
          color: var(--muted);
          font-family: var(--mono);
          letter-spacing: 1px;
        }

        /* タイムラインイベント */
        .timeline-events {
          display: flex;
          flex-direction: column;
          gap: 12px;
          position: relative;
        }

        .timeline-events::before {
          content: '';
          position: absolute;
          left: 19px;
          top: 0;
          bottom: 0;
          width: 1px;
          background: var(--border);
        }

        .timeline-event {
          display: flex;
          gap: 16px;
          padding: 12px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 4px;
          position: relative;
          margin-left: 24px;
        }

        .timeline-event::before {
          content: '';
          position: absolute;
          left: -33px;
          top: 16px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: currentColor;
          border: 2px solid var(--surface2);
          box-sizing: border-box;
        }

        .event-icon {
          font-size: 24px;
          width: 32px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .event-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .event-title {
          font-weight: 700;
          font-size: 12px;
        }

        .event-description {
          font-size: 11px;
          color: var(--muted);
        }

        .event-date {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
          letter-spacing: 0.5px;
        }

        /* イベントタイプ別色 */
        .timeline-event.type-initialization { color: var(--accent); }
        .timeline-event.type-device_add { color: var(--accent); }
        .timeline-event.type-backup { color: var(--accent); }
        .timeline-event.type-bioauth { color: var(--accent); }
        .timeline-event.type-password_change { color: var(--warn); }
        .timeline-event.type-breach { color: var(--danger); }
        .timeline-event.type-device_remove { color: var(--danger); }
        .timeline-event.type-security_update { color: var(--accent); }
      </style>
    `;

    this.el.innerHTML = html;
  }

  /**
   * イベントを個別にレンダリング
   */
  renderEvent(event, index) {
    const color = this.getEventColor(event.type);
    const dateStr = this.formatDate(event.date);

    return `
      <div class="timeline-event type-${event.type}" style="color: ${color};">
        <div class="event-icon">${event.icon}</div>
        <div class="event-content">
          <div class="event-title">${event.title}</div>
          <div class="event-description">${event.description}</div>
          <div class="event-date">${dateStr}</div>
        </div>
      </div>
    `;
  }
}

// グローバルエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityTimeline;
}
window.SecurityTimeline = SecurityTimeline;
