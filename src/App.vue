<template>
    <el-container class="app-shell">
        <el-header class="app-header" height="56px">
            <div class="header-inner">
                <router-link to="/" class="brand">
                    <img src="/favicon.svg" alt="Docker" class="brand-logo" />
                    <span class="brand-text">
                        <span class="brand-sub">交互式学习教程</span>
                    </span>
                </router-link>

                <nav class="header-nav">
                    <router-link
                        v-for="item in navItems"
                        :key="item.path"
                        :to="item.path"
                        class="nav-link"
                        :class="{
                            active: isActive(item.path),
                            'git-active': item.path === '/git' && isActive(item.path),
                        }"
                    >
                        <el-icon><component :is="item.icon" /></el-icon>
                        <span>{{ item.label }}</span>
                    </router-link>
                </nav>

                <div class="header-progress">
                    <template v-if="isProgressPage">
                        <el-tooltip :content="`总进度 ${combinedPercent}%`" placement="bottom">
                            <el-progress
                                type="circle"
                                :percentage="combinedPercent"
                                :width="40"
                                :stroke-width="5"
                                color="#7C4DFF"
                                :show-text="false"
                            />
                        </el-tooltip>
                        <span class="progress-label combined-label" v-if="!isMobile">{{ combinedPercent }}%</span>
                    </template>
                    <template v-else-if="isGitModule">
                        <el-tooltip :content="`Git 学习已完成 ${gitStore.overallPercent}%`" placement="bottom">
                            <el-progress
                                type="circle"
                                :percentage="gitStore.overallPercent"
                                :width="40"
                                :stroke-width="5"
                                color="#F05032"
                                :show-text="false"
                            />
                        </el-tooltip>
                        <span class="progress-label git-label" v-if="!isMobile">{{ gitStore.overallPercent }}%</span>
                    </template>
                    <template v-else>
                        <el-tooltip :content="`Docker 学习已完成 ${store.overallPercent}%`" placement="bottom">
                            <el-progress
                                type="circle"
                                :percentage="store.overallPercent"
                                :width="40"
                                :stroke-width="5"
                                color="#2496ED"
                                :show-text="false"
                            />
                        </el-tooltip>
                        <span class="progress-label" v-if="!isMobile">{{ store.overallPercent }}%</span>
                    </template>
                </div>
            </div>
        </el-header>

        <el-main class="app-main">
            <router-view v-slot="{ Component }">
                <transition name="fade" mode="out-in">
                    <component :is="Component" />
                </transition>
            </router-view>
        </el-main>

        <el-footer class="app-footer" height="44px">
            <span>交互式学习教程 · 终端为浏览器内模拟环境</span>
        </el-footer>
    </el-container>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useProgressStore } from '@/stores/progress'
import { useGitProgressStore } from '@/stores/gitProgress'

const route = useRoute()
const store = useProgressStore()
const gitStore = useGitProgressStore()

const navItems = [
    { path: '/', label: 'Docker 学习', icon: 'HomeFilled' },
    { path: '/git', label: 'Git 学习', icon: 'Share' },
    { path: '/progress', label: '总学习进度', icon: 'DataLine' },
]

const isGitModule = computed(() => route.path.startsWith('/git'))
const isProgressPage = computed(() => route.path === '/progress')

const totalLessons = computed(() => store.totalLessons + gitStore.totalLessons)
const completedLessons = computed(() => store.completedCount + gitStore.completedCount)
const combinedPercent = computed(() => {
    const total = totalLessons.value
    return total ? Math.round((completedLessons.value / total) * 100) : 0
})

const isMobile = ref(false)
const checkMobile = () => {
    isMobile.value = window.innerWidth <= 768
}

onMounted(() => {
    checkMobile()
    window.addEventListener('resize', checkMobile)
})

onBeforeUnmount(() => window.removeEventListener('resize', checkMobile))

const isActive = (path) => (path === '/' ? route.path === '/' : route.path.startsWith(path))
</script>

<style scoped>
.app-shell {
    height: 100%;
}

.app-header {
    background: #fff;
    border-bottom: 1px solid var(--border-light);
    padding: 0 20px;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.04);
}

.header-inner {
    max-width: 1280px;
    margin: 0 auto;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    flex-shrink: 0;
}

.brand-logo {
    width: 34px;
    height: 34px;
}

.brand-text {
    font-size: 18px;
    font-weight: 700;
    color: #1b6bb3;
    letter-spacing: 0.5px;
}

.brand-sub {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-sub);
    margin-left: 2px;
}

.header-nav {
    display: flex;
    gap: 6px;
}

.nav-link {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border-radius: 8px;
    text-decoration: none;
    color: var(--text-sub);
    font-size: 14px;
    transition: all 0.2s;
}

.nav-link:hover {
    background: #f0f6fc;
    color: #1b6bb3;
}

.nav-link.active {
    background: rgba(36, 150, 237, 0.1);
    color: #1b6bb3;
    font-weight: 600;
}

.nav-link.git-active.active {
    background: rgba(240, 80, 50, 0.1);
    color: #f05032;
}

.header-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.progress-label {
    font-size: 13px;
    color: #1b6bb3;
    font-weight: 600;
}

.progress-label.git-label {
    color: #f05032;
}

.progress-label.combined-label {
    color: #7c4dff;
}

.app-main {
    padding: 24px 20px 40px;
    background: var(--docker-bg);
    overflow-y: auto;
}

.app-footer {
    background: #fff;
    border-top: 1px solid var(--border-light);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #909399;
    font-size: 12.5px;
    padding: 0 16px;
    text-align: center;
}

@media (max-width: 768px) {
    .brand-text {
        font-size: 15px;
    }

    .brand-sub {
        display: none;
    }

    .nav-link span {
        display: none;
    }

    .nav-link {
        padding: 7px 10px;
    }

    .app-header {
        padding: 0 12px;
    }

    .app-main {
        padding: 16px 12px 24px;
    }

    .app-footer {
        font-size: 11px;
        height: auto !important;
        min-height: 40px;
        padding: 8px;
    }
}
</style>
