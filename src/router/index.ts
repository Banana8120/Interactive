import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    module?: 'docker' | 'git' | 'mysql' | 'jvm' | 'javascript'
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'docker-playground',
    component: () => import('@/views/DockerPlaygroundView.vue'),
    meta: { title: 'Docker 模拟终端', module: 'docker' }
  },
  {
    path: '/chapter/:chapterId',
    redirect: '/'
  },
  {
    path: '/lesson/:lessonId',
    redirect: '/'
  },
  {
    path: '/git',
    name: 'git-playground',
    component: () => import('@/views/GitPlaygroundView.vue'),
    meta: { title: 'Git 模拟终端', module: 'git' }
  },
  {
    path: '/git/lesson/:lessonId',
    redirect: '/git'
  },
  {
    path: '/mysql',
    name: 'mysql-playground',
    component: () => import('@/views/MySQLPlaygroundView.vue'),
    meta: { title: 'MySQL 模拟终端', module: 'mysql' }
  },
  {
    path: '/jvm',
    name: 'jvm-playground',
    component: () => import('@/views/JvmPlaygroundView.vue'),
    meta: { title: 'JVM 内存模拟', module: 'jvm' }
  },
  {
    path: '/javascript',
    name: 'javascript-playground',
    component: () => import('@/views/JavaScriptPlaygroundView.vue'),
    meta: { title: 'JavaScript 执行上下文', module: 'javascript' }
  },
  {
    path: '/mysql/lesson/:lessonId',
    redirect: '/mysql'
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} | Playground` : '模拟终端 Playground'
})

export default router
