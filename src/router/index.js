import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
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
        path: '/progress',
        name: 'progress',
        component: () => import('@/views/ProgressView.vue'),
        meta: { title: '学习进度' },
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
    const suffix = to.meta.module === 'git' ? 'Git 交互式教程' : 'Docker 交互式教程'
    document.title = to.meta.title ? `${to.meta.title} | ${suffix}` : suffix
})

export default router
