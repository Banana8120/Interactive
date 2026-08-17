<template>
  <div class="quiz-card">
    <div class="quiz-header">
      <el-icon class="quiz-icon"><QuestionFilled /></el-icon>
      <div>
        <div class="quiz-title">小测验</div>
        <div class="quiz-sub">回答下面的问题，检验本节学习效果</div>
      </div>
    </div>

    <div v-for="(q, qi) in questions" :key="qi" class="quiz-item">
      <div class="quiz-question">{{ qi + 1 }}. {{ q.question }}</div>
      <div class="quiz-options">
        <button
          v-for="(opt, oi) in q.options"
          :key="oi"
          class="quiz-option"
          :class="optionClass(qi, oi)"
          :disabled="answered[qi] !== undefined"
          @click="select(qi, oi)"
        >
          <span class="opt-letter">{{ String.fromCharCode(65 + oi) }}</span>
          <span class="opt-text">{{ opt }}</span>
          <el-icon v-if="answered[qi] === oi" class="opt-mark"><Select /></el-icon>
          <el-icon v-else-if="answered[qi] !== undefined && oi === q.answer" class="opt-mark"><CircleCheckFilled /></el-icon>
        </button>
      </div>

      <transition name="fade">
        <div v-if="answered[qi] !== undefined" class="quiz-feedback" :class="answered[qi] === q.answer ? 'correct' : 'wrong'">
          <el-icon>
            <CircleCheckFilled v-if="answered[qi] === q.answer" />
            <CircleCloseFilled v-else />
          </el-icon>
          <div class="feedback-text">
            <b>{{ answered[qi] === q.answer ? '回答正确！' : '回答错误' }}</b>
            <span>{{ q.explain }}</span>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  questions: { type: Array, default: () => [] }
})

const emit = defineEmits(['answered'])

const answered = ref({})
const stats = ref({ correct: 0, total: 0 })

watch(
  () => props.questions,
  () => {
    answered.value = {}
    stats.value = { correct: 0, total: 0 }
  },
  { deep: true }
)

function select(qi, oi) {
  if (answered.value[qi] !== undefined) return
  answered.value[qi] = oi
  const correct = oi === props.questions[qi].answer
  if (correct) stats.value.correct++
  stats.value.total++
  emit('answered', { questionIndex: qi, correct })
}

function optionClass(qi, oi) {
  const sel = answered.value[qi]
  if (sel === undefined) return ''
  if (oi === props.questions[qi].answer) return 'correct'
  if (oi === sel) return 'wrong'
  return 'dimmed'
}
</script>

<style scoped>
.quiz-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  padding: 18px 20px;
  margin-top: 16px;
}

.quiz-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.quiz-icon {
  font-size: 26px;
  color: #f7a600;
}

.quiz-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.quiz-sub {
  font-size: 12.5px;
  color: var(--text-sub);
}

.quiz-item {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-light);
}

.quiz-item:first-of-type {
  border-top: none;
}

.quiz-question {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 10px;
  line-height: 1.6;
}

.quiz-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quiz-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: #fafbfc;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: var(--text-main);
}

.quiz-option:not(:disabled):hover {
  border-color: #2496ed;
  background: #f0f6fc;
}

.quiz-option.correct {
  border-color: #67c23a;
  background: #f0f9eb;
  color: #529b2e;
}

.quiz-option.wrong {
  border-color: #f56c6c;
  background: #fef0f0;
  color: #c45656;
}

.quiz-option.dimmed {
  opacity: 0.55;
}

.opt-letter {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #eef2f7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-sub);
  flex-shrink: 0;
}

.quiz-option.correct .opt-letter {
  background: #67c23a;
  color: #fff;
}

.quiz-option.wrong .opt-letter {
  background: #f56c6c;
  color: #fff;
}

.opt-text {
  flex: 1;
}

.opt-mark {
  font-size: 16px;
}

.quiz-feedback {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.7;
  align-items: flex-start;
}

.quiz-feedback .el-icon {
  font-size: 18px;
  margin-top: 2px;
  flex-shrink: 0;
}

.quiz-feedback.correct {
  background: #f0f9eb;
  color: #529b2e;
}

.quiz-feedback.wrong {
  background: #fef0f0;
  color: #c45656;
}

.feedback-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
