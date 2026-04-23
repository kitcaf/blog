# 架构
Notion + 图床 JSON + 自定义前端的 SSG blog架构

# 核心流程
获取数据（定时任务，明天凌晨）：GitHub Actions 拉取 Notion 数据，替换成图床链接，保存为本地的 data.json。

动态生成路由：你的 Vue 项目里，读取这个 data.json，然后动态生成路由表。比如发现 JSON 里有 10 篇文章，你的 vue-router 就动态注册 10 个 /post/:id 的路由。

SSG 魔法：vite-ssg 开始工作，它会遍历你配置的所有路由（首页、分类页、10个文章页）。对于每一个路由，它在后台悄悄运行你的 Vue 组件，把最终渲染出来的完整 DOM 结构，直接保存成一长串 HTML 字符串，写入 .html 文件。
