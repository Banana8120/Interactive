import { defineStore } from 'pinia'
import { chapters } from '@/data/lessons'

const STORAGE_KEY = 'docker-tutorial-progress-v1'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    /* ignore */
  }
  return { completedLessons: [], quizResults: {}, finishedChapters: [], lastVisited: null, startedAt: Date.now(), hintsUsed: {} }
}

export const useProgressStore = defineStore('progress', {
  state: () => loadState(),

  getters: {
    totalLessons: () => chapters.reduce((s, c) => s + c.lessons.length, 0),
    totalChapters: () => chapters.length,
    completedCount: (state) => state.completedLessons.length,
    overallPercent: (state) => {
      const total = chapters.reduce((s, c) => s + c.lessons.length, 0)
      return total ? Math.round((state.completedLessons.length / total) * 100) : 0
    },
    isLessonCompleted: (state) => (lessonId) => state.completedLessons.includes(lessonId),
    isChapterCompleted: (state) => (chapterId) => state.finishedChapters.includes(chapterId),
    chapterProgress(state) {
      return chapters.map((ch) => {
        const done = ch.lessons.filter((l) => state.completedLessons.includes(l.id)).length
        return {
          id: ch.id,
          done,
          total: ch.lessons.length,
          percent: Math.round((done / ch.lessons.length) * 100)
        }
      })
    },
    chapterPercent: (state) => (chapterId) => {
      const ch = chapters.find((c) => c.id === chapterId)
      if (!ch) return 0
      const done = ch.lessons.filter((l) => state.completedLessons.includes(l.id)).length
      return Math.round((done / ch.lessons.length) * 100)
    },
    quizStats: (state) => {
      const results = Object.values(state.quizResults)
      const correct = results.filter((r) => r.correct).length
      return { total: results.length, correct, percent: results.length ? Math.round((correct / results.length) * 100) : 0 }
    }
  },

  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        completedLessons: this.completedLessons,
        quizResults: this.quizResults,
        finishedChapters: this.finishedChapters,
        lastVisited: this.lastVisited,
        startedAt: this.startedAt,
        hintsUsed: this.hintsUsed
      }))
    },

    completeLesson(lessonId, chapterId) {
      if (!this.completedLessons.includes(lessonId)) {
        this.completedLessons.push(lessonId)
      }
      const ch = chapters.find((c) => c.id === chapterId)
      if (ch) {
        const allDone = ch.lessons.every((l) => this.completedLessons.includes(l.id))
        if (allDone && !this.finishedChapters.includes(chapterId)) {
          this.finishedChapters.push(chapterId)
        }
      }
      this.persist()
    },

    recordQuiz(lessonId, index, correct, total) {
      this.quizResults[`${lessonId}#${index}`] = { correct, total, ts: Date.now() }
      this.persist()
    },

    setLastVisited(lessonId) {
      this.lastVisited = lessonId
      this.persist()
    },

    recordHint(lessonId, level) {
      if (!lessonId) return
      this.hintsUsed[lessonId] = level
      this.persist()
    },

    resetProgress() {
      this.completedLessons = []
      this.quizResults = {}
      this.finishedChapters = []
      this.lastVisited = null
      this.startedAt = Date.now()
      this.persist()
    }
  }
})
