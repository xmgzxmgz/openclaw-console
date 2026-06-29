# 🔒 安全政策

## 安全设计

OpenClaw Console 在设计上注重安全：

1. **本地运行**：服务仅监听 `localhost:3456`，不对外暴露
2. **API Key 保护**：API 响应不包含任何 Key/Token 明文
3. **网关代理**：聊天请求通过后端代理，前端不接触网关 Token
4. **路径脱敏**：会话数据不暴露用户文件系统路径

## 已知限制

- 服务运行在本地，依赖操作系统的用户隔离
- 聊天功能需要 OpenClaw Gateway 的 Token，在 `server.js` 中配置

## 报告安全问题

如发现安全漏洞，请通过邮件联系：xmgzdm@gmail.com

请不要在公开 Issue 中报告安全问题。
