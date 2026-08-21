# 课时页 1200px 布局设计

## 目标

将 Docker、Git、MySQL 三套课时页的桌面端内容区域最大宽度调整为 1200px，同时保持左侧课程内容栏宽度不变，优先缩小右侧终端栏。

## 方案

- Docker 课时页使用 `816px 360px` 两列布局。
- Git 和 MySQL 课时页使用 `856px 320px` 两列布局。
- 三页均保留 24px 列间距、左侧内容和右侧 sticky 行为。
- 保留现有 1200px 响应式断点，窗口较窄时继续切换为单列布局。

## 实施范围

仅修改 `src/views/LessonView.vue`、`src/views/GitLessonView.vue` 和 `src/views/MySQLLessonView.vue` 的布局 CSS，不修改课程数据、组件行为或路由。

## 验证

运行 `npm run type-check` 和 `npm run build`，确认类型检查、生产构建和现有响应式规则通过。
