<template>
  <div class="playground-page">
    <SimulatedTerminal
      :key="terminalKey"
      @snapshot-synced="onSnapshotSynced"
      @reset-environment="resetWorkspace"
    />
    <DockerStatePanel :env="dockerEnv" :events="dockerEvents" :sync-seq="dockerSyncSeq" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message, confirmDialog } from '@/utils/feedback'
import SimulatedTerminal from '@/components/SimulatedTerminal.vue'
import DockerStatePanel from '@/components/DockerStatePanel.vue'
import {
  clearDockerState,
  getEnvironment,
  loadDockerState,
  resetEnvironment,
  saveDockerState
} from '@/terminal/simulator'
import type { DockerEnv } from '@/types'

interface SnapshotPayload {
  env: DockerEnv
  events: any[]
  syncSeq: number
}

const WORKSPACE_ID = 'docker-playground'

if (!loadDockerState(WORKSPACE_ID)) resetEnvironment()

const terminalKey = ref(0)
const dockerEnv = ref<DockerEnv>(getEnvironment())
const dockerEvents = ref<any[]>([])
const dockerSyncSeq = ref(0)

function onSnapshotSynced({ env, events, syncSeq }: SnapshotPayload) {
  dockerEnv.value = env
  dockerEvents.value = events || []
  dockerSyncSeq.value = syncSeq || 0
  saveDockerState(WORKSPACE_ID)
}

function resetWorkspace() {
  confirmDialog(
    '重置将清空当前 Docker 模拟环境和本地缓存，确定继续吗？',
    '重置 Docker 环境',
    { confirmButtonText: '确定重置', cancelButtonText: '取消', type: 'warning' }
  )
    .then(() => {
      clearDockerState(WORKSPACE_ID)
      resetEnvironment()
      dockerEnv.value = getEnvironment()
      dockerEvents.value = []
      dockerSyncSeq.value++
      terminalKey.value++
      message.success('Docker 模拟环境已重置')
    })
    .catch(() => {})
}
</script>

<style scoped>
.playground-page {
  max-width: 1200px;
  min-width: 0;
  margin: 0 auto;
}
</style>
