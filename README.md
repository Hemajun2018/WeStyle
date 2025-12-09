<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EasyPub

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1GsGW5g0JpVpYQx20qu2oR-0a9S0LOSyc

## Run Locally

**Prerequisites:**  Node.js

##
1. Install dependencies:
   `npm install`
2. Set the `EVOLINK_API_KEY` in [.env.local](.env.local) to your Evolink API key
3. Run the app:
   `npm run dev`

Optional:
- Set `VITE_ENABLE_IMAGE_GEN=true` to enable cover/illustration buttons (default hidden)

## Deploy on Vercel

- 在 Vercel 项目 Settings -> Environment Variables 配置 `EVOLINK_API_KEY`
- 如需打开配图相关按钮，可额外配置 `VITE_ENABLE_IMAGE_GEN=true`
- 前端通过 `/api/generate` 无服务器函数代理 Evolink，避免在浏览器暴露密钥与跨域问题
- 部署后若 403，请确认：
  - 环境变量已配置在 Production 与 Preview，并触发了重新构建
  - Evolink 账户/Key 权限正常，允许访问 `gemini-2.5-flash`
