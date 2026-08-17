<template>
    <div class="progress-page">
        <div class="page-title">
            <h1>总学习进度</h1>
            <p>两套课程的学习旅程都在这里</p>
        </div>

        <!-- 总览卡片 -->
        <div class="overview-grid">
            <div class="ov-card ov-main">
                <div class="ov-ring">
                    <el-progress
                        type="dashboard"
                        :percentage="combinedOverallPercent"
                        :width="130"
                        :stroke-width="12"
                        :color="combinedColor"
                    >
                        <template #default>
                            <div class="ov-ring-num">{{ combinedOverallPercent }}%</div>
                            <div class="ov-ring-label">总进度</div>
                        </template>
                    </el-progress>
                </div>
                <div class="ov-info">
                    <div class="ov-row">
                        <span>已完成课时</span>
                        <b>{{ combinedCompletedCount }} / {{ combinedTotalLessons }}</b>
                    </div>
                    <div class="ov-row">
                        <span>完成章节</span>
                        <b>{{ combinedFinishedChapters }} / {{ combinedTotalChapters }}</b>
                    </div>
                    <div class="ov-row">
                        <span>测验正确率</span>
                        <b>{{ store.quizStats.total ? store.quizStats.percent + '%' : '—' }}</b>
                    </div>
                    <div class="ov-row">
                        <span>开始学习</span>
                        <b>{{ startedText }}</b>
                    </div>
                </div>
            </div>

            <div class="ov-card ov-continue">
                <el-icon class="big-icon"><Trophy /></el-icon>
                <div class="ov-continue-text">
                    <template v-if="lastVisited">
                        <div class="t1">继续上次学习</div>
                        <div class="t2">{{ lastLessonTitle }}</div>
                    </template>
                    <template v-else>
                        <div class="t1">还没有开始学习</div>
                        <div class="t2">从 Docker 第一章开始你的学习之旅吧！</div>
                    </template>
                </div>
                <el-button v-if="lastVisited" type="primary" round @click="continueLast">继续学习</el-button>
                <el-button v-else type="primary" round @click="$router.push('/chapter/intro')">开始学习</el-button>
            </div>
        </div>

        <!-- 章节进度明细 -->
        <el-card shadow="never" class="detail-card">
            <template #header>
                <div class="card-header">
                    <span>章节进度明细</span>
                    <el-button type="danger" link size="small" @click="confirmReset">
                        <el-icon><Delete /></el-icon>
                        重置全部进度
                    </el-button>
                </div>
            </template>

            <div class="chapter-progress-list">
                <div v-for="ch in allChapters" :key="ch.id" class="cp-item" @click="goChapter(ch)">
                    <div class="cp-left">
                        <div class="cp-icon" :style="{ background: ch.color + '1a', color: ch.color }">
                            <el-icon :size="20"><component :is="ch.icon" /></el-icon>
                        </div>
                        <div class="cp-info">
                            <div class="cp-name">
                                <el-tag
                                    v-if="ch.module === 'git'"
                                    size="small"
                                    effect="light"
                                    class="module-tag"
                                    :color="ch.color"
                                >
                                    Git
                                </el-tag>
                                <el-tag v-else size="small" effect="light" class="module-tag" :color="ch.color">
                                    Docker
                                </el-tag>
                                {{ ch.title }}
                                <el-icon v-if="ch.isCompleted" class="cp-done"><CircleCheckFilled /></el-icon>
                            </div>
                            <div class="cp-sub">{{ ch.lessons.length }} 节课 · 约 {{ ch.minutes }} 分钟</div>
                        </div>
                    </div>
                    <div class="cp-right">
                        <div class="cp-bar">
                            <el-progress
                                :percentage="ch.percent"
                                :stroke-width="10"
                                :color="ch.color"
                                :show-text="false"
                            />
                        </div>
                        <span class="cp-percent">{{ ch.percent }}%</span>
                        <el-icon class="cp-arrow"><ArrowRight /></el-icon>
                    </div>
                </div>
            </div>
        </el-card>

        <!-- 测验记录 -->
        <el-card shadow="never" class="detail-card">
            <template #header>
                <div class="card-header">
                    <span>测验记录</span>
                    <el-tag v-if="store.quizStats.total" type="success" size="small" effect="light">
                        正确 {{ store.quizStats.correct }} / {{ store.quizStats.total }}
                    </el-tag>
                </div>
            </template>

            <el-empty v-if="!store.quizStats.total" description="还没有做过测验，去课程里试试吧！">
                <el-button type="primary" round @click="$router.push('/chapter/intro')">去做第一道题</el-button>
            </el-empty>

            <div v-else class="quiz-record-grid">
                <div v-for="(quiz, i) in quizRecords" :key="i" class="quiz-record" :class="quiz.correct ? 'ok' : 'no'">
                    <el-icon>
                        <CircleCheckFilled v-if="quiz.correct" />
                        <CircleCloseFilled v-else />
                    </el-icon>
                    <div class="qr-text">
                        <div class="qr-q">{{ quiz.question }}</div>
                        <div class="qr-l">来自：{{ quiz.chapter }} · {{ quiz.lesson }}</div>
                    </div>
                </div>
            </div>
        </el-card>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { chapters } from '@/data/lessons'
import { gitChapters } from '@/data/gitLessons'
import { useProgressStore } from '@/stores/progress'
import { useGitProgressStore } from '@/stores/gitProgress'

const store = useProgressStore()
const gitStore = useGitProgressStore()
const router = useRouter()

const combinedTotalLessons = computed(() => store.totalLessons + gitStore.totalLessons)
const combinedCompletedCount = computed(() => store.completedCount + gitStore.completedCount)
const combinedTotalChapters = computed(() => store.totalChapters + gitStore.totalChapters)
const combinedFinishedChapters = computed(() => {
    const dockerDone = store.finishedChapters.length
    const gitDone = gitStore.chapterProgress.filter((c) => c.percent === 100).length
    return dockerDone + gitDone
})
const combinedOverallPercent = computed(() => {
    const total = combinedTotalLessons.value
    return total ? Math.round((combinedCompletedCount.value / total) * 100) : 0
})
const combinedColor = computed(() => {
    const docker = store.overallPercent
    const git = gitStore.overallPercent
    return docker >= git ? '#2496ED' : '#F05032'
})

const startedText = computed(() => {
    const t = Math.min(store.startedAt || Infinity, gitStore.startedAt || Infinity)
    if (!Number.isFinite(t)) return '—'
    const d = new Date(t)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const lastVisited = computed(() => {
    if (!store.lastVisited && !gitStore.lastVisited) return null
    // 没有明确时间戳时，优先返回有值的一方
    if (!store.lastVisited) return { id: gitStore.lastVisited, module: 'git' }
    if (!gitStore.lastVisited) return { id: store.lastVisited, module: 'docker' }
    return { id: store.lastVisited, module: 'docker' }
})

const lastLessonTitle = computed(() => {
    const lv = lastVisited.value
    if (!lv) return ''
    if (lv.module === 'git') {
        for (const ch of gitChapters) {
            const l = ch.lessons.find((x) => x.id === lv.id)
            if (l) return `[Git] ${ch.title} · ${l.title}`
        }
    } else {
        for (const ch of chapters) {
            const l = ch.lessons.find((x) => x.id === lv.id)
            if (l) return `[Docker] ${ch.title} · ${l.title}`
        }
    }
    return ''
})

function continueLast() {
    const lv = lastVisited.value
    if (!lv) return
    if (lv.module === 'git') {
        router.push(`/git/lesson/${lv.id}`)
    } else {
        router.push(`/lesson/${lv.id}`)
    }
}

const allChapters = computed(() => {
    const docker = chapters.map((ch) => ({
        ...ch,
        module: 'docker',
        percent: store.chapterPercent(ch.id),
        isCompleted: store.isChapterCompleted(ch.id),
    }))
    const git = gitChapters.map((ch) => ({
        ...ch,
        module: 'git',
        percent: gitStore.chapterPercent(ch.id),
        isCompleted: gitStore.chapterPercent(ch.id) === 100,
    }))
    return [...docker, ...git]
})

function goChapter(ch) {
    if (ch.module === 'git') {
        router.push(`/git`)
    } else {
        router.push(`/chapter/${ch.id}`)
    }
}

const quizRecords = computed(() => {
    const list = []
    for (const ch of chapters) {
        for (const l of ch.lessons) {
            if (!l.quiz) continue
            l.quiz.forEach((q, i) => {
                const r = store.quizResults[`${l.id}#${i}`]
                if (r !== undefined) {
                    list.push({ question: q.question, correct: r.correct, chapter: ch.title, lesson: l.title })
                }
            })
        }
    }
    return list.reverse()
})

function confirmReset() {
    ElMessageBox.confirm(
        '确定要重置全部学习进度吗？Docker 与 Git 的已完成章节、练习与测验记录都将被清除，此操作不可恢复。',
        '重置学习进度',
        { confirmButtonText: '确认重置', cancelButtonText: '取消', type: 'warning' },
    )
        .then(() => {
            store.resetProgress()
            gitStore.resetProgress()
            ElMessage.success('学习进度已重置')
        })
        .catch(() => {})
}
</script>

<style scoped>
.progress-page {
    max-width: 980px;
    margin: 0 auto;
}

.page-title h1 {
    font-size: 24px;
    margin: 0 0 4px;
}

.page-title p {
    margin: 0 0 20px;
    color: var(--text-sub);
    font-size: 14px;
}

.overview-grid {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 18px;
}

.ov-card {
    background: #fff;
    border-radius: 14px;
    border: 1px solid var(--border-light);
    padding: 22px;
}

.ov-main {
    display: flex;
    align-items: center;
    gap: 28px;
}

.ov-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.ov-row {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    color: var(--text-sub);
    border-bottom: 1px dashed #f0f2f5;
    padding-bottom: 10px;
}

.ov-row b {
    color: var(--text-main);
}

.ov-ring-num {
    font-size: 26px;
    font-weight: 800;
    color: #1b6bb3;
}

.ov-ring-label {
    font-size: 12px;
    color: var(--text-sub);
}

.ov-continue {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    justify-content: center;
    background: linear-gradient(135deg, #f0f6fc, #fff);
}

.big-icon {
    font-size: 38px;
    color: #f7a600;
}

.ov-continue-text .t1 {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-main);
}

.ov-continue-text .t2 {
    font-size: 13px;
    color: var(--text-sub);
    margin-top: 3px;
}

.detail-card {
    margin-top: 18px;
    border-radius: 14px;
    border: 1px solid var(--border-light);
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 700;
}

.chapter-progress-list {
    display: flex;
    flex-direction: column;
}

.cp-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 4px;
    border-bottom: 1px solid #f5f7fa;
    cursor: pointer;
    transition: background 0.2s;
    border-radius: 8px;
}

.cp-item:last-child {
    border-bottom: none;
}

.cp-item:hover {
    background: #f8fafc;
}

.cp-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
}

.cp-icon {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.cp-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-main);
    display: flex;
    align-items: center;
    gap: 6px;
}

.module-tag {
    margin-right: 4px;
    font-weight: 600;
}

:deep(.module-tag .el-tag__content) {
    color: #fff;
}

.cp-done {
    color: #67c23a;
    font-size: 16px;
}

.cp-sub {
    font-size: 12px;
    color: #909399;
    margin-top: 2px;
}

.cp-right {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 42%;
}

.cp-bar {
    flex: 1;
}

.cp-percent {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-main);
    width: 40px;
    text-align: right;
}

.cp-arrow {
    color: #c0c4cc;
    font-size: 14px;
}

.quiz-record-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
}

.quiz-record {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--border-light);
    background: #fafbfc;
}

.quiz-record .el-icon {
    font-size: 18px;
    margin-top: 2px;
    flex-shrink: 0;
}

.quiz-record.ok .el-icon {
    color: #67c23a;
}

.quiz-record.no .el-icon {
    color: #f56c6c;
}

.qr-q {
    font-size: 13px;
    color: var(--text-main);
    line-height: 1.6;
}

.qr-l {
    font-size: 12px;
    color: #909399;
    margin-top: 4px;
}

@media (max-width: 768px) {
    .overview-grid {
        grid-template-columns: 1fr;
    }

    .ov-main {
        flex-direction: column;
        text-align: center;
    }

    .cp-right {
        width: auto;
    }

    .cp-bar {
        min-width: 90px;
    }

    .cp-arrow {
        display: none;
    }
}
</style>
