<template>
  <div class="git-home">
    <!-- Hero 区 -->
    <section class="hero">
      <div class="hero-bg"></div>
      <div class="hero-inner">
        <div class="hero-logo">Git</div>
        <h1 class="hero-title">交互式 Git 学习</h1>
        <p class="hero-desc">
          面向初学者的 Git 交互式课程 —— 从初始化仓库、第一次提交，到分支合并、远程协作与进阶技巧，
          每个知识点都配有一个可以在浏览器中直接操作的模拟仓库。
        </p>

        <div class="hero-actions">
          <el-button type="primary" size="large" round @click="startLearning">
            <el-icon><VideoPlay /></el-icon>&nbsp;{{ store.recommendedLesson ? '继续学习' : '开始学习' }}
          </el-button>
          <el-button size="large" round @click="$router.push('/git/lesson/git-intro-1')">
            <el-icon><Guide /></el-icon>&nbsp;从第一课开始
          </el-button>
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
            <div class="stat-label">个交互练习</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="stat-num">{{ store.overallPercent }}%</div>
            <div class="stat-label">学习进度</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 推荐继续 -->
    <el-card v-if="recommend" shadow="never" class="recommend-card">
      <div class="recommend-row">
        <div class="recommend-info">
          <el-tag size="small" type="danger" effect="light" round>智能推荐</el-tag>
          <span>
            下一步：<b>{{ recommend.chapter.title }}</b> · {{ recommend.title }}
            <span v-if="store.hintLevel(recommend.id) > 0" class="hint-flag">
              （你查看过 {{ store.hintLevel(recommend.id) }} 条提示，建议复习）
            </span>
          </span>
        </div>
        <el-button type="danger" round @click="$router.push(`/git/lesson/${recommend.id}`)">
          继续学习 <el-icon><Right /></el-icon>
        </el-button>
      </div>
      <el-progress :percentage="store.overallPercent" :stroke-width="12" color="#F05032" striped striped-flow />
    </el-card>

    <!-- 章节卡片 -->
    <div class="section-title">
      <h2>学习路径（从基础到进阶）</h2>
      <p>建议按顺序学习，每节都包含讲解与可实操的练习任务</p>
    </div>

    <div class="chapter-grid">
      <div
        v-for="(ch, i) in gitChapters"
        :key="ch.id"
        class="chapter-card"
        :style="{ '--ch-color': ch.color }"
        @click="goChapter(ch)"
      >
        <div class="card-top">
          <div class="card-index">{{ ch.index }}</div>
          <div class="card-icon" :style="{ background: ch.color + '1a', color: ch.color }">
            <el-icon :size="26"><component :is="ch.icon" /></el-icon>
          </div>
          <el-tag
            v-if="chapterDone(ch.id)"
            size="small"
            type="success"
            effect="light"
            round
          >已完成</el-tag>
        </div>

        <h3 class="card-title">{{ ch.title }}</h3>
        <p class="card-desc">{{ ch.description }}</p>

        <div class="card-meta">
          <span><el-icon><Reading /></el-icon> {{ ch.lessons.length }} 节课</span>
          <span><el-icon><Timer /></el-icon> 约 {{ ch.minutes }} 分钟</span>
          <span><el-icon><Aim /></el-icon> {{ ch.lessons.filter((l) => l.practice).length }} 个练习</span>
        </div>

        <div class="card-progress">
          <el-progress
            :percentage="store.chapterPercent(ch.id)"
            :stroke-width="8"
            :color="ch.color"
            :show-text="false"
          />
          <span class="card-percent">{{ store.chapterPercent(ch.id) }}%</span>
        </div>

        <div class="card-footer">
          <el-button type="primary" plain size="small" round :style="{ color: ch.color, borderColor: ch.color + '66' }">
            {{ i === 0 && store.completedCount === 0 ? '开始学习' : chapterDone(ch.id) ? '再次学习' : '进入章节' }}
            <el-icon class="el-icon--right"><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 特色说明 -->
    <div class="feature-row">
      <div class="feature-item" v-for="f in features" :key="f.title">
        <div class="feature-icon" :style="{ background: f.color + '1a', color: f.color }">
          <el-icon :size="22"><component :is="f.icon" /></el-icon>
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
import { gitChapters, gitStats } from '@/data/gitLessons'
import { useGitProgressStore } from '@/stores/gitProgress'
import type { GitChapter, GitLesson } from '@/types'

const router = useRouter()
const store = useGitProgressStore()

const stats = gitStats
const recommend = computed(() => store.recommendedLesson as (GitLesson & { chapter: GitChapter }) | null)

const chapterDone = (id: string) => store.chapterProgress.find((c) => c.id === id)?.percent === 100

const startLearning = () => {
  if (store.recommendedLesson) {
    router.push(`/git/lesson/${store.recommendedLesson.id}`)
  } else {
    router.push(`/git/lesson/${gitChapters[0].lessons[0].id}`)
  }
}

const goChapter = (ch: GitChapter) => {
  router.push({ path: '/git', query: { ch: ch.id } })
  // 跳转到该章第一课
  router.push(`/git/lesson/${ch.lessons[0].id}`)
}

interface Feature {
  title: string
  desc: string
  icon: string
  color: string
}

const features: Feature[] = [
  { title: '知识体系完整', desc: '参考 Gitee Git 大全，覆盖基础操作到进阶技巧', icon: 'Guide', color: '#F05032' },
  { title: '模拟仓库实操', desc: '浏览器内直接输入 git 命令，实时查看仓库变化', icon: 'Monitor', color: '#00B96B' },
  { title: '智能提示引导', desc: '错误命令自动纠错，卡住时给出分级线索提示', icon: 'ChatLineRound', color: '#F7A600' },
  { title: '进度与推荐', desc: '自动跟踪学习进度，按你的水平推荐下一步练习', icon: 'TrendCharts', color: '#7B61FF' }
]
</script>

<style scoped>
.git-home {
  max-width: 1180px;
  margin: 0 auto;
}

.hero {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(135deg, #3d0e0e 0%, #a52a14 55%, #f05032 100%);
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
  max-width: 780px;
  margin: 0 auto;
}

.hero-logo {
  width: 84px;
  height: 84px;
  border-radius: 18px;
  background: #fff;
  color: #f05032;
  font-size: 40px;
  font-weight: 900;
  font-style: italic;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  animation: float 3.5s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
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
  max-width: 660px;
}

.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.hero-actions :deep(.el-button--primary) {
  background: #fff;
  border-color: #fff;
  color: #c9472c;
  font-weight: 700;
}

.hero-actions :deep(.el-button--primary:hover) {
  background: #fff3f0;
}

.hero-actions :deep(.el-button:not(.el-button--primary)) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.45);
  color: #fff;
}

.hero-actions :deep(.el-button:not(.el-button--primary):hover) {
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

.recommend-card {
  border-radius: 12px;
  margin-top: 20px;
  border: 1px solid rgba(240, 80, 50, 0.25);
}

.recommend-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.recommend-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-main);
}

.recommend-info .el-icon {
  color: #f7a600;
}

.hint-flag {
  color: #909399;
  font-size: 12px;
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
  box-shadow: 0 10px 28px rgba(240, 80, 50, 0.12);
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
  gap: 14px;
  font-size: 12.5px;
  color: #909399;
  flex-wrap: wrap;
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

.card-progress :deep(.el-progress) {
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

  .hero-actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
