const http = require('http');
const fs = require('fs');
const path = require('path');
const { readFile, readdir } = require('fs/promises');

// ============================================================
// 配置
// ============================================================
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';
const PORT = parseInt(process.env.PORT, 10) || 3456;
const HOME = process.env.HOME;

const OPENCLAW_SESSIONS_DIR = path.join(HOME, '.openclaw/agents/main/sessions');
const OPENCLAW_SESSIONS_INDEX = path.join(OPENCLAW_SESSIONS_DIR, 'sessions.json');
const CLAUDE_PROJECTS_DIR = path.join(HOME, '.claude/projects');
const OPENCLAW_CONFIG_PATH = path.join(HOME, '.openclaw/openclaw.json');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ============================================================
// 风险检测规则
// ============================================================
const RISK_RULES = [
  // 高危 — 文件系统破坏
  { pattern: /rm\s+(-[rRf]+\s+|--recursive)/, level: 'high', desc: '递归删除文件 (rm -rf)' },
  { pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+\/|--no-preserve-root)/, level: 'critical', desc: '删除根目录' },
  { pattern: />\s*\/dev\/sd[a-z]/, level: 'critical', desc: '直接写入磁盘设备' },
  { pattern: /mkfs\./, level: 'critical', desc: '格式化文件系统' },
  { pattern: /dd\s+.*of=\/dev/, level: 'critical', desc: 'dd 写入设备' },

  // 高危 — 权限提升
  { pattern: /\bsudo\b/, level: 'high', desc: '使用 sudo 提权' },
  { pattern: /chmod\s+777/, level: 'high', desc: 'chmod 777 全开权限' },
  { pattern: /chmod\s+.*\+s/, level: 'high', desc: '设置 SUID/SGID 位' },
  { pattern: /chown\s+root/, level: 'high', desc: '变更为 root 所有者' },

  // 高危 — 网络/下载
  { pattern: /curl\s.*\|\s*(ba)?sh/, level: 'high', desc: '远程脚本管道执行 (curl|sh)' },
  { pattern: /wget\s.*\|\s*(ba)?sh/, level: 'high', desc: '远程脚本管道执行 (wget|sh)' },
  { pattern: /curl\s.*-o\s.*&&.*chmod.*\+x/, level: 'high', desc: '下载并执行二进制文件' },

  // 中危 — 敏感操作
  { pattern: /\bkill\s+-9\s+1\b/, level: 'high', desc: '杀死 init 进程' },
  { pattern: /\bpkill\b/, level: 'medium', desc: '批量杀进程 (pkill)' },
  { pattern: /\bkillall\b/, level: 'medium', desc: '批量杀进程 (killall)' },
  { pattern: /\/etc\/passwd/, level: 'medium', desc: '访问密码文件' },
  { pattern: /\/etc\/shadow/, level: 'high', desc: '访问 shadow 密码文件' },
  { pattern: /\.ssh\/id_rsa/, level: 'medium', desc: '访问 SSH 私钥' },
  { pattern: /env\s*\|\s*grep.*KEY/i, level: 'medium', desc: '读取环境变量中的密钥' },

  // 低危 — 注意事项
  { pattern: /npm\s+install\s+-g/, level: 'low', desc: '全局安装 npm 包' },
  { pattern: /pip\s+install/, level: 'low', desc: '安装 Python 包' },
  { pattern: /git\s+push\s+.*--force/, level: 'medium', desc: 'Git 强制推送' },
  { pattern: /git\s+reset\s+--hard/, level: 'medium', desc: 'Git 硬重置' },
];

// ============================================================
// 工具函数
// ============================================================

/** 解析 JSONL 文件为对象数组 */
async function parseJsonl(filePath) {
  const content = await readFile(filePath, 'utf-8').catch(() => '');
  return content
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

/** 检查目录是否存在且为目录 */
function isDirectory(dirPath) {
  try { return fs.statSync(dirPath).isDirectory(); } catch { return false; }
}

/** 检测工具调用中的风险 */
function detectRisks(messages) {
  const risks = [];
  for (const msg of messages) {
    if (!Array.isArray(msg.message?.content)) continue;
    for (const part of msg.message.content) {
      if (part.type !== 'toolCall') continue;
      const argsString = JSON.stringify(part.arguments || {});
      for (const rule of RISK_RULES) {
        if (rule.pattern.test(argsString)) {
          risks.push({ level: rule.level, desc: rule.desc });
        }
      }
    }
  }
  return risks;
}

/** 判断会话渠道 */
function detectChannel(key, sessionId) {
  if (key.includes('openclaw-weixin')) return '微信';
  if (key.includes('telegram')) return 'Telegram';
  if (key.includes('main:main')) return '终端';
  if (sessionId.startsWith('model-run-')) return '模型测试';
  return '其他';
}

/** 截取摘要文本 */
function extractSummary(content) {
  if (typeof content === 'string') return content.slice(0, 80);
  if (Array.isArray(content)) {
    const textPart = content.find(x => x.type === 'text');
    return (textPart?.text || '').slice(0, 80);
  }
  return '';
}

// ============================================================
// OpenClaw 会话扫描
// ============================================================
async function scanOpenClawSessions() {
  if (!fs.existsSync(OPENCLAW_SESSIONS_DIR)) return [];

  const files = (await readdir(OPENCLAW_SESSIONS_DIR))
    .filter(f => f.endsWith('.jsonl') && !f.includes('trajectory'));

  const indexData = JSON.parse(
    await readFile(OPENCLAW_SESSIONS_INDEX, 'utf-8').catch(() => '{}')
  );
  const metaBySessionId = {};
  for (const [key, meta] of Object.entries(indexData)) {
    metaBySessionId[meta.sessionId] = { key, ...meta };
  }

  const sessions = [];

  for (const file of files) {
    const sessionId = file.replace('.jsonl', '');
    const lines = await parseJsonl(path.join(OPENCLAW_SESSIONS_DIR, file));
    if (lines.length < 2) continue;

    const messages = lines.filter(l => l.type === 'message');
    const meta = metaBySessionId[sessionId] || {};

    // Token 统计
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
    const toolNames = [];

    for (const msg of messages) {
      const usage = msg.message?.usage;
      if (usage) {
        totalInput += usage.input || 0;
        totalOutput += usage.output || 0;
        totalCacheRead += usage.cacheRead || 0;
        totalCacheWrite += usage.cacheWrite || 0;
      }
      if (Array.isArray(msg.message?.content)) {
        for (const part of msg.message.content) {
          if (part.type === 'toolCall') toolNames.push(part.name);
        }
      }
    }

    // 风险检测
    const risks = detectRisks(messages);

    // 元数据
    const key = meta.key || sessionId;
    const channel = detectChannel(key, sessionId);
    const firstUserMsg = messages.find(m => m.message?.role === 'user');
    const lastAssistantMsg = messages.filter(m => m.message?.role === 'assistant').pop();
    const summary = extractSummary(firstUserMsg?.message?.content) || '(无文本)';

    sessions.push({
      sessionId,
      source: 'openclaw',
      channel,
      summary,
      startedAt: meta.sessionStartedAt || null,
      lastInteractionAt: meta.lastInteractionAt || null,
      model: lastAssistantMsg?.message?.model || 'unknown',
      provider: lastAssistantMsg?.message?.provider || 'unknown',
      tokenUsage: {
        input: totalInput,
        output: totalOutput,
        cacheRead: totalCacheRead,
        cacheWrite: totalCacheWrite,
        total: totalInput + totalOutput + totalCacheRead + totalCacheWrite,
      },
      messageCount: messages.length,
      toolCallCount: toolNames.length,
      toolCalls: [...new Set(toolNames)],
      risks,
    });
  }

  return sessions;
}

// ============================================================
// Claude Code 会话扫描
// ============================================================
async function scanClaudeSessions() {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];

  const subdirs = (await readdir(CLAUDE_PROJECTS_DIR))
    .filter(d => isDirectory(path.join(CLAUDE_PROJECTS_DIR, d)));

  const sessions = [];

  for (const dir of subdirs) {
    const dirPath = path.join(CLAUDE_PROJECTS_DIR, dir);
    const files = (await readdir(dirPath))
      .filter(f => f.endsWith('.jsonl') && !f.includes('subagent'));

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const lines = await parseJsonl(path.join(dirPath, file));

      const humanMsgs = lines.filter(l => l.type === 'user');
      const assistantMsgs = lines.filter(l => l.type === 'assistant');
      if (!humanMsgs.length) continue;

      // Token 统计
      let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0;
      for (const msg of assistantMsgs) {
        const usage = msg.message?.usage || {};
        totalInput += usage.input_tokens || 0;
        totalOutput += usage.output_tokens || 0;
        totalCacheRead += usage.cache_read_input_tokens || 0;
        totalCacheCreation += usage.cache_creation_input_tokens || 0;
      }

      const firstMsg = humanMsgs[0];
      const summary = extractSummary(firstMsg.message?.content) || '(无文本)';
      const firstTimestamp = firstMsg.timestamp || firstMsg.message?.timestamp;
      const lastTimestamp = assistantMsgs.length
        ? assistantMsgs[assistantMsgs.length - 1].timestamp || firstTimestamp
        : firstTimestamp;
      const model = assistantMsgs[assistantMsgs.length - 1]?.message?.model || 'unknown';

      sessions.push({
        sessionId,
        source: 'claude-code',
        channel: '终端',
        summary,
        startedAt: firstTimestamp,
        lastInteractionAt: lastTimestamp,
        model,
        provider: 'anthropic',
        tokenUsage: {
          input: totalInput,
          output: totalOutput,
          cacheRead: totalCacheRead,
          cacheCreation: totalCacheCreation,
          total: totalInput + totalOutput + totalCacheRead + totalCacheCreation,
        },
        messageCount: humanMsgs.length + assistantMsgs.length,
        toolCallCount: 0,
        toolCalls: [],
        risks: [],
      });
    }
  }

  return sessions;
}

// ============================================================
// 合并与排序
// ============================================================
async function getAllSessions() {
  const [openclawSessions, claudeSessions] = await Promise.all([
    scanOpenClawSessions(),
    scanClaudeSessions(),
  ]);
  const all = [...openclawSessions, ...claudeSessions];
  all.sort((a, b) => {
    const timeA = typeof a.lastInteractionAt === 'number'
      ? a.lastInteractionAt
      : new Date(a.lastInteractionAt || 0).getTime();
    const timeB = typeof b.lastInteractionAt === 'number'
      ? b.lastInteractionAt
      : new Date(b.lastInteractionAt || 0).getTime();
    return timeB - timeA;
  });
  return all;
}

// ============================================================
// 会话详情
// ============================================================
async function getSessionDetail(sessionId) {
  // 在 OpenClaw 目录查找
  let filePath = path.join(OPENCLAW_SESSIONS_DIR, sessionId + '.jsonl');

  // 在 Claude Code 目录查找
  if (!fs.existsSync(filePath) && fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    const subdirs = (await readdir(CLAUDE_PROJECTS_DIR))
      .filter(d => isDirectory(path.join(CLAUDE_PROJECTS_DIR, d)));
    for (const dir of subdirs) {
      const candidate = path.join(CLAUDE_PROJECTS_DIR, dir, sessionId + '.jsonl');
      if (fs.existsSync(candidate)) { filePath = candidate; break; }
    }
  }

  if (!fs.existsSync(filePath)) return null;

  const isClaudeCode = filePath.includes('.claude');
  const allSessions = await getAllSessions();
  const meta = allSessions.find(s => s.sessionId === sessionId) || {};
  const lines = await parseJsonl(filePath);
  const conversation = [];

  for (const line of lines) {
    if (isClaudeCode) {
      if (line.type === 'user') {
        conversation.push({
          role: 'user',
          timestamp: line.timestamp,
          text: extractSummary(line.message?.content),
        });
      } else if (line.type === 'assistant') {
        const parts = Array.isArray(line.message?.content) ? line.message.content : [];
        const textParts = parts.filter(p => p.type === 'text').map(p => p.text).join('\n');
        const toolCalls = parts
          .filter(p => p.type === 'tool_use')
          .map(p => ({ name: p.name, arguments: p.input }));
        const usage = line.message?.usage;
        conversation.push({
          role: 'assistant',
          timestamp: line.timestamp,
          text: textParts,
          toolCalls,
          usage: usage ? {
            input: usage.input_tokens,
            output: usage.output_tokens,
            cacheRead: usage.cache_read_input_tokens,
            cacheCreation: usage.cache_creation_input_tokens,
            totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
              + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
          } : null,
        });
      } else if (line.type === 'tool_result') {
        const resultText = typeof line.content === 'string'
          ? line.content.slice(0, 500)
          : Array.isArray(line.content)
            ? line.content.map(x => x.text || '').join('\n').slice(0, 500)
            : '';
        conversation.push({
          role: 'tool',
          timestamp: line.timestamp,
          toolName: line.tool_use_id || '',
          isError: line.is_error || false,
          result: resultText,
        });
      }
    } else {
      if (line.type !== 'message') continue;
      const msg = line.message;
      if (!msg) continue;

      const entry = { role: msg.role, timestamp: line.timestamp };

      if (msg.role === 'user') {
        entry.text = extractSummary(msg.content);
      } else if (msg.role === 'assistant') {
        const parts = Array.isArray(msg.content) ? msg.content : [];
        entry.text = parts.filter(p => p.type === 'text').map(p => p.text).join('\n');
        entry.toolCalls = parts
          .filter(p => p.type === 'toolCall')
          .map(p => ({ name: p.name, arguments: p.arguments }));
        entry.usage = msg.usage;
      } else if (msg.role === 'toolResult') {
        entry.toolName = msg.toolName;
        entry.isError = msg.isError;
        const content = msg.content;
        entry.result = typeof content === 'string'
          ? content.slice(0, 500)
          : Array.isArray(content)
            ? content.map(x => x.text || '').join('\n').slice(0, 500)
            : '';
      }

      conversation.push(entry);
    }
  }

  return { ...meta, conversation };
}

// ============================================================
// 全文搜索
// ============================================================
async function searchSessions(query) {
  const q = query.toLowerCase();
  if (!q) return [];

  const sessions = await getAllSessions();
  const results = [];

  for (const session of sessions) {
    // 先在元数据中搜索
    const metaMatch =
      session.summary.toLowerCase().includes(q) ||
      session.model.toLowerCase().includes(q) ||
      session.channel.toLowerCase().includes(q);

    if (metaMatch) {
      results.push({ ...session, matchType: 'meta', matchText: session.summary });
      continue;
    }

    // 搜索会话内容
    try {
      const detail = await getSessionDetail(session.sessionId);
      if (!detail?.conversation) continue;

      for (const msg of detail.conversation) {
        const text = msg.text || msg.result || '';
        if (text.toLowerCase().includes(q)) {
          const matchIndex = text.toLowerCase().indexOf(q);
          const start = Math.max(0, matchIndex - 30);
          const end = Math.min(text.length, matchIndex + q.length + 30);
          const snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');

          results.push({
            ...session,
            matchType: 'content',
            matchText: snippet,
            matchRole: msg.role,
          });
          break; // 每个会话只返回一个内容匹配
        }
      }
    } catch {
      // 忽略解析错误
    }
  }

  return results;
}

// ============================================================
// 配置读取
// ============================================================
async function getConfig() {
  const raw = await readFile(OPENCLAW_CONFIG_PATH, 'utf-8').catch(() => '{}');
  const config = JSON.parse(raw);
  const providers = config.models?.providers || {};
  const result = [];

  for (const [name, provider] of Object.entries(providers)) {
    result.push({
      name,
      baseUrl: provider.baseUrl || '',
      hasKey: !!provider.apiKey,
      models: (provider.models || []).map(m => ({
        id: m.id,
        name: m.name,
        api: m.api,
        contextWindow: m.contextWindow,
      })),
    });
  }

  return {
    providers: result,
    defaultModel: config.agents?.defaults?.model?.primary || 'unknown',
    fallbacks: config.agents?.defaults?.model?.fallbacks || [],
  };
}

// ============================================================
// SSE 实时推送
// ============================================================
const sseClients = new Set();

function broadcastSSE(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

function watchSessions() {
  if (fs.existsSync(OPENCLAW_SESSIONS_DIR)) {
    fs.watch(OPENCLAW_SESSIONS_DIR, { persistent: false }, () => broadcastSSE({ type: 'refresh' }));
  }
  if (fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    fs.watch(CLAUDE_PROJECTS_DIR, { persistent: false }, () => broadcastSSE({ type: 'refresh' }));
    const subdirs = fs.readdirSync(CLAUDE_PROJECTS_DIR).filter(d => isDirectory(path.join(CLAUDE_PROJECTS_DIR, d)));
    for (const dir of subdirs) {
      try {
        fs.watch(path.join(CLAUDE_PROJECTS_DIR, dir), { persistent: false }, () => broadcastSSE({ type: 'refresh' }));
      } catch { /* 忽略不可监听的目录 */ }
    }
  }
}

// ============================================================
// HTTP 服务器
// ============================================================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    // ---- API 路由 ----

    // GET /api/sessions — 获取所有会话列表
    if (url.pathname === '/api/sessions') {
      const sessions = await getAllSessions();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sessions));
      return;
    }

    // GET /api/session/:id — 获取会话详情
    if (url.pathname.startsWith('/api/session/')) {
      const sessionId = url.pathname.split('/api/session/')[1];
      const detail = await getSessionDetail(sessionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(detail || { error: 'not found' }));
      return;
    }

    // GET /api/search?q=xxx — 全文搜索
    if (url.pathname === '/api/search') {
      const query = url.searchParams.get('q') || '';
      const results = await searchSessions(query);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));
      return;
    }

    // GET /api/config — 获取 OpenClaw 配置
    if (url.pathname === '/api/config') {
      const config = await getConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config));
      return;
    }

    // GET /api/events — SSE 实时事件流
    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // POST /api/chat — 代理聊天请求到 OpenClaw Gateway
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const chatRequest = JSON.parse(body);
          const gatewayPayload = {
            message: chatRequest.message,
          };
          // 支持指定模型
          if (chatRequest.model) {
            gatewayPayload.model = chatRequest.model;
          }

          const gatewayResponse = await fetch('http://127.0.0.1:18789/api/v1/agent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
            },
            body: JSON.stringify(gatewayPayload),
          });
          const data = await gatewayResponse.json();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    // ---- 静态文件 ----
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.join(__dirname, 'public', filePath);

    // 路径遍历防护
    if (!filePath.startsWith(path.join(__dirname, 'public'))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// 仅在直接运行时启动服务器（被 require 时不启动）
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🚀 OpenClaw Console 运行在 http://localhost:${PORT}`);
    watchSessions();
  });
}

// 导出供测试使用
module.exports = { searchSessions, detectRisks, getAllSessions, RISK_RULES, server };
