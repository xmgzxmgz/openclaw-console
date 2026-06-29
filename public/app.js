const API = '/api';
let sessionsData = [];
let currentFilter = 'all';

const $ = id => document.getElementById(id);
const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n);
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
function fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(typeof ts === 'number' ? ts : ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff/60000)+' 分钟前';
  if (diff < 86400000) return Math.floor(diff/3600000)+' 小时前';
  if (diff < 604800000) return Math.floor(diff/86400000)+' 天前';
  return d.toLocaleDateString('zh-CN',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
}

// === 数据加载 ===
async function loadData() {
  sessionsData = await fetch(API+'/sessions').then(r=>r.json());
  renderStats(); renderRisks(); renderModels(); renderSessionList(); renderChannels(); renderTokenTrend(); renderCurrentModel();
}

function renderStats() {
  const total = sessionsData.reduce((s,x)=>s+x.tokenUsage.total,0);
  const msgs = sessionsData.reduce((s,x)=>s+x.messageCount,0);
  const tools = sessionsData.reduce((s,x)=>s+x.toolCallCount,0);
  const channels = [...new Set(sessionsData.map(s=>s.channel))];
  $('stat-sessions').textContent = sessionsData.length;
  $('stat-sessions-sub').textContent = `来自 ${channels.length} 个渠道`;
  $('stat-messages').textContent = fmt(msgs);
  $('stat-messages-sub').textContent = `平均每会话 ${Math.round(msgs/Math.max(sessionsData.length,1))} 条`;
  $('stat-tokens').textContent = fmt(total);
  $('stat-tokens-sub').textContent = `输入 ${fmt(sessionsData.reduce((s,x)=>s+x.tokenUsage.input,0))}`;
  $('stat-tools').textContent = fmt(tools);
  $('stat-tools-sub').textContent = `涉及 ${[...new Set(sessionsData.flatMap(s=>s.toolCalls))].length} 种工具`;
}

// === 风险检测（顶栏小徽章）===
function renderRisks() {
  const all = [];
  sessionsData.forEach(s => s.risks.forEach(r => all.push({...r})));
  const pill = $('risk-pill');
  const icon = $('risk-icon');
  const text = $('risk-text');
  if (!all.length) {
    pill.className = 'risk-pill safe'; icon.textContent = '✅'; text.textContent = '安全';
  } else {
    pill.className = all.some(r=>r.level==='critical'||r.level==='high') ? 'risk-pill danger' : 'risk-pill warn';
    icon.textContent = '⚠️'; text.textContent = `${all.length} 项风险`;
  }
  pill.onclick = () => {
    if (!all.length) return;
    const items = all.map(r => `<div class="risk-item"><span class="risk-badge ${r.level}">${r.level}</span><span class="risk-desc">${esc(r.desc)}</span></div>`).join('');
    showModal('⚠️ 风险详情', items);
  };
}

// === 当前模型显示 ===
function renderCurrentModel() {
  if (sessionsData.length) $('current-model').textContent = sessionsData[0].model || '-';
}

// === 渠道状态 ===
function renderChannels() {
  const chMap = {};
  sessionsData.forEach(s => {
    if (!chMap[s.channel] || s.lastInteractionAt > chMap[s.channel].last)
      chMap[s.channel] = { last: s.lastInteractionAt, model: s.model, count: (chMap[s.channel]?.count||0)+1 };
  });
  const icons = { '微信':'🟢', 'Telegram':'🔵', '终端':'🟣', '模型测试':'🟠', '其他':'⚪' };
  const html = Object.entries(chMap).map(([ch,v]) => {
    const age = Date.now() - new Date(v.last||0).getTime();
    const status = age < 300000 ? 'ok' : age < 3600000 ? 'warn' : 'off';
    return `<div class="channel-item">
      <span class="channel-dot ${status}"></span>
      <span class="channel-name">${icons[ch]||'⚪'} ${ch}</span>
      <span class="channel-detail">${v.count}个会话 · ${fmtTime(v.last)}</span>
    </div>`;
  }).join('');
  $('channel-status').innerHTML = html || '<div class="empty">暂无渠道</div>';
}

// === Token 趋势（横向条形）===
function renderTokenTrend() {
  const dayMap = {};
  sessionsData.forEach(s => {
    const d = new Date(s.lastInteractionAt||0);
    const key = d.toLocaleDateString('zh-CN',{month:'short',day:'numeric'});
    dayMap[key] = (dayMap[key]||0) + s.tokenUsage.total;
  });
  const entries = Object.entries(dayMap).slice(-5);
  if (!entries.length) { $('token-trend').innerHTML = '<div class="empty">暂无数据</div>'; return; }
  const max = Math.max(...entries.map(e=>e[1]),1);
  $('token-trend').innerHTML = entries.map(([day,tokens])=>
    `<div class="trend-row">
      <span class="trend-date">${day}</span>
      <div class="trend-track">
        <div class="trend-fill" style="width:${Math.max(tokens/max*100,5)}%"></div>
        <span class="trend-val">${fmt(tokens)}</span>
      </div>
    </div>`
  ).join('');
}

// === 模型分布（紧凑标签）===
function renderModels() {
  const counts = {};
  sessionsData.forEach(s => { counts[s.model] = (counts[s.model]||0) + s.tokenUsage.total; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const total = sorted.reduce((s,x)=>s+x[1],0) || 1;
  const colors = ['#007aff','#34c759','#ff9500','#af52de','#ff3b30','#5ac8fa'];
  $('model-chart').innerHTML = `<div class="model-pills">${sorted.map(([m,t],i)=>
    `<div class="model-pill">
      <span class="model-pill-dot" style="background:${colors[i%colors.length]}"></span>
      <span class="model-pill-name">${esc(m)}</span>
      <span class="model-pill-tokens">${fmt(t)}</span>
      <span class="model-pill-pct">${(t/total*100).toFixed(0)}%</span>
    </div>`
  ).join('')}</div>`;
}

// === 会话列表 ===
function renderSessionList() {
  const filtered = currentFilter === 'all' ? sessionsData : sessionsData.filter(s => s.channel === currentFilter);
  $('session-count').textContent = `${filtered.length} / ${sessionsData.length}`;
  if (!filtered.length) { $('session-list').innerHTML = '<div class="empty"><div class="empty-icon">📭</div>没有匹配的会话</div>'; return; }
  $('session-list').innerHTML = filtered.map(s => `
    <div class="session-item" data-sid="${s.sessionId}">
      <span class="ch ${s.channel}">${s.channel}</span>
      <div class="session-info">
        <div class="session-summary">${esc(s.summary)}</div>
        <div class="session-meta">
          <span>💬 ${s.messageCount}条</span>
          <span>🔧 ${s.toolCallCount}次</span>
          <span>📊 ${fmt(s.tokenUsage.total)}</span>
          <span>🤖 ${esc(s.model)}</span>
          ${s.risks.length?`<span style="color:var(--orange)">⚠️${s.risks.length}</span>`:''}
        </div>
      </div>
      <span class="session-time">${fmtTime(s.lastInteractionAt)}</span>
    </div>`).join('');
  $('session-list').querySelectorAll('.session-item').forEach(el => el.addEventListener('click', () => openSessionDetail(el.dataset.sid)));
}

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active'); currentFilter = chip.dataset.filter; renderSessionList();
  });
});

// === 详情弹层 ===
async function openSessionDetail(sid) {
  const d = await fetch(API+'/session/'+sid).then(r=>r.json());
  if (!d||d.error) return;
  let h = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px"><span class="ch ${d.channel}">${d.channel}</span><span style="font-size:12px;color:var(--text-tertiary)">${esc(d.model)} · ${fmtTime(d.startedAt)}</span></div>
    <div class="detail-stats">
      <div class="detail-stat"><div class="detail-stat-val">${d.messageCount}</div><div class="detail-stat-lbl">消息</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${fmt(d.tokenUsage.input)}</div><div class="detail-stat-lbl">输入</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${fmt(d.tokenUsage.output)}</div><div class="detail-stat-lbl">输出</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${fmt(d.tokenUsage.cache)}</div><div class="detail-stat-lbl">缓存</div></div>
    </div>`;
  if (d.conversation) {
    for (const m of d.conversation) {
      if (m.role==='user'&&m.text) h+=`<div class="msg user"><div class="msg-bubble">${esc(m.text).slice(0,800)}</div></div>`;
      else if (m.role==='assistant') {
        if (m.text) { h+=`<div class="msg assistant"><div class="msg-bubble">${esc(m.text).slice(0,1200)}</div>`; if(m.usage) h+=`<div class="msg-usage">输入 <span>${fmt(m.usage.input)}</span> → <span>${fmt(m.usage.output)}</span></div>`; h+='</div>'; }
        if (m.toolCalls) for (const tc of m.toolCalls) { const a=JSON.stringify(tc.arguments||{}); h+=`<div class="tc"><div class="tc-head" onclick="this.parentElement.classList.toggle('open')"><span class="tc-arrow">▶</span> 🔧 ${esc(tc.name)}</div><div class="tc-body">${esc(a).slice(0,600)}</div></div>`; }
      } else if (m.role==='toolResult') h+=`<div class="msg tool"><div class="msg-bubble">${m.isError?'❌ ':''}${esc(m.result||'').slice(0,500)}</div></div>`;
    }
  }
  showModal(d.summary||'会话详情', h);
}

function showModal(title, bodyHtml) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHtml;
  $('modal-overlay').classList.add('show');
}
$('modal-close').addEventListener('click', () => $('modal-overlay').classList.remove('show'));
$('modal-overlay').addEventListener('click', e => { if (e.target===$('modal-overlay')) $('modal-overlay').classList.remove('show'); });

// === SSE ===
function connectSSE() {
  const es = new EventSource(API+'/events');
  es.onopen = () => { $('status-dot').className='status-dot online'; $('status-text').textContent='实时同步'; };
  es.onmessage = e => { const d=JSON.parse(e.data); if (d.type==='sessions_refresh'||d.type==='session_update') loadData(); };
  es.onerror = () => { $('status-dot').className='status-dot offline'; $('status-text').textContent='重连中...'; };
}

// === 搜索 ===
function initSearch() {
  $('btn-search').addEventListener('click', () => { $('search-overlay').classList.add('show'); $('search-input').focus(); $('search-input').value=''; $('search-results').innerHTML=''; });
  $('search-overlay').addEventListener('click', e => { if(e.target===$('search-overlay')) $('search-overlay').classList.remove('show'); });
  $('search-input').addEventListener('input', () => {
    const q = $('search-input').value.trim().toLowerCase();
    if (!q) { $('search-results').innerHTML=''; return; }
    const matched = sessionsData.filter(s => s.summary.toLowerCase().includes(q) || s.model.includes(q) || s.channel.includes(q) || s.toolCalls.some(t=>t.includes(q)));
    $('search-results').innerHTML = matched.length ? matched.map(s => `<div class="search-item" onclick="$('search-overlay').classList.remove('show');openSessionDetail('${s.sessionId}')">
      <div style="display:flex;gap:8px;align-items:center"><span class="ch ${s.channel}">${s.channel}</span><span style="font-size:12px;font-weight:500">${esc(s.summary)}</span></div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${s.model} · ${fmt(s.tokenUsage.total)} tokens · ${fmtTime(s.lastInteractionAt)}</div>
    </div>`).join('') : '<div class="empty">没有匹配结果</div>';
  });
}

// === 模型切换 ===
function initModelSwitch() {
  $('header-model').addEventListener('click', async () => {
    const cfg = await fetch(API+'/config').then(r=>r.json());
    const models = cfg.providers.flatMap(p => p.models.map(m => ({...m, provider:p.name})));
    $('model-list').innerHTML = models.length ? models.map(m => `<div class="model-option ${m.id===$('current-model').textContent?'current':''}">
      <div><div class="model-option-name">${esc(m.id)}</div><div class="model-option-provider">${esc(m.provider)}</div></div>
    </div>`).join('') : '<div class="empty">暂无可用模型</div>';
    $('model-overlay').classList.add('show');
  });
  $('model-overlay').addEventListener('click', e => { if(e.target===$('model-overlay')) $('model-overlay').classList.remove('show'); });
}

// === 重启网关 ===
function initRestart() {
  $('btn-restart').addEventListener('click', async () => {
    $('btn-restart').textContent = '⏳';
    try {
      // 通过 OpenClaw API 重启（如果可用）
      setTimeout(() => { $('btn-restart').textContent = '⚡'; loadData(); }, 3000);
    } catch { $('btn-restart').textContent = '⚡'; }
  });
}

// === 聊天 ===
function initChat() {
  const input = $('chat-input');
  input.addEventListener('input', () => { input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,100)+'px'; });
  $('chat-send').addEventListener('click', sendMsg);
  input.addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendMsg(); } });
}
async function sendMsg() {
  const input = $('chat-input'); const text = input.value.trim(); if (!text) return;
  input.value=''; input.style.height='auto';
  const msgs = $('chat-messages'); const empty = msgs.querySelector('.chat-empty'); if (empty) empty.remove();
  appendMsg('user', text);
  try {
    const res = await fetch(API+'/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:text}) });
    const data = await res.json(); appendMsg('assistant', data.text||data.message||data.content||JSON.stringify(data).slice(0,500));
  } catch(err) { appendMsg('assistant', '⚠️ 连接失败: '+err.message); }
}
function appendMsg(role, text) { const el=$('chat-messages'); const div=document.createElement('div'); div.className='msg '+role; div.innerHTML=`<div class="msg-bubble">${esc(text)}</div>`; el.appendChild(div); el.scrollTop=el.scrollHeight; }

// === 暗色模式 ===
function initDarkMode() {
  const toggle = $('toggle-dark');
  if (localStorage.getItem('darkMode')==='true') { document.body.classList.add('dark'); toggle.checked=true; }
  toggle.addEventListener('change', () => { document.body.classList.toggle('dark', toggle.checked); localStorage.setItem('darkMode', toggle.checked); });
}

// === 设置面板 ===
function initSettings() {
  $('btn-settings').addEventListener('click', () => { $('settings-overlay').classList.add('show'); loadApiProviders(); loadSysInfo(); });
  $('settings-overlay').addEventListener('click', e => { if(e.target===$('settings-overlay')) $('settings-overlay').classList.remove('show'); });
}
async function loadApiProviders() {
  try {
    const cfg = await fetch(API+'/config').then(r=>r.json());
    const el = $('api-providers');
    if (!cfg.providers.length) { el.innerHTML='<div class="empty">暂无配置</div>'; return; }
    el.innerHTML = cfg.providers.map(p=>`<div class="api-card"><div class="api-card-header"><span class="api-name">${esc(p.name)}</span><span class="api-status ${p.hasKey?'ok':'warn'}">${p.hasKey?'已配置':'未配置'}</span></div><div class="api-detail">${esc(p.baseUrl)}</div>${p.models.length?`<div class="api-models">${p.models.map(m=>`<span class="api-model-tag">${esc(m.id)}</span>`).join('')}</div>`:''}</div>`).join('');
    el.innerHTML+=`<div style="margin-top:12px;font-size:12px;color:var(--text-secondary)"><p>🤖 默认：<strong style="color:var(--accent)">${esc(cfg.defaultModel)}</strong></p>${cfg.fallbacks.length?`<p>🔄 备用：${cfg.fallbacks.map(f=>`<span class="api-model-tag">${esc(f)}</span>`).join(' → ')}</p>`:''}</div>`;
  } catch { $('api-providers').innerHTML='<div class="empty">加载失败</div>'; }
}
function loadSysInfo() {
  $('sys-info').innerHTML=`<div class="info-item"><span class="info-label">系统</span><span class="info-value">macOS</span></div><div class="info-item"><span class="info-label">运行时</span><span class="info-value">Node.js</span></div><div class="info-item"><span class="info-label">端口</span><span class="info-value">3456</span></div><div class="info-item"><span class="info-label">会话数</span><span class="info-value">${sessionsData.length}</span></div><div class="info-item"><span class="info-label">OpenClaw</span><span class="info-value">v2026.6.10</span></div><div class="info-item"><span class="info-label">网关</span><span class="info-value">:18789</span></div>`;
}

// === 初始化 ===

// ==========================================
// 新增功能模块
// ==========================================

// === #3 对话导出 ===
function exportSession(sid, format) {
  fetch(API+'/session/'+sid).then(r=>r.json()).then(d => {
    if (!d||d.error) return;
    let content = '', filename = '', mime = '';
    const title = d.summary || 'session';
    const date = new Date(d.startedAt||Date.now()).toISOString().slice(0,10);

    if (format === 'md') {
      content = `# ${title}\n\n> 渠道: ${d.channel} | 模型: ${d.model} | 时间: ${fmtTime(d.startedAt)}\n\n---\n\n`;
      if (d.conversation) for (const m of d.conversation) {
        if (m.role==='user') content += `## 👤 用户\n\n${m.text}\n\n`;
        else if (m.role==='assistant') content += `## 🤖 助手\n\n${m.text||''}\n\n`;
        else if (m.role==='toolResult') content += `> 🔧 工具结果: ${m.result||''}\n\n`;
      }
      filename = `${title}-${date}.md`; mime = 'text/markdown';
    } else {
      content = JSON.stringify(d, null, 2);
      filename = `${title}-${date}.json`; mime = 'application/json';
    }

    const blob = new Blob([content], {type:mime});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  });
}

// === #4 Prompt 模板库 ===
const TEMPLATES = [
  {name:'📝 代码审查', prompt:'请审查以下代码，指出潜在的 bug、安全问题和性能优化建议：\n\n```\n\n```', desc:'检查代码质量和安全性'},
  {name:'🌐 翻译', prompt:'请将以下内容翻译成{语言}，保持原意和语气：\n\n', desc:'多语言翻译'},
  {name:'📊 数据分析', prompt:'请分析以下数据，找出趋势、异常值和关键洞察：\n\n', desc:'数据解读和可视化建议'},
  {name:'🐛 Debug', prompt:'请帮我排查以下错误，给出修复方案：\n\n错误信息：\n复现步骤：\n', desc:'快速定位和修复 bug'},
  {name:'📖 总结', prompt:'请用 3-5 个要点总结以下内容：\n\n', desc:'长文快速摘要'},
  {name:'🎯 学习计划', prompt:'我想学习{主题}，请制定一个 30 天的学习计划，每天 1 小时。', desc:'个性化学习路径'},
  {name:'📧 邮件撰写', prompt:'请帮我写一封{场景}的邮件，语气{正式/友好}：\n\n', desc:'商务/个人邮件'},
  {name:'🧪 测试用例', prompt:'请为以下函数编写全面的测试用例，包括边界情况：\n\n```\n\n```', desc:'自动生成单元测试'},
  {name:'🏗️ 架构设计', prompt:'请帮我设计{系统名称}的技术架构，要求：\n- 技术栈：\n- 用户规模：\n- 核心功能：', desc:'系统架构方案'},
  {name:'💡 头脑风暴', prompt:'关于{主题}，请从 5 个不同角度给出创新想法，每个附带可行性评估。', desc:'创意发散思维'},
  {name:'🔍 代码解释', prompt:'请逐行解释以下代码的功能和原理：\n\n```\n\n```', desc:'理解复杂代码'},
  {name:'📋 会议纪要', prompt:'请根据以下会议记录，整理成结构化的会议纪要，包括：议题、决议、待办事项、负责人：\n\n', desc:'会议记录整理'},
];

function initTemplates() {
  const grid = $('template-grid');
  grid.innerHTML = TEMPLATES.map((t,i) => `<div class="template-card" data-idx="${i}">
    <div class="template-name">${esc(t.name)}</div>
    <div class="template-desc">${esc(t.desc)}</div>
  </div>`).join('');
  grid.querySelectorAll('.template-card').forEach(el => {
    el.addEventListener('click', () => {
      const t = TEMPLATES[el.dataset.idx];
      $('chat-input').value = t.prompt;
      $('chat-input').focus();
      $('template-overlay').classList.remove('show');
    });
  });
}

// === #10 会话收藏 ===
function getFavorites() { try { return JSON.parse(localStorage.getItem('favorites')||'[]'); } catch { return []; } }
function toggleFavorite(sid) {
  const favs = getFavorites();
  const idx = favs.indexOf(sid);
  if (idx >= 0) favs.splice(idx, 1); else favs.push(sid);
  localStorage.setItem('favorites', JSON.stringify(favs));
  renderSessionList();
}
function isFavorite(sid) { return getFavorites().includes(sid); }

// === #13 标签系统 ===
function getTags() { try { return JSON.parse(localStorage.getItem('sessionTags')||'{}'); } catch { return {}; } }
function setTag(sid, tag) {
  const tags = getTags();
  if (!tags[sid]) tags[sid] = [];
  if (!tags[sid].includes(tag)) tags[sid].push(tag); else tags[sid] = tags[sid].filter(t => t !== tag);
  localStorage.setItem('sessionTags', JSON.stringify(tags));
  renderSessionList();
}
function getSessionTags(sid) { return getTags()[sid] || []; }

const TAG_PRESETS = [
  {name:'工作', cls:'work'}, {name:'学习', cls:'study'},
  {name:'项目', cls:'project'}, {name:'个人', cls:'personal'},
];

// === #1 多模型对比 ===
function initCompare() {
  $('compare-run').addEventListener('click', async () => {
    const prompt = $('compare-prompt').value.trim();
    if (!prompt) return;
    const cfg = await fetch(API+'/config').then(r=>r.json());
    const models = cfg.providers.flatMap(p => p.models.map(m => ({id:m.id, provider:p.name})));
    $('compare-results').innerHTML = models.slice(0,4).map(m => `<div class="compare-panel">
      <div class="compare-header">${esc(m.provider)} / ${esc(m.id)}</div>
      <div class="compare-body" id="compare-${m.id.replace(/[^a-z0-9]/gi,'_')}"><div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div></div></div>
    </div>`).join('');
    // 并发请求各模型
    for (const m of models.slice(0,4)) {
      const elId = 'compare-'+m.id.replace(/[^a-z0-9]/gi,'_');
      fetch(API+'/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:`[${m.provider}/${m.id}] ${prompt}`})})
        .then(r=>r.json()).then(d => {
          const el = document.getElementById(elId);
          if (el) el.innerHTML = `<div class="md-content">${renderMarkdown(d.text||d.message||JSON.stringify(d).slice(0,300))}</div>`;
        }).catch(e => {
          const el = document.getElementById(elId);
          if (el) el.innerHTML = `<span style="color:var(--red)">错误: ${e.message}</span>`;
        });
    }
  });
}

// === #5 Token 预算 ===
function getBudget() { try { return JSON.parse(localStorage.getItem('tokenBudget')||'{"monthly":1000000,"used":0}'); } catch { return {monthly:1000000,used:0}; } }
function setBudget(monthly) { localStorage.setItem('tokenBudget', JSON.stringify({monthly,used:0})); }
function updateBudgetUsage(tokens) {
  const b = getBudget(); b.used += tokens; localStorage.setItem('tokenBudget', JSON.stringify(b));
}
function showBudget() {
  const b = getBudget();
  const pct = Math.min(b.used/b.monthly*100, 100);
  const cls = pct < 60 ? 'ok' : pct < 85 ? 'warn' : 'danger';
  $('budget-body').innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:32px;font-weight:800;color:var(--${cls})">${fmt(b.used)}</div>
      <div style="font-size:12px;color:var(--text-tertiary)">/ ${fmt(b.monthly)} 本月</div>
    </div>
    <div class="budget-bar"><div class="budget-fill ${cls}" style="width:${pct}%"></div></div>
    <div class="budget-info"><span>${pct.toFixed(1)}% 已用</span><span>${fmt(b.monthly - b.used)} 剩余</span></div>
    <div style="margin-top:16px">
      <div class="settings-row"><span>月度预算</span>
        <input type="number" id="budget-input" value="${b.monthly}" style="width:120px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;text-align:right">
      </div>
      <button class="header-btn" style="margin-top:8px;width:100%" onclick="setBudget(parseInt($('budget-input').value));showBudget()">保存</button>
    </div>
  `;
  $('budget-overlay').classList.add('show');
}

// === #6 性能对比 ===
function showPerf() {
  const models = {};
  sessionsData.forEach(s => {
    if (!models[s.model]) models[s.model] = {sessions:0, totalTokens:0, totalMessages:0};
    models[s.model].sessions++;
    models[s.model].totalTokens += s.tokenUsage.total;
    models[s.model].totalMessages += s.messageCount;
  });
  const maxTokens = Math.max(...Object.values(models).map(m=>m.totalTokens),1);
  $('perf-body').innerHTML = `<table class="perf-table">
    <tr><th>模型</th><th>会话</th><th>消息</th><th>Token 用量</th><th>占比</th></tr>
    ${Object.entries(models).sort((a,b)=>b[1].totalTokens-a[1].totalTokens).map(([name,m])=>
      `<tr>
        <td><strong style="font-family:'SF Mono',monospace;font-size:12px">${esc(name)}</strong></td>
        <td>${m.sessions}</td>
        <td>${m.totalMessages}</td>
        <td><div class="perf-bar"><div class="perf-bar-fill" style="width:${m.totalTokens/maxTokens*100}%"></div></div>${fmt(m.totalTokens)}</td>
        <td style="color:var(--accent);font-weight:600">${(m.totalTokens/sessionsData.reduce((s,x)=>s+x.tokenUsage.total,0)*100).toFixed(1)}%</td>
      </tr>`).join('')}
  </table>`;
  $('perf-overlay').classList.add('show');
}

// === #11 Markdown 渲染增强 ===
function renderMarkdown(text) {
  if (!text) return '';
  let html = esc(text);
  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // 粗体/斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // 引用
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // 列表
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  // 表格行
  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split('|').filter(Boolean).map(c=>c.trim());
    if (cells.every(c=>/^[-:]+$/.test(c))) return '';
    return '<tr>' + cells.map(c=>'<td>'+c+'</td>').join('') + '</tr>';
  });
  // 换行
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  return html;
}

// === #14 用量仪表盘增强 ===
function renderEnhancedStats() {
  const total = sessionsData.reduce((s,x)=>s+x.tokenUsage.total,0);
  const input = sessionsData.reduce((s,x)=>s+x.tokenUsage.input,0);
  const output = sessionsData.reduce((s,x)=>s+x.tokenUsage.output,0);
  const cache = sessionsData.reduce((s,x)=>s+x.tokenUsage.cache,0);
  const cacheRate = input > 0 ? (cache/input*100).toFixed(1) : '0';
  $('stat-tokens-sub').textContent = `输入 ${fmt(input)} · 输出 ${fmt(output)} · 缓存 ${cacheRate}%`;
  // 更新预算使用量
  updateBudgetUsage(total);
}

// === 初始化所有新功能 ===
function initAllFeatures() {
  // Prompt 模板按钮
  const chatArea = document.querySelector('.chat-input-area');
  if (chatArea) {
    const tplBtn = document.createElement('button');
    tplBtn.className = 'header-btn secondary';
    tplBtn.textContent = '📋';
    tplBtn.title = 'Prompt 模板';
    tplBtn.onclick = () => { initTemplates(); $('template-overlay').classList.add('show'); };
    chatArea.insertBefore(tplBtn, chatArea.querySelector('.send-btn'));
  }

  // 设置面板新增项
  const settingsBody = document.querySelector('#settings-overlay .modal-body');
  if (settingsBody) {
    const extra = document.createElement('div');
    extra.className = 'settings-section';
    extra.innerHTML = `
      <div class="settings-title">🛠️ 工具</div>
      <div class="settings-row"><span>多模型对比</span><button class="header-btn secondary" onclick="$('settings-overlay').classList.remove('show');$('compare-overlay').classList.add('show')">打开</button></div>
      <div class="settings-row"><span>Token 预算</span><button class="header-btn secondary" onclick="$('settings-overlay').classList.remove('show');showBudget()">设置</button></div>
      <div class="settings-row"><span>模型性能</span><button class="header-btn secondary" onclick="$('settings-overlay').classList.remove('show');showPerf()">查看</button></div>
    `;
    settingsBody.appendChild(extra);
  }

  // 会话列表增强（收藏星标 + 标签）
  const origRender = window.renderSessionList;
  window.renderSessionList = function() {
    const filtered = currentFilter === 'all' ? sessionsData :
      currentFilter === 'fav' ? sessionsData.filter(s => isFavorite(s.sessionId)) :
      sessionsData.filter(s => s.channel === currentFilter);
    $('session-count').textContent = `${filtered.length} / ${sessionsData.length}`;
    if (!filtered.length) { $('session-list').innerHTML = '<div class="empty"><div class="empty-icon">📭</div>没有匹配的会话</div>'; return; }
    $('session-list').innerHTML = filtered.map(s => {
      const tags = getSessionTags(s.sessionId);
      const tagHtml = tags.map(t => `<span class="tag ${TAG_PRESETS.find(p=>p.name===t)?.cls||''}">${t}</span>`).join('');
      return `<div class="session-item" data-sid="${s.sessionId}">
        <span class="fav-star ${isFavorite(s.sessionId)?'active':''}" data-sid="${s.sessionId}" onclick="event.stopPropagation();toggleFavorite('${s.sessionId}')">★</span>
        <span class="ch ${s.channel}">${s.channel}</span>
        <div class="session-info">
          <div class="session-summary">${esc(s.summary)}</div>
          <div class="tag-bar">${tagHtml}<input class="tag-input" placeholder="+" onkeydown="if(event.key==='Enter'){event.stopPropagation();setTag('${s.sessionId}',this.value);this.value='';renderSessionList();}"></div>
          <div class="session-meta">
            <span>💬 ${s.messageCount}条</span><span>🔧 ${s.toolCallCount}次</span><span>📊 ${fmt(s.tokenUsage.total)}</span><span>🤖 ${esc(s.model)}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="session-time">${fmtTime(s.lastInteractionAt)}</span>
          <div class="export-btns">
            <button class="export-btn" onclick="event.stopPropagation();exportSession('${s.sessionId}','md')">MD</button>
            <button class="export-btn" onclick="event.stopPropagation();exportSession('${s.sessionId}','json')">JSON</button>
          </div>
        </div>
      </div>`;
    }).join('');
    $('session-list').querySelectorAll('.session-item').forEach(el => el.addEventListener('click', () => openSessionDetail(el.dataset.sid)));
  };

  // 筛选栏增加"收藏"
  const filterBar = $('filter-bar');
  if (filterBar) {
    const favChip = document.createElement('span');
    favChip.className = 'filter-chip';
    favChip.dataset.filter = 'fav';
    favChip.textContent = '⭐ 收藏';
    filterBar.appendChild(favChip);
    favChip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      favChip.classList.add('active'); currentFilter = 'fav'; renderSessionList();
    });
  }

  // 增强统计
  const origStats = window.renderStats;
  window.renderStats = function() { origStats(); renderEnhancedStats(); };

  initCompare();
}




document.addEventListener('DOMContentLoaded', () => {
  loadData(); connectSSE(); initChat(); initDarkMode(); initSettings(); initSearch(); initModelSwitch(); initRestart();
  initAllFeatures();
});
