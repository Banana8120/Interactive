import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    module?: 'git' | 'mysql'
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: 'Docker 交互式学习' },
  },
  {
    path: '/chapter/:chapterId',
    name: 'chapter',
    component: () => import('@/views/ChapterView.vue'),
    meta: { title: '章节' },
  },
  {
    path: '/lesson/:lessonId',
    name: 'lesson',
    component: () => import('@/views/LessonView.vue'),
    meta: { title: '课时' },
  },
  {
    path: '/git',
    name: 'git-home',
    component: () => import('@/views/GitHomeView.vue'),
    meta: { title: 'Git 交互式学习', module: 'git' },
  },
  {
    path: '/git/lesson/:lessonId',
    name: 'git-lesson',
    component: () => import('@/views/GitLessonView.vue'),
    meta: { title: 'Git 课时', module: 'git' },
  },
  {
    path: '/mysql',
    name: 'mysql-home',
    component: () => import('@/views/MySQLHomeView.vue'),
    meta: { title: 'MySQL 交互式学习', module: 'mysql' },
  },
  {
    path: '/mysql/lesson/:lessonId',
    name: 'mysql-lesson',
    component: () => import('@/views/MySQLLessonView.vue'),
    meta: { title: 'MySQL 课时', module: 'mysql' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const suffixMap = {
    git: 'Git 交互式教程',
    mysql: 'MySQL 交互式教程'
  }
  const suffix = to.meta.module ? suffixMap[to.meta.module] : 'Docker 交互式教程'
  document.title = to.meta.title ? `${to.meta.title} | ${suffix}` : suffix
})

export default router
