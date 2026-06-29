const http = require('http');
const fs = require('fs');
const path = require('path');
const { readFile, readdir } = require('fs/promises');

const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';
const PORT = 3456;
const HOME = process.env.HOME;
const OC_SESSIONS = path.join(HOME, '.openclaw/agents/main/sessions');
const OC_INDEX = path.join(OC_SESSIONS, 'sessions.json');
const CC_PROJECTS = path.join(HOME, '.claude/projects');
const CC_HISTORY = path.join(HOME, '.claude/history.jsonl');
const OC_CONFIG = path.join(HOME, '.openclaw/openclaw.json');

const MIME = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml' };

async function parseJsonl(fp) {
  const c = await readFile(fp,'utf-8').catch(()=>'');
  return c.split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
}

// === OpenClaw 会话 ===
async function scanOpenClawSessions() {
  if (!fs.existsSync(OC_SESSIONS)) return [];
  const files = (await readdir(OC_SESSIONS)).filter(f=>f.endsWith('.jsonl')&&!f.includes('trajectory'));
  const idx = JSON.parse(await readFile(OC_INDEX,'utf-8').catch(()=>'{}'));
  const metaBySid = {};
  for (const [k,m] of Object.entries(idx)) metaBySid[m.sessionId]={key:k,...m};

  const sessions = [];
  for (const file of files) {
    const sid = file.replace('.jsonl','');
    const lines = await parseJsonl(path.join(OC_SESSIONS,file));
    if (lines.length<2) continue;
    const msgs = lines.filter(l=>l.type==='message');
    const meta = metaBySid[sid]||{};
    const first = msgs.find(m=>m.message?.role==='user');
    const last = msgs.filter(m=>m.message?.role==='assistant').pop();
    let ti=0,to=0,tc=0; const tnames=[];
    for (const m of msgs) {
      if (m.message?.usage) { ti+=m.message.usage.input||0; to+=m.message.usage.output||0; tc+=m.message.usage.cacheRead||0; }
      if (Array.isArray(m.message?.content)) for (const c of m.message.content) if (c.type==='toolCall') { tnames.push(c.name); }
    }
    const risks=[];
    for (const m of msgs) if (Array.isArray(m.message?.content)) for (const c of m.message.content) if (c.type==='toolCall') {
      const a=JSON.stringify(c.arguments||{});
      if (/rm\s+-rf/.test(a)) risks.push({level:'high',desc:'删除文件 (rm -rf)'});
      if (/sudo/.test(a)) risks.push({level:'high',desc:'使用 sudo'});
    }
    const key=meta.key||sid;
    const ch=key.includes('openclaw-weixin')?'微信':key.includes('telegram')?'Telegram':key.includes('main:main')?'终端':sid.startsWith('model-run-')?'模型测试':'其他';
    const fc=first?.message?.content;
    const summary=typeof fc==='string'?fc.slice(0,80):Array.isArray(fc)?(fc.find(x=>x.type==='text')?.text||'').slice(0,80):'';
    sessions.push({sessionId:sid,source:'openclaw',channel:ch,summary:summary||'(无文本)',startedAt:meta.sessionStartedAt||null,lastInteractionAt:meta.lastInteractionAt||null,model:last?.message?.model||'unknown',provider:last?.message?.provider||'unknown',tokenUsage:{input:ti,output:to,cache:tc,total:ti+to},messageCount:msgs.length,toolCallCount:tnames.length,toolCalls:[...new Set(tnames)],risks});
  }
  return sessions;
}

// === Claude Code 会话 ===
async function scanClaudeSessions() {
  if (!fs.existsSync(CC_PROJECTS)) return [];
  const subdirs = (await readdir(CC_PROJECTS)).filter(d => {
    try { return fs.statSync(path.join(CC_PROJECTS, d)).isDirectory(); } catch { return false; }
  });
  const sessions = [];
  for (const dir of subdirs) {
    const dirPath = path.join(CC_PROJECTS, dir);
    const files = (await readdir(dirPath)).filter(f=>f.endsWith('.jsonl')&&!f.includes('subagent'));
    for (const file of files) {
      const sid = file.replace('.jsonl','');
      const fp = path.join(dirPath,file);
      const lines = await parseJsonl(fp);
      const humanMsgs = lines.filter(l=>l.type==='user');
      const asstMsgs = lines.filter(l=>l.type==='assistant');
      if (!humanMsgs.length) continue;

      let ti=0,to=0,tc=0;
      for (const m of asstMsgs) {
        const u=m.message?.usage||{};
        ti+=u.input_tokens||0; to+=u.output_tokens||0; tc+=u.cache_read_input_tokens||0;
      }
      const first=humanMsgs[0];
      const fc=first.message?.content;
      const summary=typeof fc==='string'?fc.slice(0,80):Array.isArray(fc)?(fc.find(x=>x.type==='text')?.text||'').slice(0,80):'';
      const firstTs=first.timestamp||first.message?.timestamp;
      const lastTs=asstMsgs.length?asstMsgs[asstMsgs.length-1].timestamp||firstTs:firstTs;
      const model=asstMsgs[asstMsgs.length-1]?.message?.model||'unknown';

      sessions.push({sessionId:sid,source:'claude-code',channel:'终端',summary:summary||'(无文本)',startedAt:firstTs,lastInteractionAt:lastTs,model,provider:'anthropic',tokenUsage:{input:ti,output:to,cache:tc,total:ti+to},messageCount:humanMsgs.length+asstMsgs.length,toolCallCount:0,toolCalls:[],risks:[]});
    }
  }
  return sessions;
}

// 合并所有会话
async function getAllSessions() {
  const [oc,cc] = await Promise.all([scanOpenClawSessions(),scanClaudeSessions()]);
  const all=[...oc,...cc];
  all.sort((a,b)=>{
    const ta=typeof a.lastInteractionAt==='number'?a.lastInteractionAt:new Date(a.lastInteractionAt||0).getTime();
    const tb=typeof b.lastInteractionAt==='number'?b.lastInteractionAt:new Date(b.lastInteractionAt||0).getTime();
    return tb-ta;
  });
  return all;
}

// 会话详情（通过 sessionId 查找文件，不暴露路径）
async function getSessionDetail(sid) {
  // 查找文件：先在 OpenClaw 会话目录，再遍历 Claude Code 子目录
  let fp = path.join(OC_SESSIONS, sid+'.jsonl');
  if (!fs.existsSync(fp) && fs.existsSync(CC_PROJECTS)) {
    const subdirs = (await readdir(CC_PROJECTS)).filter(d => {
      try { return fs.statSync(path.join(CC_PROJECTS, d)).isDirectory(); } catch { return false; }
    });
    for (const dir of subdirs) {
      const candidate = path.join(CC_PROJECTS, dir, sid+'.jsonl');
      if (fs.existsSync(candidate)) { fp = candidate; break; }
    }
  }
  if (!fs.existsSync(fp)) return null;

  // 判断来源
  const isCC = fp.includes('.claude');
  const all = await getAllSessions();
  const meta = all.find(x=>x.sessionId===sid) || {};

  const lines=await parseJsonl(fp);
  const conv=[];
  for (const l of lines) {
    if (isCC) {
      if (l.type==='user') {
        const c=l.message?.content;
        conv.push({role:'user',timestamp:l.timestamp,text:typeof c==='string'?c:Array.isArray(c)?c.filter(x=>x.type==='text').map(x=>x.text).join('\n'):''});
      } else if (l.type==='assistant') {
        const parts=Array.isArray(l.message?.content)?l.message.content:[];
        conv.push({role:'assistant',timestamp:l.timestamp,text:parts.filter(c=>c.type==='text').map(c=>c.text).join('\n'),toolCalls:parts.filter(c=>c.type==='tool_use').map(c=>({name:c.name,arguments:c.input})),usage:l.message?.usage?{input:l.message.usage.input_tokens,output:l.message.usage.output_tokens,cache:l.message.usage.cache_read_input_tokens,totalTokens:(l.message.usage.input_tokens||0)+(l.message.usage.output_tokens||0)}:null});
      } else if (l.type==='tool_result') {
        conv.push({role:'tool',timestamp:l.timestamp,toolName:l.tool_use_id||'',isError:l.is_error||false,result:typeof l.content==='string'?l.content.slice(0,500):Array.isArray(l.content)?l.content.map(x=>x.text||'').join('\n').slice(0,500):''});
      }
    } else {
      if (l.type!=='message') continue;
      const msg=l.message; if(!msg) continue;
      const entry={role:msg.role,timestamp:l.timestamp};
      if (msg.role==='user') { const c=msg.content; entry.text=typeof c==='string'?c:Array.isArray(c)?c.filter(x=>x.type==='text').map(x=>x.text).join('\n'):''; }
      else if (msg.role==='assistant') { const p=Array.isArray(msg.content)?msg.content:[]; entry.text=p.filter(c=>c.type==='text').map(c=>c.text).join('\n'); entry.toolCalls=p.filter(c=>c.type==='toolCall').map(c=>({name:c.name,arguments:c.arguments})); entry.usage=msg.usage; }
      else if (msg.role==='toolResult') { entry.toolName=msg.toolName; entry.isError=msg.isError; const c=msg.content; entry.result=typeof c==='string'?c.slice(0,500):Array.isArray(c)?c.map(x=>x.text||'').join('\n').slice(0,500):''; }
      conv.push(entry);
    }
  }
  return {...meta,conversation:conv};
}

// === 配置和 API 管理 ===
async function getConfig() {
  const raw=await readFile(OC_CONFIG,'utf-8').catch(()=>'{}');
  const cfg=JSON.parse(raw);
  const providers=cfg.models?.providers||{};
  const result=[];
  for (const [name,p] of Object.entries(providers)) {
    result.push({name,baseUrl:p.baseUrl||'',hasKey:!!p.apiKey,models:(p.models||[]).map(m=>({id:m.id,name:m.name,api:m.api,contextWindow:m.contextWindow}))});
  }
  return {providers:result,defaultModel:cfg.agents?.defaults?.model?.primary||'unknown',fallbacks:cfg.agents?.defaults?.model?.fallbacks||[]};
}

// === SSE ===
const sseClients=new Set();
function broadcastSSE(data) { const msg=`data: ${JSON.stringify(data)}\n\n`; for (const c of sseClients) c.write(msg); }
function watchSessions() {
  if (fs.existsSync(OC_SESSIONS)) fs.watch(OC_SESSIONS,{persistent:false},()=>broadcastSSE({type:'refresh'}));
  if (fs.existsSync(CC_PROJECTS)) {
    fs.watch(CC_PROJECTS,{persistent:false},()=>broadcastSSE({type:'refresh'}));
    const subdirs = fs.readdirSync(CC_PROJECTS).filter(d => {
      try { return fs.statSync(path.join(CC_PROJECTS, d)).isDirectory(); } catch { return false; }
    });
    for (const dir of subdirs) {
      try { fs.watch(path.join(CC_PROJECTS, dir),{persistent:false},()=>broadcastSSE({type:'refresh'})); } catch {}
    }
  }
}

// === HTTP ===
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin','*');
  if (req.method==='OPTIONS'){res.writeHead(204);res.end();return;}

  if (url.pathname==='/api/sessions') { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(await getAllSessions())); return; }
  if (url.pathname.startsWith('/api/session/')) { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(await getSessionDetail(url.pathname.split('/api/session/')[1])||{error:'not found'})); return; }
  if (url.pathname==='/api/config') { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(await getConfig())); return; }
  if (url.pathname==='/api/events') { res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'}); res.write(`data: ${JSON.stringify({type:'connected'})}\n\n`); sseClients.add(res); req.on('close',()=>sseClients.delete(res)); return; }

  // 代理聊天请求到 OpenClaw Gateway
  if (url.pathname==='/api/chat' && req.method==='POST') {
    let body=''; req.on('data',c=>body+=c); req.on('end', async()=>{
      try {
        const gwRes = await fetch('http://127.0.0.1:18789/api/v1/agent',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENCLAW_TOKEN}`},
          body
        });
        const data = await gwRes.json();
        res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        res.end(JSON.stringify(data));
      } catch(e) {
        res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:e.message}));
      }
    });
    return;
  }

  let fp=url.pathname==='/'?'/index.html':url.pathname;
  fp=path.join(__dirname,'public',fp);
  if (!fp.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); res.end('Forbidden'); return; }
  if (fs.existsSync(fp)&&fs.statSync(fp).isFile()) { res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'}); fs.createReadStream(fp).pipe(res); }
  else { res.writeHead(404); res.end('Not found'); }
});
server.listen(PORT,()=>{ console.log(`🚀 AI 控制台运行在 http://localhost:${PORT}`); watchSessions(); });
