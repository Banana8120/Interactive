<template>
  <div class="mysql-home">
    <section class="hero">
      <div class="hero-bg"></div>
      <div class="hero-inner">
        <div class="hero-logo">SQL</div>
        <h1 class="hero-title">交互式 MySQL 学习</h1>
        <p class="hero-desc">
          从数据库、表结构、字段类型开始，到插入、查询、更新和删除数据。
          每节课都可以直接输入 SQL，并在数据面板里观察库、表和行数据的变化。
        </p>

        <div class="hero-actions">
          <n-button type="primary" size="large" round @click="startLearning">
            <n-icon><VideoPlay /></n-icon>&nbsp;{{ store.recommendedLesson ? '继续学习' : '开始学习' }}
          </n-button>
          <n-button size="large" round @click="$router.push('/mysql/lesson/mysql-intro-1')">
            <n-icon><Guide /></n-icon>&nbsp;从第一课开始
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
            <div class="stat-label">个交互练习</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="stat-num">{{ store.overallPercent }}%</div>
            <div class="stat-label">已完成</div>
          </div>
        </div>
      </div>
    </section>

    <n-card v-if="recommend" :bordered="true" class="recommend-card">
      <div class="recommend-row">
        <div class="recommend-info">
          <n-tag size="small" type="info" :bordered="false" round>智能推荐</n-tag>
          <span>
            下一步：<b>{{ recommend.chapter.title }}</b> · {{ recommend.title }}
            <span v-if="store.hintLevel(recommend.id) > 0" class="hint-flag">
              （你查看过 {{ store.hintLevel(recommend.id) }} 条提示）
            </span>
          </span>
        </div>
        <n-button type="info" round @click="$router.push(`/mysql/lesson/${recommend.id}`)">
          继续学习 <n-icon><Right /></n-icon>
        </n-button>
      </div>
      <n-progress :percentage="store.overallPercent" :stroke-width="12" color="#00618A" processing />
    </n-card>

    <div class="section-title">
      <h2>学习路径</h2>
      <p>按顺序完成每个练习，观察右侧数据面板如何随 SQL 改变</p>
    </div>

    <div class="chapter-grid">
      <div
        v-for="(ch, i) in mysqlChapters"
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
          <n-tag
            v-if="chapterDone(ch.id)"
            size="small"
            type="success"
            :bordered="false"
            round
          >已完成</n-tag>
        </div>

        <h3 class="card-title">{{ ch.title }}</h3>
        <p class="card-desc">{{ ch.description }}</p>

        <div class="card-meta">
          <span><n-icon><Reading /></n-icon> {{ ch.lessons.length }} 节课</span>
          <span><n-icon><Timer /></n-icon> 约 {{ ch.minutes }} 分钟</span>
          <span><n-icon><Aim /></n-icon> {{ ch.lessons.filter((l) => l.practice).length }} 个练习</span>
        </div>

        <div class="card-progress">
          <n-progress
            :percentage="store.chapterPercent(ch.id)"
            :stroke-width="8"
            :color="ch.color"
            :show-indicator="false"
          />
          <span class="card-percent">{{ store.chapterPercent(ch.id) }}%</span>
        </div>

        <div class="card-footer">
          <n-button type="primary" secondary size="small" round :style="{ color: ch.color, borderColor: ch.color + '66' }">
            {{ i === 0 && store.completedCount === 0 ? '开始学习' : chapterDone(ch.id) ? '再次学习' : '进入章节' }}
            <n-icon class="icon-right"><ArrowRight /></n-icon>
          </n-button>
        </div>
      </div>
    </div>

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
import { mysqlChapters, mysqlStats } from '@/data/mysqlLessons'
import { useMySqlProgressStore } from '@/stores/mysqlProgress'
import type { MySqlChapter, MySqlLesson } from '@/types'

const router = useRouter()
const store = useMySqlProgressStore()

const stats = mysqlStats
const recommend = computed(() => store.recommendedLesson as (MySqlLesson & { chapter: MySqlChapter }) | null)

const chapterDone = (id: string) => store.chapterProgress.find((c) => c.id === id)?.percent === 100

const startLearning = () => {
  if (store.recommendedLesson) {
    router.push(`/mysql/lesson/${store.recommendedLesson.id}`)
  } else {
    router.push(`/mysql/lesson/${mysqlChapters[0].lessons[0].id}`)
  }
}

const goChapter = (ch: MySqlChapter) => {
  router.push(`/mysql/lesson/${ch.lessons[0].id}`)
}

interface Feature {
  title: string
  desc: string
  icon: string
  color: string
}

const features: Feature[] = [
  { title: 'SQL 标准写法', desc: '关键字、字段、分号和常见子句按真实 MySQL 风格组织', icon: 'Document', color: '#00618A' },
  { title: '数据面板联动', desc: '每次 INSERT、UPDATE、DELETE 都能看到表数据变化', icon: 'Database', color: '#00A3C4' },
  { title: '智能命令提示', desc: '根据当前数据库和表，给出可直接点击或 Tab 补全的 SQL', icon: 'ChatLineRound', color: '#F7A600' },
  { title: '安全习惯训练', desc: '重点强调 WHERE、主键、自增和删除清空的风险边界', icon: 'WarningFilled', color: '#E85D75' }
]
</script>

<style scoped>
.mysql-home {
  max-width: 1180px;
  margin: 0 auto;
}

.hero {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(135deg, #003b57 0%, #00618a 56%, #00a3c4 100%);
  padding: 56px 32px 44px;
  color: #fff;
  text-align: center;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 46px 46px;
  opacity: 0.35;
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
  color: #00618a;
  font-size: 34px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
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

.hero-actions :deep(.n-button--primary-type) {
  background: #fff;
  border-color: #fff;
  color: #00618a;
  font-weight: 700;
}

.hero-actions :deep(.n-button:not(.n-button--primary-type)) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.45);
  color: #fff;
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
  border: 1px solid rgba(0, 97, 138, 0.25);
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
  box-shadow: 0 10px 28px rgba(0, 97, 138, 0.12);
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
