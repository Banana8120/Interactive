<template>
  <div class="viz-panel">
    <div class="viz-header">
      <span class="viz-title">
        <n-icon><Share /></n-icon>
        Docker 拓扑视图
      </span>
      <span class="viz-sync" :class="{ flashing }">
        <n-icon :class="{ spinning: flashing }"><RefreshRight /></n-icon>
        已同步
      </span>
    </div>

    <!-- 概览 -->
    <div class="stat-row">
      <span class="stat"><b class="c-run">{{ runningCount }}</b> 运行</span>
      <span class="stat"><b>{{ env.containers.length }}</b> 容器</span>
      <span class="stat"><b>{{ env.images.length }}</b> 镜像</span>
      <span class="stat"><b>{{ env.volumes.length }}</b> 卷</span>
      <span class="stat"><b>{{ userNets.length }}</b> 网络</span>
    </div>

    <!-- 拓扑画布 -->
    <div class="canvas-wrap">
      <svg :width="Math.max(g.contentW, 520)" :height="g.contentH" class="topo">
        <!-- 网络泳道背景 -->
        <g v-for="lane in g.lanes" :key="'lane-' + lane.name">
          <rect
            :x="lane.x" :y="lane.y" :width="lane.w" :height="lane.h"
            rx="10" class="lane-rect" :style="{ fill: lane.tint, stroke: lane.color }"
          />
          <text :x="lane.x + 12" :y="lane.y + 18" class="lane-label" :fill="lane.color">
            <tspan class="lane-icon">{{ lane.name === 'bridge' ? '⌗' : '◎' }}</tspan>
            {{ lane.name }}
            <tspan class="lane-count" dx="4">{{ lane.containers.length }}</tspan>
          </text>
        </g>

        <!-- 镜像 → 容器 连线 -->
        <path
          v-for="e in g.imgEdges" :key="e.key"
          :d="e.d" class="edge edge-img"
        />
        <!-- 容器 → 卷 连线 -->
        <path
          v-for="e in g.volEdges" :key="e.key"
          :d="e.d" class="edge edge-vol"
        />

        <!-- 镜像节点（顶层）：外层 g 负责定位，内层 g 负责动画 -->
        <transition-group name="node" tag="g">
          <g v-for="img in g.images" :key="img.full" :transform="`translate(${img.x}, ${img.y})`">
            <g class="node-inner">
              <rect :width="img.w" :height="img.h" rx="7" class="img-box" />
              <rect x="8" y="6" width="10" height="4" rx="1.5" class="layer l3" />
              <rect x="8" y="12" width="10" height="4" rx="1.5" class="layer l2" />
              <rect x="8" y="18" width="10" height="4" rx="1.5" class="layer l1" />
              <text :x="26" y="16" class="img-name">{{ short(img.repo, 11) }}</text>
              <text :x="26" y="30" class="img-meta">:{{ img.tag }} · {{ img.size }}</text>
            </g>
          </g>
        </transition-group>

        <!-- 容器节点（泳道内） -->
        <transition-group name="node" tag="g">
          <g v-for="c in g.containers" :key="c.id" :transform="`translate(${c.x}, ${c.y})`">
            <g class="node-inner ctr-node" :class="c.status">
              <rect :width="c.w" :height="c.h" rx="8" class="ctr-box" />
              <circle :cx="14" :cy="16" r="4.5" class="ctr-dot" />
              <text :x="26" y="19" class="ctr-name">{{ short(c.name, 11) }}</text>
              <text :x="10" y="38" class="ctr-img">{{ short(c.image, 15) }}</text>
              <text v-if="c.ports" :x="10" :y="54" class="ctr-ports">⇅ {{ c.ports }}</text>
              <text v-if="c.status !== 'running'" :x="c.w - 10" :y="19" class="ctr-state" text-anchor="end">{{ c.status }}</text>
            </g>
          </g>
        </transition-group>

        <!-- 卷节点（底层） -->
        <transition-group name="node" tag="g">
          <g v-for="v in g.volumes" :key="v.name" :transform="`translate(${v.x}, ${v.y})`">
            <g class="node-inner">
              <ellipse :cx="v.w / 2" cy="6" rx="16" ry="5" class="vol-top" />
              <path :d="`M ${v.w / 2 - 16} 6 L ${v.w / 2 - 16} 40 A 16 5 0 0 0 ${v.w / 2 + 16} 40 L ${v.w / 2 + 16} 6`" class="vol-body" />
              <text :x="v.w / 2" y="27" class="vol-name" text-anchor="middle">{{ short(v.name, 9) }}</text>
            </g>
          </g>
        </transition-group>

        <!-- 空状态 -->
        <text v-if="!g.containers.length" :x="g.laneX - 10" :y="g.lanesY + 56" class="empty-hint" text-anchor="end">
          在左侧终端执行 docker run 创建你的第一个容器
        </text>
      </svg>
    </div>

    <!-- 图例 -->
    <div class="legend">
      <span class="lg"><i class="sw sw-img"></i>镜像</span>
      <span class="lg"><i class="sw sw-ctr"></i>容器</span>
      <span class="lg"><i class="sw sw-vol"></i>数据卷</span>
      <span class="lg"><i class="sw sw-net"></i>网络泳道</span>
    </div>

    <!-- 最近操作 -->
    <div class="log-box">
      <transition-group name="fx" tag="div" class="log-list">
        <div v-if="!events.length" class="empty" key="__empty_log">等待你的第一条命令…</div>
        <div v-for="ev in events" :key="ev.seq" class="log-item" :class="{ err: !ev.ok }">
          <span class="log-time">{{ ev.time }}</span>
          <span class="log-cmd">$ {{ ev.input }}</span>
          <span class="log-badge">{{ ev.ok ? '✓' : '✗' }}</span>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DockerEnv } from '@/types'

interface TopologyEvent {
  seq: number
  time: string
  input: string
  ok: boolean
}

interface Props {
  env: DockerEnv
  events?: TopologyEvent[]
  syncSeq?: number
}

const props = withDefaults(defineProps<Props>(), {
  events: () => [],
  syncSeq: 0
})

const short = (s: string | number, n: number) =>
  String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s)

const builtin = ['host', 'none']
const runningCount = computed(() => props.env.containers.filter(c => c.status === 'running').length)
const userNets = computed(() => props.env.networks.filter(n => !builtin.includes(n.name)))

// 同步指示器
const flashing = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null
watch(() => props.syncSeq, () => {
  flashing.value = true
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashing.value = false }, 800)
})

const LANE_COLORS = [
  { color: '#2496ed', tint: 'rgba(36,150,237,0.06)' },
  { color: '#8f5cf0', tint: 'rgba(143,92,240,0.06)' },
  { color: '#0fa3a3', tint: 'rgba(15,163,163,0.06)' },
  { color: '#d97706', tint: 'rgba(217,119,6,0.06)' }
]

/**
 * 拓扑布局：镜像（顶层）→ 网络泳道（中层，容器在内）→ 数据卷（底层）
 * 每次 env 快照变化时重新计算，节点坐标稳定（按索引排布），
 * 配合 transition-group 的 key 复用实现平滑动画。
 */
const g = computed(() => {
  const env = props.env
  const PAD = 14
  const IMG_W = 108, IMG_H = 42, IMG_GAP = 12
  const CTR_W = 112, CTR_H = 58, CTR_GAP = 14
  const LANE_GAP = 12
  const VOL_W = 52, VOL_H = 42, VOL_GAP = 14
  const COL_GAP = 28

  // 1. 镜像列：左侧垂直堆叠
  const imgColX = PAD
  const images = env.images.map((img, i) => ({
    ...img,
    x: imgColX,
    y: 14 + i * (IMG_H + IMG_GAP),
    w: IMG_W,
    h: IMG_H
  }))
  const imagesH = images.length ? images[images.length - 1].y + IMG_H - 14 : 0

    // 2. 网络泳道：镜像右侧，容器在泳道内垂直堆叠
    const LANE_HEADER_H = 32
    const LANE_MIN_H = 90
    const nets = env.networks.filter(n => !builtin.includes(n.name))
    const bridgeFirst = [
      ...nets.filter(n => n.name === 'bridge'),
      ...nets.filter(n => n.name !== 'bridge')
    ]
    const laneX = imgColX + IMG_W + COL_GAP
    const lanesY = 14

    const lanes = bridgeFirst.map((n, li) => ({
      name: n.name,
      containers: env.containers.filter(c => (c.network || 'bridge') === n.name),
      color: LANE_COLORS[li % LANE_COLORS.length].color,
      tint: LANE_COLORS[li % LANE_COLORS.length].tint,
      x: laneX,
      y: 0,
      w: Math.max(CTR_W + PAD * 2, 180),
      h: 0
    }))

    // 先按容器数量计算每个泳道高度，再按高度累加确定 y
    lanes.forEach(lane => {
      const n = lane.containers.length
      lane.h = Math.max(LANE_HEADER_H + n * (CTR_H + CTR_GAP) - CTR_GAP + PAD, LANE_MIN_H)
    })
    let currentLaneY = lanesY
    lanes.forEach(lane => {
      lane.y = currentLaneY
      currentLaneY += lane.h + LANE_GAP
    })

    const containers: any[] = []
    lanes.forEach(lane => {
      lane.containers.forEach((c, i) => {
        containers.push({
          ...c,
          x: lane.x + PAD,
          y: lane.y + LANE_HEADER_H + i * (CTR_H + CTR_GAP),
          w: CTR_W,
          h: CTR_H
        })
      })
    })

    const lanesW = lanes.length ? Math.max(...lanes.map(l => l.w)) : 180
    lanes.forEach(l => { l.w = Math.max(lanesW, 180) })

  // 3. 数据卷层：底部
  const lanesBottom = lanes.length ? lanes[lanes.length - 1].y + lanes[lanes.length - 1].h : lanesY
  const volsY = Math.max(imagesH + 14, lanesBottom) + 28

  const volumes = env.volumes.map((v, i) => ({
    ...v,
    x: PAD + i * (VOL_W + VOL_GAP),
    y: volsY,
    w: VOL_W,
    h: VOL_H
  }))
  const volsW = Math.max(volumes.length * (VOL_W + VOL_GAP) - VOL_GAP + PAD * 2, 0)

  const contentW = Math.max(laneX + lanesW + PAD, volsW + PAD * 2, 240)
  const contentH = volsY + (volumes.length ? VOL_H : 20) + 10

  // 4. 连线：镜像 → 容器（虚线）；容器 → 卷
  const imgMap = new Map(images.map(im => [im.full, im]))
  const imgEdges = []
  for (const c of containers) {
    const im = imgMap.get(c.image)
    if (!im) continue
    const x1 = im.x + im.w, y1 = im.y + im.h / 2
    // 容器改为纵向排列后，连线终点改为容器左侧中点
    const x2 = c.x, y2 = c.y + c.h / 2
    imgEdges.push({
      key: 'ie-' + c.id,
      d: `M ${x1} ${y1} C ${x1 + 22} ${y1}, ${x2 - 22} ${y2}, ${x2} ${y2}`
    })
  }

  const volEdges = []
  for (const c of containers) {
    if (!c.volume) continue
    const vname = String(c.volume).split(':')[0]
    const v = volumes.find(v => v.name === vname)
    if (!v) continue
    const x1 = c.x + c.w / 2, y1 = c.y + c.h
    const x2 = v.x + v.w / 2, y2 = v.y + 4
    volEdges.push({
      key: 've-' + c.id + '-' + v.name,
      d: `M ${x1} ${y1} C ${x1} ${y1 + 24}, ${x2} ${y2 - 24}, ${x2} ${y2}`
    })
  }

  return { images, lanes, containers, volumes, imgEdges, volEdges, contentW, contentH, lanesY, laneX, imgColX }
})
</script>

<style scoped>
.viz-panel {
  display: flex;
  flex-direction: column;
  background: #f7f9fc;
  min-height: 0;
  height: 100%;
}

.viz-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #eef2f8;
  border-bottom: 1px solid #dde5ef;
  flex-shrink: 0;
}

.viz-title {
  font-size: 13px;
  font-weight: 600;
  color: #33445c;
  display: flex;
  align-items: center;
  gap: 6px;
}

.viz-sync {
  font-size: 12px;
  color: #8496ad;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: color 0.25s;
}

.viz-sync.flashing { color: #18a058; }
.spinning { animation: spinOnce 0.8s ease; }

@keyframes spinOnce {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 概览 */
.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 8px 14px;
  border-bottom: 1px solid #e6ecf4;
  font-size: 11.5px;
  color: #7488a3;
  flex-shrink: 0;
}

.stat b {
  color: #33445c;
  font-size: 13px;
  margin-right: 2px;
}

.stat .c-run { color: #18a058; }

/* 画布 */
.canvas-wrap {
  flex: 1;
  overflow: auto;
  min-height: 0;
  padding: 10px 12px 4px;
  background:
    linear-gradient(rgba(36, 150, 237, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(36, 150, 237, 0.035) 1px, transparent 1px);
  background-size: 18px 18px;
}

.topo { display: block; }

/* 泳道 */
.lane-rect {
  stroke-width: 1.2;
  stroke-dasharray: 6 4;
}

.lane-label {
  font-size: 11px;
  font-weight: 600;
}

.lane-count {
  font-size: 10px;
  fill: #98a7ba;
  font-weight: 400;
}

.lane-icon { font-size: 10px; }

/* 连线 */
.edge {
  fill: none;
  stroke-width: 1.4;
  pointer-events: none;
}

.edge-img {
  stroke: #b48cf2;
  stroke-dasharray: 5 4;
  opacity: 0.75;
}

.edge-vol {
  stroke: #d9a13e;
  stroke-dasharray: 5 4;
  opacity: 0.8;
}

/* 镜像节点 */
.img-box {
  fill: #ffffff;
  stroke: #cbb5f5;
  stroke-width: 1.3;
}

.layer { stroke: none; }
.l1 { fill: #8f5cf0; }
.l2 { fill: #a98bf3; opacity: 0.85; }
.l3 { fill: #c4b0f6; opacity: 0.7; }

.img-name {
  font-size: 11px;
  font-weight: 600;
  fill: #33445c;
}

.img-meta {
  font-size: 9.5px;
  fill: #8b7db8;
}

/* 容器节点 */
.ctr-box {
  fill: #ffffff;
  stroke: #bcd4c8;
  stroke-width: 1.4;
}

.ctr-node.running .ctr-box {
  stroke: #2fb469;
  filter: drop-shadow(0 1px 4px rgba(24, 160, 88, 0.28));
}

.ctr-node.exited .ctr-box { stroke: #d3dae4; fill: #f6f8fa; }

.ctr-dot { fill: #c0c8d4; }

.ctr-node.running .ctr-dot {
  fill: #18a058;
  animation: dotBreath 1.8s ease-in-out infinite;
}

@keyframes dotBreath {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.ctr-name {
  font-size: 11px;
  font-weight: 600;
  fill: #33445c;
}

.ctr-node.exited .ctr-name { fill: #8496ad; }

.ctr-img {
  font-size: 9.5px;
  fill: #7488a3;
}

.ctr-ports {
  font-size: 9.5px;
  fill: #2496ed;
  font-weight: 600;
}

.ctr-state {
  font-size: 8.5px;
  fill: #98a7ba;
}

/* 卷节点 */
.vol-top { fill: #f3e3c0; stroke: #d9a13e; stroke-width: 1.2; }
.vol-body { fill: #fdf6e6; stroke: #d9a13e; stroke-width: 1.2; }
.vol-name {
  font-size: 9px;
  fill: #a07514;
  font-family: Consolas, monospace;
}

.empty-hint {
  font-size: 11px;
  fill: #98a7ba;
}

/* SVG 节点进出场动画（作用于内层 g，避免覆盖外层定位 transform） */
.node-inner { transform-box: fill-box; transform-origin: center; }

.node-enter-active .node-inner,
.node-leave-active .node-inner {
  transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.node-enter-from .node-inner,
.node-leave-to .node-inner {
  opacity: 0;
  transform: scale(0.55);
}

/* 图例 */
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 7px 14px;
  border-top: 1px solid #e6ecf4;
  font-size: 11px;
  color: #7488a3;
  flex-shrink: 0;
}

.lg { display: inline-flex; align-items: center; gap: 4px; }

.sw {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

.sw-img { background: #ede4fc; border: 1px solid #b48cf2; }
.sw-ctr { background: #e6f6ec; border: 1px solid #2fb469; }
.sw-vol { background: #fdf6e6; border: 1px solid #d9a13e; }
.sw-net { background: rgba(36,150,237,0.08); border: 1px dashed #2496ed; }

/* 操作日志 */
.log-box {
  flex-shrink: 0;
  max-height: 108px;
  overflow-y: auto;
  border-top: 1px solid #e6ecf4;
  background: #fbfcfe;
  padding: 6px 12px;
}

.log-list { display: flex; flex-direction: column; gap: 4px; }

.log-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #edf2f8;
}

.log-item.err { background: #fef5f5; border-color: #f5d5d5; }

.log-time {
  color: #98a7ba;
  font-family: Consolas, monospace;
  flex-shrink: 0;
}

.log-cmd {
  flex: 1;
  color: #45597a;
  font-family: Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-badge { color: #18a058; font-weight: 700; flex-shrink: 0; }
.log-item.err .log-badge { color: #d03050; }

.empty { font-size: 11.5px; color: #98a7ba; padding: 2px; }

.fx-enter-active { transition: all 0.35s ease; }
.fx-leave-active { transition: all 0.25s ease; }
.fx-enter-from { opacity: 0; transform: translateY(-6px); }
.fx-leave-to { opacity: 0; }
</style>

