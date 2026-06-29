<div align="center">

# 🦞 OpenClaw Console

**本地 AI 助手控制面板 — 为 [OpenClaw](https://github.com/openclaw/openclaw) 而生**

[![Version](https://img.shields.io/badge/version-v2.0-blue?style=flat-square)](https://github.com/xmgzxmgz/openclaw-console/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Mobile-lightgrey?style=flat-square)](#平台支持)
[![Node](https://img.shields.io/badge/node.js-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org/)
[![Stars](https://img.shields.io/github/stars/xmgzxmgz/openclaw-console?style=flat-square)](https://github.com/xmgzxmgz/openclaw-console/stargazers)

一个优雅、轻量的本地 Web 控制台，用于监控和管理你的 OpenClaw AI 助手。

[功能特性](#功能特性) · [快速开始](#快速开始) · [下载安装](#下载安装) · [截图](#截图) · [API 文档](#api-文档) · [贡献指南](#贡献指南)

</div>

---

## ✨ 功能特性

### 📊 总览仪表盘
- 实时统计：会话数、消息数、Token 用量、工具调用次数
- 渠道状态监控：微信、Telegram、终端连接状态
- Token 用量趋势图（按日期）
- 模型分布标签（各模型使用占比）
- 最近活动时间线

### 💬 会话管理
- **多渠道统一**：OpenClaw（微信/Telegram）+ Claude Code（终端）对话合并展示
- **实时同步**：SSE 推送，新消息自动刷新，无需手动刷新
- **全文搜索**：搜索所有会话内容、模型名、渠道
- **收藏标记**：星标重要会话，一键筛选
- **标签系统**：自定义标签（工作/学习/项目）分类管理
- **渠道筛选**：按微信/Telegram/终端/测试分类查看

### 📤 数据导出
- 导出为 **Markdown**（适合文档归档）
- 导出为 **JSON**（适合数据分析）
- 单会话导出，保留完整对话记录

### ⚖️ 多模型对比
- 同一问题并发发给多个模型
- 左右对比输出结果
- 模型性能统计表（会话数/消息数/Token/占比）

### 📋 Prompt 模板库
- 12 个常用模板：代码审查、翻译、Debug、总结、架构设计等
- 点击模板直接填入对话框
- 支持自定义扩展

### 💰 Token 预算管理
- 设置月度 Token 用量上限
- 实时进度条显示消耗情况
- 接近上限时颜色预警

### ⚠️ 风险检测
- 自动扫描历史会话中的危险命令
- 检测：`rm -rf`、`sudo`、`chmod 777`、管道执行远程脚本等
- 顶栏实时显示安全状态

### 🌙 暗色模式
- 一键切换亮色/暗色主题
- 记住用户偏好，下次打开自动应用

### 📱 PWA 支持
- 手机浏览器访问，安装到主屏幕
- 离线缓存基础资源
- 类原生 App 体验

### 🔒 安全设计
- API Key 不暴露（仅显示是否已配置）
- 网关 Token 通过后端代理，前端不接触
- 用户文件路径不泄露到 API 响应
- 仅监听 localhost，不对外暴露

---

## 🚀 快速开始

### 前提条件

| 依赖 | 版本 | 说明 |
|------|------|------|
| [Node.js](https://nodejs.org/) | ≥ 18 | 运行后端服务 |
| [OpenClaw](https://github.com/openclaw/openclaw) | 最新版 | AI 网关主程序 |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | 可选 | 终端 AI 对话 |

### 安装运行

```bash
# 1. 克隆仓库
git clone https://github.com/xmgzxmgz/openclaw-console.git
cd openclaw-console

# 2. 启动服务
node server.js
# 或使用启动脚本
./start.sh        # macOS/Linux
start.bat          # Windows

# 3. 打开浏览器
open http://localhost:3456
```

### Mac 原生 App

```bash
# 下载 Release 中的 mac.zip，解压后：
open OpenClaw-Console.app
```

---

## 📥 下载安装

从 [Releases](https://github.com/xmgzxmgz/openclaw-console/releases) 页面下载：

| 平台 | 文件 | 大小 | 说明 |
|------|------|------|------|
| **macOS** | `OpenClaw-Console-v2.0-mac.zip` | ~350KB | 含原生 .app（Apple Silicon） |
| **Windows** | `OpenClaw-Console-v2.0-win.zip` | ~35KB | 双击 `start.bat` 启动 |
| **Linux** | `OpenClaw-Console-v2.0-linux.zip` | ~35KB | 运行 `./start-linux.sh` |
| **手机** | 浏览器访问 `http://IP:3456` | - | Safari/Chrome 添加到主屏幕 |

---

## 📸 截图

### 总览仪表盘
> 统计卡片 + 渠道状态 + Token 趋势 + 模型分布 + 最近活动

### 会话列表
> 收藏星标 + 标签系统 + 渠道筛选 + 导出按钮

### 多模型对比
> 并发测试多个模型，左右对比输出

### 设置面板
> API 管理 + Token 预算 + 暗色模式 + 系统信息

---

## 🏗️ 项目结构

```
openclaw-console/
├── server.js              # Node.js 后端服务（端口 3456）
├── public/
│   ├── index.html         # 主页面（SPA 单页应用）
│   ├── style.css          # 样式（亮色/暗色主题）
│   ├── app.js             # 前端逻辑（会话管理/搜索/导出/对比）
│   ├── manifest.json      # PWA 配置
│   ├── sw.js              # Service Worker（离线缓存）
│   └── icon.png           # 应用图标
├── OpenClaw-Console.app/  # macOS 原生应用（Swift + WKWebView）
├── start.sh               # macOS/Linux 启动脚本
├── start.bat              # Windows 启动脚本
├── start-linux.sh         # Linux 启动脚本
├── LICENSE                # MIT 许可证
└── README.md              # 本文件
```

---

## 📡 API 文档

### REST API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/sessions` | GET | 获取所有会话列表（OpenClaw + Claude Code） |
| `/api/session/:id` | GET | 获取单个会话详情（含完整对话） |
| `/api/config` | GET | 获取 API 提供商配置（不暴露 Key） |
| `/api/chat` | POST | 代理聊天请求到 OpenClaw Gateway |
| `/api/events` | GET | SSE 实时事件流（会话更新推送） |

### 数据格式

#### 会话对象
```json
{
  "sessionId": "uuid",
  "source": "openclaw | claude-code",
  "channel": "微信 | Telegram | 终端 | 模型测试",
  "summary": "首条消息摘要",
  "model": "mimo-v2.5-pro",
  "provider": "anthropic",
  "tokenUsage": {
    "input": 12345,
    "output": 678,
    "cache": 9000,
    "total": 13023
  },
  "messageCount": 42,
  "toolCallCount": 15,
  "toolCalls": ["Bash", "Read", "Edit"],
  "risks": [
    {"level": "high", "desc": "rm -rf"}
  ]
}
```

---

## ⚙️ 配置

### 后端配置

编辑 `server.js` 中的常量：

```javascript
const PORT = 3456;                    // 服务端口
const OC_SESSIONS = '~/.openclaw/agents/main/sessions';  // OpenClaw 会话目录
const CC_PROJECTS = '~/.claude/projects/-Users-xxx';     // Claude Code 项目目录
```

### 网关连接

聊天功能通过后端代理连接 OpenClaw Gateway：
- 默认地址：`http://127.0.0.1:18789`
- Token 在 `server.js` 中配置（不暴露到前端）

---

## 🔧 开发

```bash
# 开发模式（自动重启）
npx nodemon server.js

# 修改前端后无需重启，刷新浏览器即可
# 修改后端后 nodemon 自动重启
```

### 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js + 原生 HTTP 模块（零依赖） |
| 前端 | 原生 HTML + CSS + JavaScript（无框架） |
| 实时 | Server-Sent Events (SSE) |
| Mac App | Swift + WKWebView |
| PWA | Service Worker + Web App Manifest |

---

## 🤝 贡献指南

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 创建 Pull Request

### 开发规范

- 保持零依赖（原生 Node.js + 原生前端）
- 中文注释和文档
- 遵循现有代码风格

---

## 📋 更新日志

### v2.0 (2026-06-30)
- ✨ 全新侧边栏布局，每个功能独立页面
- ⭐ 会话收藏（星标标记）
- 🏷️ 标签系统（自定义分类）
- 📋 Prompt 模板库（12 个常用模板）
- 📤 对话导出（Markdown/JSON）
- ⚖️ 多模型对比（并发测试）
- 💰 Token 预算管理
- ⚡ 模型性能对比
- 📊 用量仪表盘增强（缓存命中率）
- 📝 Markdown 渲染增强
- 📱 PWA 支持（手机安装）
- 🌙 暗色模式
- 🔍 全局搜索
- ⚠️ 风险检测
- 📡 渠道状态监控

### v1.0 (2026-06-30)
- 🎉 初始发布
- 📊 总览仪表盘
- 💬 会话列表（OpenClaw + Claude Code）
- 🤖 实时对话
- ⚙️ 设置面板
- 🖥️ Mac 原生 App

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

## 👨‍💻 作者

**xmgz**

- 📧 Email: [xmgzdm@gmail.com](mailto:xmgzdm@gmail.com)
- 🐙 GitHub: [@xmgzxmgz](https://github.com/xmgzxmgz)
- 📦 项目: [openclaw-console](https://github.com/xmgzxmgz/openclaw-console)

---

## 🙏 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) — 多渠道 AI 网关
- [Anthropic Claude](https://www.anthropic.com/) — AI 模型
- [小米 MiMo](https://platform.xiaomimimo.com/) — API 代理服务

---

<div align="center">

**如果觉得有用，请给个 ⭐ Star 支持一下！**

</div>
