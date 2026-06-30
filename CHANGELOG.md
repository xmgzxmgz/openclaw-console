# 📋 更新日志

## v2.1 (2026-07-01)

### 🐛 修复
- **Token 计费准确性修复**：`total` 现在包含 cache tokens（cacheRead/cacheWrite/cacheCreation），此前 total 只计算 input+output，遗漏了约 95% 的实际 token 消耗
- OpenClaw 会话新增 `cacheWrite` 追踪
- Claude Code 会话新增 `cache_creation_input_tokens` 追踪
- 会话详情页展示 Cache Read / Cache Write 分类统计
- 消息级别 usage 展示 cache token 数

## v2.0 (2026-06-30)

### ✨ 新功能
- 全新侧边栏布局，每个功能独立页面
- 会话收藏（星标标记重要会话）
- 标签系统（自定义分类：工作/学习/项目）
- Prompt 模板库（12 个常用模板）
- 对话导出（Markdown/JSON 格式）
- 多模型对比（并发测试多个模型）
- Token 预算管理（月度用量控制）
- 模型性能对比表
- 用量仪表盘增强（缓存命中率显示）
- Markdown 渲染增强（代码高亮、表格、链接）
- PWA 支持（手机安装到主屏幕）
- 暗色模式（一键切换，状态持久化）
- 全局搜索（搜索所有会话内容）
- 风险检测（自动扫描危险命令）
- 渠道状态监控（微信/Telegram/终端）

### 🔒 安全
- API Key 不暴露到前端
- 网关 Token 通过后端代理
- 用户文件路径不泄露
- 仅监听 localhost

### 🏗️ 架构
- 侧边栏 + 顶栏 + 页面容器布局
- SPA 单页应用，无页面刷新
- SSE 实时推送，自动更新
- 移动端响应式，侧边栏自动收起

## v1.0 (2026-06-30)

### 🎉 初始发布
- 总览仪表盘（统计/渠道/趋势/模型）
- 会话列表（OpenClaw + Claude Code 合并）
- 实时对话（连接 OpenClaw Gateway）
- 设置面板（API 管理/系统信息/暗色模式）
- Mac 原生 App（Swift + WKWebView）
- 多平台支持（Windows/Linux/Mobile）
