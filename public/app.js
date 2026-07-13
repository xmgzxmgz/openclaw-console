// ============================================================
// OpenClaw Console — 前端应用
// ============================================================

const API = '/api';
let sessions = [];
let filter = 'all';
let currentSessionId = null;

// ---- 工具函数 ----
const $ = id => document.getElementById(id);
const formatNumber = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
const escapeHtml = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

function formatTime(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(typeof timestamp === 'number' ? timestamp : timestamp);
  const diff = Date.now() - date.getTime();
  if (diff < 6e4) return '刚刚';
  if (diff < 36e5) return Math.floor(diff / 6e4) + '分钟前';
  if (diff < 864e5) return Math.floor(diff / 36e5) + '小时前';
  if (diff < 6048e5) return Math.floor(diff / 864e5) + '天前';
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' '
    + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// ---- 页面导航 ----
const PAGE_TITLES = {
  dashboard: '总览', sessions: '会话', compare: '模型对比',
  templates: 'Prompt 模板', chat: '实时对话', settings: '设置',
};

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = $('page-' + name);
  const nav = document.querySelector(`[data-page="${name}"]`);
  if (page) page.classList.add('active');
  if (nav) nav.classList.add('active');
  $('page-title').textContent = PAGE_TITLES[name] || name;

  // 按需渲染
  if (name === 'settings') { renderBudget(); renderAPI(); renderSys(); }
  if (name === 'compare') renderPerf();
  if (name === 'templates') renderTemplates();
}

document.querySelectorAll('.nav-item[data-page]').forEach(n =>
  n.addEventListener('click', () => showPage(n.dataset.page))
);
$('menu-toggle').addEventListener('click', () => document.querySelector('aside').classList.toggle('open'));

// ---- 数据加载 ----
async function loadData() {
  sessions = await fetch(API + '/sessions').then(r => r.json());
  renderStats();
  renderChannels();
  renderTrend();
  renderModels();
  renderActivity();
  renderSessions();
  renderRisk();
}

// ---- 总览统计 ----
function renderStats() {
  const totalTokens = sessions.reduce((sum, s) => sum + s.tokenUsage.total, 0);
  const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
  const totalTools = sessions.reduce((sum, s) => sum + s.toolCallCount, 0);
  const channels = [...new Set(sessions.map(s => s.channel))];

  $('s-sessions').textContent = sessions.length;
  $('s-sessions-sub').textContent = channels.length + ' channels';
  $('s-msgs').textContent = formatNumber(totalMessages);
  $('s-msgs-sub').textContent = 'avg ' + Math.round(totalMessages / Math.max(sessions.length, 1)) + '/session';
  $('s-tokens').textContent = formatNumber(totalTokens);

  const inputTokens = sessions.reduce((sum, s) => sum + s.tokenUsage.input, 0);
  const cacheRead = sessions.reduce((sum, s) => sum + (s.tokenUsage.cacheRead || 0), 0);
  $('s-tokens-sub').textContent = 'input:' + formatNumber(inputTokens) + ' cache:' + (totalTokens ? (cacheRead / totalTokens * 100).toFixed(0) : 0) + '%';
  $('s-tools').textContent = formatNumber(totalTools);
  $('s-tools-sub').textContent = [...new Set(sessions.flatMap(s => s.toolCalls))].length + ' tools';
}

// ---- 风险检测 ----
function renderRisk() {
  const allRisks = sessions.flatMap(s => s.risks);
  const pill = $('risk-pill');
  const icon = $('risk-icon');
  const text = $('risk-text');

  if (!allRisks.length) {
    pill.className = 'risk-pill safe';
    icon.textContent = '✅';
    text.textContent = '安全';
  } else {
    const hasHigh = allRisks.some(r => r.level === 'high' || r.level === 'critical');
    pill.className = hasHigh ? 'risk-pill danger' : 'risk-pill warn';
    icon.textContent = '⚠️';
    text.textContent = allRisks.length + ' risks';
  }
}

// ---- 渠道状态 ----
function renderChannels() {
  const channelMap = {};
  sessions.forEach(s => {
    if (!channelMap[s.channel] || s.lastInteractionAt > channelMap[s.channel].last) {
      channelMap[s.channel] = {
        last: s.lastInteractionAt,
        count: (channelMap[s.channel]?.count || 0) + 1,
      };
    }
  });

  const icons = { '微信': '🟢', 'Telegram': '🔵', '终端': '🟣', '模型测试': '🟠', '其他': '⚪' };

  $('el-channels').innerHTML = Object.entries(channelMap).map(([ch, data]) => {
    const age = Date.now() - new Date(data.last || 0).getTime();
    const status = age < 3e5 ? 'ok' : age < 36e5 ? 'warn' : 'off';
    return `<div class="ch-item">
      <span class="ch-dot ${status}"></span>
      <span class="ch-name">${icons[ch] || '⚪'} ${ch}</span>
      <span class="ch-detail">${data.count} sessions | ${formatTime(data.last)}</span>
    </div>`;
  }).join('') || '<div class="empty">-</div>';
}

// ---- Token 趋势 ----
function renderTrend() {
  const dailyMap = {};
  sessions.forEach(s => {
    const date = new Date(s.lastInteractionAt || 0);
    const key = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    dailyMap[key] = (dailyMap[key] || 0) + s.tokenUsage.total;
  });

  const entries = Object.entries(dailyMap).slice(-5);
  if (!entries.length) { $('el-trend').innerHTML = '<div class="empty">-</div>'; return; }

  const maxVal = Math.max(...entries.map(e => e[1]), 1);
  $('el-trend').innerHTML = entries.map(([date, tokens]) =>
    `<div class="trend-row">
      <span class="trend-date">${date}</span>
      <div class="trend-track">
        <div class="trend-fill" style="width:${Math.max(tokens / maxVal * 100, 5)}%"></div>
        <span class="trend-val">${formatNumber(tokens)}</span>
      </div>
    </div>`
  ).join('');
}

// ---- 模型分布 ----
function renderModels() {
  const modelTokens = {};
  sessions.forEach(s => { modelTokens[s.model] = (modelTokens[s.model] || 0) + s.tokenUsage.total; });

  const sorted = Object.entries(modelTokens).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, e) => sum + e[1], 0) || 1;
  const colors = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff3b30', '#5ac8fa'];

  $('el-models').innerHTML = '<div class="pills">' + sorted.map(([model, tokens], i) =>
    `<div class="pill">
      <span class="pill-dot" style="background:${colors[i % 6]}"></span>
      <span class="pill-name">${escapeHtml(model)}</span>
      <span class="pill-tokens">${formatNumber(tokens)}</span>
      <span class="pill-pct">${(tokens / total * 100).toFixed(0)}%</span>
    </div>`
  ).join('') + '</div>';
}

// ---- 最近活动 ----
function renderActivity() {
  $('el-activity').innerHTML = sessions.slice(0, 5).map(s =>
    `<div class="list-item" onclick="openDetail('${s.sessionId}')">
      <span class="ch ${s.channel}">${s.channel}</span>
      <div class="list-info">
        <div class="list-summary">${escapeHtml(s.summary)}</div>
        <div class="list-meta"><span>${s.model}</span><span>${formatNumber(s.tokenUsage.total)}</span></div>
      </div>
      <span class="list-time">${formatTime(s.lastInteractionAt)}</span>
    </div>`
  ).join('') || '<div class="empty">-</div>';
}

// ---- 收藏与标签 ----
const getFavs = () => { try { return JSON.parse(localStorage.getItem('favs') || '[]'); } catch { return []; } };
const isFav = sid => getFavs().includes(sid);
function toggleFav(sid) {
  const favs = getFavs();
  const idx = favs.indexOf(sid);
  if (idx >= 0) favs.splice(idx, 1); else favs.push(sid);
  localStorage.setItem('favs', JSON.stringify(favs));
  renderSessions();
}

const getTags = () => { try { return JSON.parse(localStorage.getItem('tags') || '{}'); } catch { return {}; } };
function toggleTag(sid, tag) {
  const tags = getTags();
  if (!tags[sid]) tags[sid] = [];
  if (tags[sid].includes(tag)) tags[sid] = tags[sid].filter(t => t !== tag); else tags[sid].push(tag);
  localStorage.setItem('tags', JSON.stringify(tags));
  renderSessions();
}

const TAG_DEFS = [{ name: 'work', css: 'work' }, { name: 'study', css: 'study' }, { name: 'project', css: 'project' }];

// ---- 会话列表 ----
function renderSessions() {
  const filtered = filter === 'all' ? sessions
    : filter === 'fav' ? sessions.filter(s => isFav(s.sessionId))
    : sessions.filter(s => s.channel === filter);

  $('session-count').textContent = filtered.length + '/' + sessions.length;

  if (!filtered.length) {
    $('el-sessions').innerHTML = '<div class="empty">No match</div>';
    return;
  }

  $('el-sessions').innerHTML = filtered.map(s => {
    const tags = getTags()[s.sessionId] || [];
    return `<div class="list-item" onclick="openDetail('${s.sessionId}')">
      <span class="fav ${isFav(s.sessionId) ? 'on' : ''}"
        onclick="event.stopPropagation();toggleFav('${s.sessionId}')">★</span>
      <span class="ch ${s.channel}">${s.channel}</span>
      <div class="list-info">
        <div class="list-summary">${escapeHtml(s.summary)}</div>
        <div class="list-tags">
          ${tags.map(t => `<span class="tag ${(TAG_DEFS.find(x => x.name === t) || {}).css || ''}"
            onclick="event.stopPropagation();toggleTag('${s.sessionId}','${t}')">${t}</span>`).join('')}
          <input class="tag-in" placeholder="+"
            onkeydown="if(event.key==='Enter'){event.stopPropagation();toggleTag('${s.sessionId}',this.value);this.value='';}">
        </div>
        <div class="list-meta">
          <span>💬${s.messageCount}</span><span>🔧${s.toolCallCount}</span>
          <span>📊${formatNumber(s.tokenUsage.total)}</span><span>🤖${escapeHtml(s.model)}</span>
        </div>
      </div>
      <div class="list-right">
        <span class="list-time">${formatTime(s.lastInteractionAt)}</span>
        <div class="list-actions">
          <button class="btn-sm" onclick="event.stopPropagation();exportSession('${s.sessionId}','md')">MD</button>
          <button class="btn-sm" onclick="event.stopPropagation();exportSession('${s.sessionId}','json')">JSON</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// 渠道过滤
document.querySelectorAll('.chip[data-f]').forEach(chip =>
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-f]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.f;
    renderSessions();
  })
);

// ---- 会话详情 ----
async function openDetail(sessionId) {
  currentSessionId = sessionId;
  const detail = await fetch(API + '/session/' + sessionId).then(r => r.json());
  if (!detail || detail.error) return;

  $('detail-title').textContent = detail.summary || 'Detail';

  let html = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
    <span class="ch ${detail.channel}">${detail.channel}</span>
    <span style="font-size:12px;color:var(--dim)">${escapeHtml(detail.model)} | ${formatTime(detail.startedAt)}</span>
  </div>`;

  // Token 统计
  const usage = detail.tokenUsage;
  html += `<div class="detail-stats">
    <div class="detail-stat"><div class="detail-stat-v">${detail.messageCount}</div><div class="detail-stat-l">Messages</div></div>
    <div class="detail-stat"><div class="detail-stat-v">${formatNumber(usage.input)}</div><div class="detail-stat-l">Input</div></div>
    <div class="detail-stat"><div class="detail-stat-v">${formatNumber(usage.output)}</div><div class="detail-stat-l">Output</div></div>
    <div class="detail-stat"><div class="detail-stat-v">${formatNumber(usage.cacheRead || 0)}</div><div class="detail-stat-l">Cache Read</div></div>
    <div class="detail-stat"><div class="detail-stat-v">${formatNumber(usage.cacheWrite || usage.cacheCreation || 0)}</div><div class="detail-stat-l">Cache Write</div></div>
    <div class="detail-stat"><div class="detail-stat-v" style="color:var(--accent)">${formatNumber(usage.total)}</div><div class="detail-stat-l">Total</div></div>
  </div>`;

  // 对话内容
  if (detail.conversation) {
    for (const msg of detail.conversation) {
      if (msg.role === 'user' && msg.text) {
        html += `<div class="msg user"><div class="msg-bubble">${escapeHtml(msg.text).slice(0, 800)}</div></div>`;
      } else if (msg.role === 'assistant') {
        if (msg.text) {
          html += `<div class="msg asst"><div class="msg-bubble"><div class="md">${renderMarkdown(msg.text.slice(0, 1200))}</div></div>`;
          if (msg.usage) {
            html += `<div class="msg-usage">In: <span>${formatNumber(msg.usage.input)}</span> Out: <span>${formatNumber(msg.usage.output)}</span>`;
            if (msg.usage.cacheRead) html += ` Cache: <span>${formatNumber(msg.usage.cacheRead)}</span>`;
            html += '</div>';
          }
          html += '</div>';
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            const args = JSON.stringify(tc.arguments || {});
            html += `<div class="msg-tc">
              <div class="msg-tc-h" onclick="this.parentElement.classList.toggle('open')">▶ 🔧 ${escapeHtml(tc.name)}</div>
              <div class="msg-tc-b">${escapeHtml(args).slice(0, 500)}</div>
            </div>`;
          }
        }
      } else if (msg.role === 'tool') {
        html += `<div class="msg asst"><div class="msg-bubble" style="font-size:11px;font-family:monospace;color:var(--muted)">${msg.isError ? '❌ ' : ''}${escapeHtml(msg.result || '').slice(0, 400)}</div></div>`;
      }
    }
  }

  $('detail-body').innerHTML = html;
  $('detail-overlay').classList.add('show');
}

function closeOverlay(id) { $(id).classList.remove('show'); }

// ---- 导出 ----
function exportSession(sessionId, format) {
  fetch(API + '/session/' + sessionId).then(r => r.json()).then(detail => {
    if (!detail || detail.error) return;
    const title = detail.summary || 'session';
    const date = new Date(detail.startedAt || Date.now()).toISOString().slice(0, 10);
    let content, filename, mime;

    if (format === 'md') {
      content = '# ' + title + '\n\n' + detail.channel + ' | ' + detail.model + '\n\n---\n\n';
      if (detail.conversation) {
        for (const msg of detail.conversation) {
          if (msg.role === 'user') content += '## User\n' + msg.text + '\n\n';
          else if (msg.role === 'assistant') content += '## AI\n' + (msg.text || '') + '\n\n';
        }
      }
      filename = title + '-' + date + '.md';
      mime = 'text/markdown';
    } else {
      content = JSON.stringify(detail, null, 2);
      filename = title + '-' + date + '.json';
      mime = 'application/json';
    }

    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  });
}

function exportCurrent(format) {
  if (currentSessionId) exportSession(currentSessionId, format);
}

// ---- Markdown 渲染 ----
function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ---- 多模型对比（修复：按模型分发请求）----
$('compare-go').addEventListener('click', async () => {
  const prompt = $('compare-input').value.trim();
  if (!prompt) return;

  const config = await fetch(API + '/config').then(r => r.json());
  const models = config.providers.flatMap(p => p.models.map(m => ({
    id: m.id,
    name: m.name || m.id,
    provider: p.name,
  })));

  const displayModels = models.slice(0, 4);
  $('compare-grid').innerHTML = displayModels.map(m => {
    const panelId = 'cmp-' + m.id.replace(/[^a-z0-9]/gi, '_');
    return `<div class="compare-panel">
      <div class="compare-head">${escapeHtml(m.provider)}/${escapeHtml(m.name)}</div>
      <div class="body" id="${panelId}"><div class="loading"><div class="ld"></div><div class="ld"></div></div></div>
    </div>`;
  }).join('');

  // 为每个模型发送独立请求（修复：传递 model 参数）
  for (const model of displayModels) {
    const panelId = 'cmp-' + model.id.replace(/[^a-z0-9]/gi, '_');
    fetch(API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, model: model.id }),
    })
      .then(r => r.json())
      .then(data => {
        const el = document.getElementById(panelId);
        if (el) el.innerHTML = `<div class="md">${renderMarkdown(data.text || data.message || JSON.stringify(data).slice(0, 300))}</div>`;
      })
      .catch(error => {
        const el = document.getElementById(panelId);
        if (el) el.innerHTML = `<span style="color:var(--red)">${error.message}</span>`;
      });
  }
});

// ---- 模型性能统计 ----
function renderPerf() {
  const modelStats = {};
  sessions.forEach(s => {
    if (!modelStats[s.model]) modelStats[s.model] = { sessions: 0, tokens: 0, messages: 0 };
    modelStats[s.model].sessions++;
    modelStats[s.model].tokens += s.tokenUsage.total;
    modelStats[s.model].messages += s.messageCount;
  });

  const totalTokens = sessions.reduce((sum, s) => sum + s.tokenUsage.total, 0) || 1;
  const maxTokens = Math.max(...Object.values(modelStats).map(v => v.tokens), 1);

  $('el-perf').innerHTML = `<table class="perf-tbl">
    <tr><th>Model</th><th>Sessions</th><th>Msgs</th><th>Tokens</th><th>Share</th></tr>
    ${Object.entries(modelStats).sort((a, b) => b[1].tokens - a[1].tokens).map(([name, stats]) =>
      `<tr>
        <td><strong style="font-family:monospace;font-size:11px">${escapeHtml(name)}</strong></td>
        <td>${stats.sessions}</td>
        <td>${stats.messages}</td>
        <td><div class="perf-bar"><div class="perf-fill" style="width:${stats.tokens / maxTokens * 100}%"></div></div>${formatNumber(stats.tokens)}</td>
        <td style="color:var(--accent);font-weight:600">${(stats.tokens / totalTokens * 100).toFixed(1)}%</td>
      </tr>`
    ).join('')}
  </table>`;
}

// ---- Prompt 模板 ----
const TEMPLATES = [
  { name: 'Code Review', desc: 'Quality check', prompt: 'Review this code for bugs and improvements:\n\n```\n\n```' },
  { name: 'Translate', desc: 'Multi-language', prompt: 'Translate to {language}:\n\n' },
  { name: 'Debug', desc: 'Bug fix', prompt: 'Error:\nSteps:\n\nFix please.' },
  { name: 'Summarize', desc: 'Summary', prompt: 'Summarize in 3-5 points:\n\n' },
  { name: 'Tests', desc: 'Unit tests', prompt: 'Write test cases:\n\n```\n\n```' },
  { name: 'Architecture', desc: 'System design', prompt: 'Design {system} architecture:\n- Stack:\n- Scale:\n- Features:' },
  { name: 'Email', desc: 'Email', prompt: 'Write a {formal/casual} email:\n' },
  { name: 'Brainstorm', desc: 'Ideas', prompt: '5 innovative ideas about {topic}:' },
  { name: 'Explain', desc: 'Code explain', prompt: 'Explain line by line:\n\n```\n\n```' },
  { name: 'Meeting Notes', desc: 'Meeting', prompt: 'Organize meeting notes:\n\n' },
  { name: 'Learn Plan', desc: 'Learning', prompt: '30-day plan to learn {topic}:' },
  { name: 'Data Analysis', desc: 'Data', prompt: 'Analyze trends in:\n\n' },
];

function renderTemplates() {
  $('el-templates').innerHTML = TEMPLATES.map(t =>
    `<div class="tpl-card" onclick="$('chat-input').value=${JSON.stringify(t.prompt)};showPage('chat');$('chat-input').focus();">
      <div class="tpl-name">${escapeHtml(t.name)}</div>
      <div class="tpl-desc">${escapeHtml(t.desc)}</div>
    </div>`
  ).join('');
}

// ---- 实时对话 ----
$('chat-send').addEventListener('click', sendChat);
$('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
$('chat-input').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});
$('chat-tpl').addEventListener('click', () => showPage('templates'));

async function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';

  const msgs = $('chat-msgs');
  const empty = msgs.querySelector('.chat-empty');
  if (empty) empty.remove();

  appendMessage('user', text);

  try {
    const response = await fetch(API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    const data = await response.json();
    appendMessage('asst', data.text || data.message || JSON.stringify(data).slice(0, 500));
  } catch (error) {
    appendMessage('asst', 'Error: ' + error.message);
  }
}

function appendMessage(role, text) {
  const container = $('chat-msgs');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = `<div class="msg-bubble"><div class="md">${renderMarkdown(text)}</div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ---- 设置 — Token 预算 ----
function renderBudget() {
  const budget = JSON.parse(localStorage.getItem('budget') || '{"max":1000000,"used":0}');
  const pct = Math.min(budget.used / budget.max * 100, 100);
  const level = pct < 60 ? 'ok' : pct < 85 ? 'warn' : 'danger';

  $('el-budget').innerHTML = `
    <div style="text-align:center;margin:12px 0">
      <div style="font-size:28px;font-weight:800;color:var(--${level})">${formatNumber(budget.used)}</div>
      <div style="font-size:11px;color:var(--dim)">/ ${formatNumber(budget.max)} monthly</div>
    </div>
    <div class="budget-fill"><div class="budget-fill-inner ${level}" style="width:${pct}%"></div></div>
    <div class="budget-info"><span>${pct.toFixed(1)}% used</span><span>${formatNumber(budget.max - budget.used)} left</span></div>
    <div class="setting-row" style="margin-top:12px">
      <span>Budget</span>
      <input type="number" id="budget-in" value="${budget.max}"
        style="width:100px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;text-align:right">
    </div>
    <button class="btn-primary" style="width:100%;margin-top:8px"
      onclick="localStorage.setItem('budget',JSON.stringify({max:parseInt($('budget-in').value),used:0}));renderBudget()">Save</button>`;
}

// ---- 设置 — API 管理 ----
function renderAPI() {
  fetch(API + '/config').then(r => r.json()).then(config => {
    $('el-api').innerHTML = config.providers.map(p =>
      `<div class="api-card">
        <div class="api-card-h">
          <span class="api-name">${escapeHtml(p.name)}</span>
          <span class="api-st ${p.hasKey ? 'ok' : 'no'}">${p.hasKey ? '✓' : '✗'}</span>
        </div>
        <div class="api-url">${escapeHtml(p.baseUrl)}</div>
        ${p.models.length ? `<div class="api-models">${p.models.map(m => `<span class="api-m">${escapeHtml(m.id)}</span>`).join('')}</div>` : ''}
      </div>`
    ).join('') + `<div style="margin-top:10px;font-size:12px;color:var(--muted)">
      <p>Default: <strong style="color:var(--accent)">${escapeHtml(config.defaultModel)}</strong></p>
      ${config.fallbacks.length ? `<p style="margin-top:4px">Fallback: ${config.fallbacks.map(f => `<span class="api-m">${escapeHtml(f)}</span>`).join(' → ')}</p>` : ''}
    </div>`;
  });
}

// ---- 设置 — 系统信息 ----
function renderSys() {
  $('el-sys').innerHTML = `<div class="info-grid">
    <div class="info-item"><span class="info-lbl">OS</span><span class="info-val">macOS</span></div>
    <div class="info-item"><span class="info-lbl">Runtime</span><span class="info-val">Node.js</span></div>
    <div class="info-item"><span class="info-lbl">Console</span><span class="info-val">:3456</span></div>
    <div class="info-item"><span class="info-lbl">Gateway</span><span class="info-val">:18789</span></div>
    <div class="info-item"><span class="info-lbl">Sessions</span><span class="info-val">${sessions.length}</span></div>
    <div class="info-item"><span class="info-lbl">Version</span><span class="info-val">v2.2</span></div>
  </div>`;
}

// ---- 搜索（使用服务端全文搜索 API）----
$('search-trigger').addEventListener('click', () => {
  $('search-overlay').classList.add('show');
  $('search-input').value = '';
  $('search-results').innerHTML = '';
  $('search-input').focus();
});

let searchTimeout = null;
$('search-input').addEventListener('input', function () {
  const query = this.value.trim();
  clearTimeout(searchTimeout);
  if (!query) { $('search-results').innerHTML = ''; return; }

  // 防抖 300ms 后调用服务端搜索
  searchTimeout = setTimeout(async () => {
    try {
      const results = await fetch(API + '/search?q=' + encodeURIComponent(query)).then(r => r.json());
      $('search-results').innerHTML = results.length
        ? results.map(s => {
          const matchInfo = s.matchType === 'content'
            ? `<div style="font-size:10px;color:var(--accent);margin-top:2px">📝 ${escapeHtml(s.matchText)}</div>`
            : '';
          return `<div class="sr-item" onclick="closeOverlay('search-overlay');openDetail('${s.sessionId}')">
            <div style="display:flex;gap:8px;align-items:center">
              <span class="ch ${s.channel}">${s.channel}</span>
              <span style="font-size:12px;font-weight:500">${escapeHtml(s.summary)}</span>
            </div>
            ${matchInfo}
            <div style="font-size:10px;color:var(--dim);margin-top:3px">${s.model} | ${formatNumber(s.tokenUsage.total)} | ${formatTime(s.lastInteractionAt)}</div>
          </div>`;
        }).join('')
        : '<div class="empty">No match</div>';
    } catch {
      $('search-results').innerHTML = '<div class="empty">Search error</div>';
    }
  }, 300);
});

// ---- 主题切换 ----
if (localStorage.getItem('dark') === '1') {
  document.body.classList.add('dark');
  $('toggle-dark').checked = true;
}

$('toggle-dark').addEventListener('change', function () {
  document.body.classList.toggle('dark', this.checked);
  localStorage.setItem('dark', this.checked ? '1' : '0');
});

$('btn-theme').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  $('toggle-dark').checked = isDark;
  localStorage.setItem('dark', isDark ? '1' : '0');
});

// ---- SSE 实时连接 ----
function connectSSE() {
  const eventSource = new EventSource(API + '/events');
  eventSource.onopen = () => {
    $('status-dot').className = 'dot ok';
    $('status-text').textContent = 'Live';
  };
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'refresh') loadData();
  };
  eventSource.onerror = () => {
    $('status-dot').className = 'dot err';
    $('status-text').textContent = 'Reconnecting';
  };
}

// ---- 初始化 ----
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  connectSSE();
});
