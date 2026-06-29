# 🦞 OpenClaw Console

本地 AI 助手控制面板，为 [OpenClaw](https://github.com/openclaw/openclaw) 设计。

## 功能

- 📊 **总览仪表盘** — 会话数、消息数、Token 用量统计
- 📋 **历史会话** — 查看所有对话记录（OpenClaw + Claude Code）
- 📡 **渠道状态** — 微信、Telegram、终端连接状态
- 🤖 **模型分布** — 各模型使用占比
- 📈 **Token 趋势** — 按日期的用量图表
- 🔍 **全文搜索** — 搜索所有会话内容
- ⚠️ **风险检测** — 自动检测危险命令
- 🤖 **实时对话** — 内置聊天窗口
- ⚙️ **设置面板** — API 管理、夜间模式、系统信息
- 🔄 **SSE 实时更新** — 新消息自动刷新

## 快速开始

### 前提条件

- macOS (Apple Silicon M1+)
- Node.js 18+
- [OpenClaw](https://github.com/openclaw/openclaw) 已安装并配置

### 安装

1. 下载 `OpenClaw-Console.app` 并拖入 Applications
2. 或手动运行：

```bash
git clone https://github.com/xmgzxmgz/openclaw-console.git
cd openclaw-console
node server.js
```

3. 打开 http://localhost:3456

### Mac App

双击 `OpenClaw-Console.app` 即可启动，自动打开独立窗口。

## 架构

```
openclaw-console/
├── server.js          # Node.js 后端（端口 3456）
├── public/
│   ├── index.html     # 主页面
│   ├── style.css      # 样式（支持暗色模式）
│   └── app.js         # 前端逻辑
└── OpenClaw-Console.app/  # Mac 原生应用
```

## API

| 端点 | 说明 |
|------|------|
| `GET /api/sessions` | 所有会话列表 |
| `GET /api/session/:id` | 会话详情 |
| `GET /api/config` | API 配置信息 |
| `GET /api/events` | SSE 实时事件流 |
| `POST /api/chat` | 聊天代理 |

## 截图

![OpenClaw Console](screenshot.png)

## 许可

MIT

## 多平台支持

### macOS（原生 App）
```bash
# 下载 OpenClaw-Console-v1.0-mac.zip，解压后双击 .app
```

### Windows
```bash
# 下载 OpenClaw-Console-v1.0-win.zip
# 确保已安装 Node.js，双击 start.bat
```

### Linux
```bash
# 下载 OpenClaw-Console-v1.0-linux.zip
chmod +x start-linux.sh
./start-linux.sh
```

### 手机（PWA）
1. 在电脑上启动服务
2. 手机浏览器访问 `http://电脑IP:3456`
3. Safari: 分享 → 添加到主屏幕
4. Chrome: 菜单 → 安装应用
