<template>
    <div class="home">
        <!-- Hero 区 -->
        <section class="hero">
            <div class="hero-bg"></div>
            <div class="hero-inner">
                <img src="/favicon.svg" alt="Docker" class="hero-logo" />
                <h1 class="hero-title">Docker 交互式学习</h1>
                <p class="hero-desc">
                    面向零基础初学者的 Docker 入门课程 —— 分步教学 + 浏览器内模拟终端实操，
                    从「镜像、容器、Dockerfile」到「数据卷、网络、Compose」，循序渐进，边学边练。
                </p>

                <div class="hero-actions">
                    <n-button type="primary" size="large" round @click="startLearning">
                        <n-icon><VideoPlay /></n-icon>
                        &nbsp;开始学习
                    </n-button>
                </div>

                <div class="hero-stats">
                    <div class="stat-item">
                        <div class="stat-num">{{ stats.chapters }}</div>
                        <div class="stat-label">个章节</div>
                    </div>
                    <div class="stat-divider"></div>
                    <div class="stat-item">
                        <div class="stat-num">{{ stats.lessons }}</div>
                        <div class="stat-label">节课时</div>
                    </div>
                    <div class="stat-divider"></div>
                    <div class="stat-item">
                        <div class="stat-num">{{ stats.practices }}</div>
                        <div class="stat-label">个动手练习</div>
                    </div>
                    <div class="stat-divider"></div>
                    <div class="stat-item">
                        <div class="stat-num">{{ stats.quizzes }}</div>
                        <div class="stat-label">道测验题</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- 进度条（已开始学习时显示） -->
        <n-card v-if="store.overallPercent > 0" :bordered="true" class="overall-card">
            <div class="overall-row">
                <div class="overall-info">
                    <n-icon><Trophy /></n-icon>
                    <span>Docker 进度：已完成 {{ store.completedCount }} / {{ store.totalLessons }} 节课</span>
                </div>
                <n-button type="primary" text @click="continueLearning">
                    继续上次学习
                    <n-icon><Right /></n-icon>
                </n-button>
            </div>
            <n-progress :percentage="store.overallPercent" :stroke-width="12" color="#2496ED" processing />
        </n-card>

        <!-- 章节卡片 -->
        <div class="section-title">
            <h2>课程目录</h2>
            <p>按顺序学习效果最佳，也可以自由跳转</p>
        </div>

        <div class="chapter-grid">
            <div
                v-for="(ch, i) in chapters"
                :key="ch.id"
                class="chapter-card"
                :style="{ '--ch-color': ch.color }"
                @click="goChapter(ch)"
            >
                <div class="card-top">
                    <div class="card-index">{{ ch.index }}</div>
                    <div class="card-icon" :style="{ background: ch.color + '1a', color: ch.color }">
                        <n-icon :size="26"><component :is="ch.icon" /></n-icon>
                    </div>
                    <n-tag v-if="store.isChapterCompleted(ch.id)" size="small" type="success" :bordered="false" round>
                        已完成
                    </n-tag>
                </div>

                <h3 class="card-title">{{ ch.title }}</h3>
                <p class="card-desc">{{ ch.description }}</p>

                <div class="card-meta">
                    <span>
                        <n-icon><Reading /></n-icon>
                        {{ ch.lessons.length }} 节课
                    </span>
                    <span>
                        <n-icon><Timer /></n-icon>
                        约 {{ ch.minutes }} 分钟
                    </span>
                </div>

                <div class="card-progress">
                    <n-progress
                        :percentage="chapterPercent(ch.id)"
                        :stroke-width="8"
                        :color="ch.color"
                        :show-indicator="false"
                    />
                    <span class="card-percent">{{ chapterPercent(ch.id) }}%</span>
                </div>

                <div class="card-footer">
                    <n-button
                        type="primary"
                        secondary
                        size="small"
                        round
                        :style="{ color: ch.color, borderColor: ch.color + '66' }"
                    >
                        {{
                            i === 0 && store.completedCount === 0
                                ? '开始学习'
                                : store.isChapterCompleted(ch.id)
                                  ? '再次学习'
                                  : '进入章节'
                        }}
                        <n-icon class="icon-right"><ArrowRight /></n-icon>
                    </n-button>
                </div>
            </div>
        </div>

        <!-- 特色说明 -->
        <div class="feature-row">
            <div class="feature-item" v-for="f in features" :key="f.title">
                <div class="feature-icon" :style="{ background: f.color + '1a', color: f.color }">
                    <n-icon :size="22"><component :is="f.icon" /></n-icon>
                </div>
                <div>
                    <div class="feature-title">{{ f.title }}</div>
                    <div class="feature-desc">{{ f.desc }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { chapters, stats } from '@/data/lessons'
import { useProgressStore } from '@/stores/progress'

const router = useRouter()
const store = useProgressStore()

const chapterPercent = (id: string) => store.chapterPercent(id)

interface Feature {
  title: string
  desc: string
  icon: string
  color: string
}

const features: Feature[] = [
    { title: '分步引导教学', desc: '每个概念拆解为小节，从零讲起，循序渐进', icon: 'Guide', color: '#2496ED' },
    { title: '模拟终端实操', desc: '浏览器内直接输入 docker 命令，实时看到结果', icon: 'Monitor', color: '#00B96B' },
    { title: '即时反馈纠错', desc: '命令错误给出提示，测验题附带详细解析', icon: 'ChatLineRound', color: '#F7A600' },
    { title: '进度自动跟踪', desc: '完成章节与练习自动记录，随时掌握学习状态', icon: 'TrendCharts', color: '#7B61FF' },
]

const startLearning = () => {
    if (store.lastVisited) {
        router.push(`/lesson/${store.lastVisited}`)
    } else {
        router.push(`/chapter/${chapters[0].id}`)
    }
}

const continueLearning = startLearning

const goChapter = (ch: { id: string }) => router.push(`/chapter/${ch.id}`)
</script>

<style scoped>
.home {
    max-width: 1180px;
    margin: 0 auto;
}

.hero {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    background: linear-gradient(135deg, #0e3a66 0%, #1b6bb3 55%, #2496ed 100%);
    padding: 56px 32px 44px;
    color: #fff;
    text-align: center;
}

.hero-bg {
    position: absolute;
    inset: 0;
    background:
        radial-gradient(circle at 15% 20%, rgba(255, 255, 255, 0.08) 0, transparent 40%),
        radial-gradient(circle at 85% 80%, rgba(255, 255, 255, 0.07) 0, transparent 45%);
    pointer-events: none;
}

.hero-inner {
    position: relative;
    z-index: 1;
    max-width: 760px;
    margin: 0 auto;
}

.hero-logo {
    width: 84px;
    height: 84px;
    filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.25));
    animation: float 3.5s ease-in-out infinite;
}

@keyframes float {
    0%,
    100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(-8px);
    }
}

.hero-title {
    font-size: 34px;
    font-weight: 800;
    margin: 16px 0 12px;
    letter-spacing: 1px;
}

.hero-desc {
    font-size: 15.5px;
    line-height: 1.9;
    opacity: 0.92;
    margin: 0 auto 28px;
    max-width: 640px;
}

.hero-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
}

.hero-actions :deep(.n-button--primary-type) {
    background: #fff;
    border-color: #fff;
    color: #1b6bb3;
    font-weight: 700;
}

.hero-actions :deep(.n-button--primary-type:hover) {
    background: #eaf4ff;
}

.hero-actions :deep(.n-button:not(.n-button--primary-type)) {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.45);
    color: #fff;
}

.hero-actions :deep(.n-button:not(.n-button--primary-type):hover) {
    background: rgba(255, 255, 255, 0.24);
}

.hero-stats {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 28px;
    margin-top: 40px;
    flex-wrap: wrap;
}

.stat-item {
    text-align: center;
}

.stat-num {
    font-size: 28px;
    font-weight: 800;
}

.stat-label {
    font-size: 13px;
    opacity: 0.8;
    margin-top: 2px;
}

.stat-divider {
    width: 1px;
    height: 36px;
    background: rgba(255, 255, 255, 0.25);
}

.overall-card {
    border-radius: 12px;
    margin-top: 20px;
}

.overall-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 8px;
}

.overall-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14.5px;
    color: var(--text-main);
    font-weight: 600;
}

.overall-info .n-icon {
    color: #f7a600;
    font-size: 18px;
}

.section-title {
    margin: 36px 0 20px;
}

.section-title h2 {
    font-size: 22px;
    margin: 0 0 4px;
    color: var(--text-main);
}

.section-title p {
    margin: 0;
    font-size: 13.5px;
    color: var(--text-sub);
}

.chapter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 18px;
}

.chapter-card {
    background: #fff;
    border-radius: 14px;
    border: 1px solid var(--border-light);
    padding: 20px;
    cursor: pointer;
    transition: all 0.25s;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.chapter-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 28px rgba(36, 150, 237, 0.12);
    border-color: var(--ch-color);
}

.card-top {
    display: flex;
    align-items: center;
    gap: 12px;
}

.card-index {
    font-size: 13px;
    font-weight: 800;
    color: #b8c4d0;
    letter-spacing: 1px;
}

.card-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.card-title {
    font-size: 17px;
    margin: 0;
    color: var(--text-main);
}

.card-desc {
    font-size: 13.5px;
    color: var(--text-sub);
    line-height: 1.7;
    margin: 0;
    flex: 1;
}

.card-meta {
    display: flex;
    gap: 16px;
    font-size: 12.5px;
    color: #909399;
}

.card-meta span {
    display: flex;
    align-items: center;
    gap: 4px;
}

.card-progress {
    display: flex;
    align-items: center;
    gap: 10px;
}

.card-progress :deep(.n-progress) {
    flex: 1;
}

.card-percent {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--ch-color);
    min-width: 34px;
    text-align: right;
}

.card-footer {
    text-align: right;
    margin-top: 4px;
}

.feature-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin-top: 36px;
}

.feature-item {
    background: #fff;
    border-radius: 12px;
    border: 1px solid var(--border-light);
    padding: 18px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
}

.feature-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.feature-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-main);
}

.feature-desc {
    font-size: 12.5px;
    color: var(--text-sub);
    line-height: 1.6;
    margin-top: 3px;
}

@media (max-width: 768px) {
    .hero {
        padding: 40px 18px 32px;
    }

    .hero-title {
        font-size: 24px;
    }

    .hero-desc {
        font-size: 14px;
    }

    .hero-stats {
        gap: 16px;
    }

    .stat-num {
        font-size: 22px;
    }

    .chapter-grid {
        grid-template-columns: 1fr;
    }

    .hero-actions :deep(.n-button) {
        width: 100%;
    }
}
</style>


