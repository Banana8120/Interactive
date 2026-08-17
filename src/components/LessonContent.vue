<template>
  <div class="lesson-content">
    <template v-for="(block, i) in blocks" :key="i">
      <!-- 段落文本 -->
      <div v-if="block.type === 'text'" class="content-text" v-html="block.html"></div>

      <!-- 代码块 -->
      <div v-else-if="block.type === 'code'" class="code-wrap">
        <div class="code-block">
          <span class="lang-tag">{{ block.lang || 'bash' }}</span>
          <pre>{{ block.code }}</pre>
        </div>
        <button v-if="block.code && !block.hideCopy" class="copy-btn" @click="copyCode(block.code)">
          <el-icon><CopyDocument /></el-icon>
          复制
        </button>
      </div>

      <!-- 提示 -->
      <el-alert
        v-else-if="block.type === 'tip'"
        type="success"
        :closable="false"
        class="content-alert"
      >
        <template #title>
          <b v-if="block.title">{{ block.title }}：</b>{{ plain(block.text) }}
        </template>
      </el-alert>

      <!-- 警告 -->
      <el-alert
        v-else-if="block.type === 'warning'"
        type="warning"
        :closable="false"
        class="content-alert"
      >
        <template #title>
          <b v-if="block.title">{{ block.title }}：</b>{{ plain(block.text) }}
        </template>
      </el-alert>

      <!-- 表格 -->
      <div v-else-if="block.type === 'table'" class="table-wrap">
        <table class="content-table">
          <thead>
            <tr><th v-for="(h, k) in block.headers" :key="k">{{ h }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in block.rows" :key="r">
              <td v-for="(cell, c) in row" :key="c" v-html="rich(cell)"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 列表 -->
      <ul v-else-if="block.type === 'list'" class="content-list">
        <li v-for="(item, k) in block.items" :key="k" v-html="rich(item)"></li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const props = defineProps({
  blocks: { type: Array, default: () => [] }
})

// 提示/警告块里的文本去 HTML 标签
const plain = (t) => (t || '').replace(/<[^>]+>/g, '')

// 表格/列表内容支持 <b> <code> 等轻量标签
const rich = (t) => {
  let s = String(t || '')
  s = s.replace(/<code[^>]*>(.*?)<\/code>/g, '<code class="inline-code">$1</code>')
  return s
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success('代码已复制到剪贴板')
  } catch (e) {
    ElMessage.warning('复制失败，请手动选择复制')
  }
}
</script>

<style scoped>
.lesson-content {
  max-width: 100%;
}

.code-wrap {
  position: relative;
  margin: 12px 0;
}

.copy-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #9ecbff;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
  z-index: 2;
}

.copy-btn:hover {
  background: rgba(36, 150, 237, 0.3);
  color: #fff;
}

.content-alert {
  margin: 12px 0;
  border-radius: 8px;
}

.content-alert :deep(.el-alert__title) {
  font-size: 13.5px;
  line-height: 1.7;
}

.table-wrap {
  overflow-x: auto;
  margin: 12px 0;
}

.content-table {
  min-width: 100%;
}
</style>
