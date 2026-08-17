/**
 * Git 模拟引擎 —— 纯浏览器内存模拟，不依赖真实 Git。
 *
 * 维护状态：工作区 / 暂存区 / 提交图 / 分支 / 标签 / 远程仓库 / stash / reflog
 * 支持命令：init config status add commit log diff branch checkout switch merge
 *           remote push pull tag stash reset revert cherry-pick reflog rm mv show help
 */

const VERSION = 'git version 2.45.1.windows.1'

const INITIAL_FILES = {
  'README.md': '# Git 学习项目\n\n这是一个用于 Git 交互式学习的示例仓库。\n',
  'index.html': '<!DOCTYPE html>\n<html>\n<head><title>Git 学习</title></head>\n<body>\n  <h1>Hello, Git!</h1>\n</body>\n</html>\n',
  'app.js': "// 应用入口\nconsole.log('hello git')\n"
}

function randomHash(len = 7) {
  const chars = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)]
  return s
}

function nowText() {
  const d = new Date()
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  return `${mon} ${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function createState() {
  return {
    initialized: false,
    config: { user: { name: '', email: '' } },
    branches: { master: null },          // 分支名 -> 提交 hash（null 表示无提交）
    head: 'master',                      // 当前分支名
    detached: false,
    commits: {},                         // hash -> commit 对象
    tags: {},                            // 标签名 -> hash
    staged: {},                          // 路径 -> 内容（null 表示删除）
    workdir: { ...INITIAL_FILES },       // 路径 -> 内容
    remotes: {},                         // 名称 -> { url, branches: {} }
    stash: [],                           // [{ msg, staged, workdir }]
    reflog: [],                          // 头部移动日志
    mergeState: null,                    // 合并中状态（简化）
    cherryPickState: null
  }
}

let state = createState()

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export function executeGitCommand(rawInput) {
  const input = String(rawInput || '').trim()
  if (!input) return { type: 'empty', lines: [] }

  const parts = input.split(/\s+/)
  const cmd = parts[0]

  if (cmd !== 'git') {
    // 终端内置命令：help / clear / echo 与 Docker 模拟终端保持一致
    if (cmd === 'help') return gitHelp()
    if (cmd === 'clear') return { type: 'clear', lines: [] }
    if (cmd === 'echo') return runEcho(parts.slice(1))
    return {
      type: 'error',
      lines: [`bash: ${cmd}: command not found`, '提示：本模块是 Git 学习环境，请以 "git" 开头的命令操作，例如 git status。']
    }
  }
  return runGit(parts.slice(1))
}

/**
 * echo 内置命令：支持重定向写入/追加文件（模拟真实 shell，供练习“修改文件”使用）
 *   echo "hello" >  app.js   覆盖写
 *   echo "hello" >> app.js   追加写
 *   echo hello               纯输出
 */
function runEcho(args) {
  const full = args.join(' ')
  const m = full.match(/^(.*?)\s*(>>|>)\s*(\S+)\s*$/)
  if (m) {
    if (!state.initialized) {
      return { type: 'error', lines: ['fatal: not a git repository (or any of the parent directories): .git', '提示：先 git init 初始化一个仓库吧！'] }
    }
    const [, head, op, file] = m
    const body = head.replace(/^echo\s*/, '').trim()
    const text = body.replace(/^"|"$/g, '').replace(/'/g, '')
    if (op === '>') {
      state.workdir[file] = text + '\n'
    } else {
      state.workdir[file] = (state.workdir[file] || '') + text + '\n'
    }
    return { type: 'output', lines: [] }
  }
  return { type: 'output', lines: [args.join(' ')] }
}

export function getGitState() {
  return state
}

export function resetGitEnvironment() {
  // 保留 --global 身份配置（真实 Git 中存于 ~/.gitconfig，跨仓库、跨课时有效）
  const keepConfig = state ? state.config : null
  state = createState()
  if (keepConfig && keepConfig.user) {
    state.config.user = { ...keepConfig.user }
  }
  return state
}

// ---------------------------------------------------------------------------
// 本地持久化：按课时缓存仓库状态，刷新/切回页面后可恢复
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'git-sim-state-v1'

function storageKey(lessonId) {
  return `${STORAGE_KEY_PREFIX}-${lessonId}`
}

export function saveGitState(lessonId) {
  if (!lessonId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(storageKey(lessonId), JSON.stringify(state))
    return true
  } catch (e) {
    return false
  }
}

export function loadGitState(lessonId) {
  if (!lessonId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    const raw = localStorage.getItem(storageKey(lessonId))
    if (!raw) return false
    const saved = JSON.parse(raw)
    if (saved && typeof saved === 'object') {
      state = saved
      return true
    }
    return false
  } catch (e) {
    return false
  }
}

export function clearGitState(lessonId) {
  if (!lessonId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.removeItem(storageKey(lessonId))
    return true
  } catch (e) {
    return false
  }
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function headCommit(s = state) {
  const ref = s.detached ? s.detachedAt : s.branches[s.head]
  return ref ? s.commits[ref] : null
}

function headTree(s = state) {
  const c = headCommit(s)
  return c ? { ...c.files } : {}
}

function branchExists(name) {
  return Object.prototype.hasOwnProperty.call(state.branches, name)
}

function commitExists(ref) {
  if (!ref) return false
  if (state.commits[ref]) return true
  const short = Object.keys(state.commits).filter((h) => h.startsWith(ref))
  return short.length === 1
}

function resolveRef(ref) {
  if (!ref) return null
  if (state.commits[ref]) return ref
  const short = Object.keys(state.commits).filter((h) => h.startsWith(ref))
  if (short.length === 1) return short[0]
  if (branchExists(ref) && state.branches[ref]) return state.branches[ref]
  if (state.tags[ref]) return state.tags[ref]
  if (ref === 'HEAD') return headCommit()?.hash || null
  if (ref === 'HEAD~1' || ref === 'HEAD^') return headCommit()?.parent || null
  const m = ref && ref.match(/HEAD~(\d+)/)
  if (m) {
    let h = headCommit()?.hash || null
    for (let i = 0; i < Number(m[1]) && h; i++) h = state.commits[h].parent
    return h
  }
  return null
}

function parentTreeOf(hash) {
  if (!hash) return {}
  const c = state.commits[hash]
  return c ? { ...c.files } : {}
}

function pushReflog(msg) {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const cur = state.detached ? state.detachedAt || '(none)' : (state.branches[state.head] || '(none)')
  state.reflog.unshift({ from: cur, msg, time: `${hh}:${mm}:${ss}`, head: state.head })
  if (state.reflog.length > 30) state.reflog.length = 30
}

function newCommit(msg, tree) {
  const hash = randomHash()
  const c = {
    hash,
    msg,
    parent: headCommit()?.hash || null,
    author: state.config.user.name || 'learner',
    email: state.config.user.email || 'learner@example.com',
    date: nowText(),
    files: tree
  }
  state.commits[hash] = c
  if (!state.detached) state.branches[state.head] = hash
  else state.detachedAt = hash
  pushReflog(`commit: ${msg}`)
  return c
}

function treeDiff(a, b) {
  // a/b 均为 { path: content }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const changed = []
  for (const k of keys) {
    if ((a[k] ?? null) !== (b[k] ?? null)) changed.push(k)
  }
  return changed.sort()
}

function fmtStatusLine(path, state2) {
  const tree = state2.headTreeCache
  const treeVal = tree[path]
  const inTree = Object.prototype.hasOwnProperty.call(tree, path)
  const stagedVal = state2.staged[path]
  const inStaged = Object.prototype.hasOwnProperty.call(state2.staged, path)
  const workVal = state2.workdir[path]
  const inWork = Object.prototype.hasOwnProperty.call(state2.workdir, path)

  // X: 暂存区 vs HEAD
  let X = ' '
  if (inStaged) {
    if (stagedVal === null) X = 'D'
    else if (!inTree) X = 'A'
    else if (stagedVal !== treeVal) X = 'M'
  }
  // Y: 工作区 vs 暂存区（或 HEAD）
  let Y = ' '
  if (!inStaged) {
    if (!inTree) Y = '?'   // 未跟踪：真实 Git 返回 '??'
    else if (!inWork) Y = 'D'
    else if (workVal !== treeVal) Y = 'M'
  } else {
    if (stagedVal !== null && !inWork) Y = 'D'
    else if (stagedVal !== null && workVal !== stagedVal) Y = 'M'
  }
  // 未跟踪时 X 也置 '?'，与真实 Git 的 '??' 一致
  if (Y === '?') X = '?'
  return X + Y
}

// ---------------------------------------------------------------------------
// 命令实现
// ---------------------------------------------------------------------------

function runGit(args) {
  if (args.length === 0 || !args[0]) return gitHelp()
  const [sub, ...rest] = args

  if (sub === '--version' || sub === 'version') return { type: 'output', lines: [VERSION] }
  if (sub === 'help') return gitHelp()
  if (sub === 'init') return gitInit(rest)
  if (sub === 'config') return gitConfig(rest)
  if (sub === 'status' || sub === 'st') return gitStatus(rest)
  if (sub === 'add') return gitAdd(rest)
  if (sub === 'commit') return gitCommit(rest)
  if (sub === 'log') return gitLog(rest)
  if (sub === 'diff') return gitDiff(rest)
  if (sub === 'branch') return gitBranch(rest)
  if (sub === 'checkout') return gitCheckout(rest)
  if (sub === 'switch') return gitSwitch(rest)
  if (sub === 'merge') return gitMerge(rest)
  if (sub === 'remote') return gitRemote(rest)
  if (sub === 'push') return gitPush(rest)
  if (sub === 'pull') return gitPull(rest)
  if (sub === 'tag') return gitTag(rest)
  if (sub === 'stash') return gitStash(rest)
  if (sub === 'reset') return gitReset(rest)
  if (sub === 'revert') return gitRevert(rest)
  if (sub === 'cherry-pick') return gitCherryPick(rest)
  if (sub === 'reflog') return gitReflog(rest)
  if (sub === 'rm') return gitRm(rest)
  if (sub === 'mv') return gitMv(rest)
  if (sub === 'show') return gitShow(rest)
  if (sub === 'clone') return gitClone(rest)

  // 拼写纠错
  const fix = suggestFix(sub)
  if (fix) {
    return {
      type: 'error',
      lines: [`git: '${sub}' is not a git command. See 'git --help'.`, `你是想输入 "git ${fix}" 吗？试试正确的命令吧。`]
    }
  }
  return { type: 'error', lines: [`git: '${sub}' is not a git command. See 'git --help'.`, '输入 "git help" 查看支持的命令列表。'] }
}

const KNOWN_SUBS = ['init', 'config', 'status', 'add', 'commit', 'log', 'diff', 'branch', 'checkout', 'switch', 'merge', 'remote', 'push', 'pull', 'tag', 'stash', 'reset', 'revert', 'cherry-pick', 'reflog', 'rm', 'mv', 'show', 'clone', 'help', 'version']

function suggestFix(sub) {
  for (const k of KNOWN_SUBS) {
    if (k.startsWith(sub) && sub.length >= 3) return k
  }
  const map = {
    comit: 'commit', cmmit: 'commit', commmit: 'commit', staus: 'status', statsu: 'status',
    ad: 'add', addd: 'add', brnach: 'branch', branh: 'branch', checkot: 'checkout',
    chckout: 'checkout', merget: 'merge', marge: 'merge', pulll: 'pull', puch: 'push',
    tagg: 'tag', logg: 'log', stah: 'stash', resset: 'reset', rest: 'reset', branc: 'branch'
  }
  return map[sub] || null
}

function requireInit() {
  if (!state.initialized) {
    return { type: 'error', lines: ['fatal: not a git repository (or any of the parent directories): .git', '提示：先执行 git init 初始化一个仓库吧！'] }
  }
  return null
}

function gitInit(args) {
  if (state.initialized) {
    return { type: 'output', lines: ['Reinitialized existing Git repository in /home/learner/git-project/.git/'] }
  }
  state.initialized = true
  return {
    type: 'output',
    lines: [
      "hint: Using 'master' as the name for the initial branch. This default branch name",
      'hint: is subject to change. To configure the initial branch name to use in all',
      'hint: of your new repositories, which will suppress this warning, call:',
      '',
      'hint:   git config --global init.defaultBranch master',
      '',
      "Initialized empty Git repository in /home/learner/git-project/.git/",
      '',
      '✅ 仓库已初始化！接下来配置你的身份信息：',
      '   git config --global user.name "你的名字"',
      '   git config --global user.email "你的邮箱"'
    ]
  }
}

function gitConfig(args) {
  if (!args.length) return { type: 'error', lines: ['用法: git config [--global] user.name "名字" | user.email "邮箱" | --list', '示例: git config --global user.name "Alice"'] }
  if (args[0] === '--list' || args[0] === '-l') {
    return {
      type: 'output',
      lines: [
        `user.name=${state.config.user.name || '(未设置)'}`,
        `user.email=${state.config.user.email || '(未设置)'}`
      ]
    }
  }
  // 跳过 --global 等标志
  const kv = args.filter((a) => !a.startsWith('-'))
  const [key, value] = kv
  if (key === 'user.name') {
    state.config.user.name = (value || '').replace(/^["']|["']$/g, '')
    return { type: 'output', lines: [`✅ 已设置全局用户名为: ${state.config.user.name}`] }
  }
  if (key === 'user.email') {
    state.config.user.email = (value || '').replace(/^["']|["']$/g, '')
    return { type: 'output', lines: [`✅ 已设置全局邮箱为: ${state.config.user.email}`] }
  }
  return { type: 'error', lines: ['仅支持配置 user.name 与 user.email，例如：', '  git config --global user.name "Alice"'] }
}

function gitStatus() {
  const req = requireInit()
  if (req) return req
  const tree = headTree()
  const head = headCommit()
  const branchLine = state.detached ? `HEAD detached at ${state.detachedAt || '(none)'}` : `On branch ${state.head}`

  const paths = new Set([...Object.keys(state.workdir), ...Object.keys(state.staged), ...Object.keys(tree)])
  const items = []
  for (const p of paths) {
    const xy = fmtStatusLine(p, { staged: state.staged, workdir: state.workdir, headTreeCache: tree })
    if (xy === '  ') continue
    items.push({ p, xy })
  }

  const lines = [branchLine]
  if (state.remotes.origin && state.remotes.origin.branches[state.head] === state.branches[state.head]) {
    lines.push(`Your branch is up to date with 'origin/${state.head}'.`)
  }
  if (!head) lines.push('', 'No commits yet', '')

  // 先剔除未跟踪文件，再按 X/Y 分类，避免 '??' 同时命中多个区块
  const untracked = items.filter((i) => i.xy[1] === '?')
  const tracked = items.filter((i) => i.xy[1] !== '?')
  const stagedItems = tracked.filter((i) => i.xy[0] !== ' ')
  const unstagedItems = tracked.filter((i) => i.xy[0] === ' ' && i.xy[1] !== ' ')

  if (stagedItems.length) {
    lines.push('Changes to be committed:')
    lines.push('  (use "git restore --staged <file>..." to unstage)')
    for (const i of stagedItems) {
      const label = i.xy[0] === 'A' ? 'new file:' : i.xy[0] === 'D' ? 'deleted:' : 'modified:'
      lines.push(`\t${label}   ${i.p}`)
    }
  } else {
    lines.push('Changes to be committed:', '  (none)')
  }

  if (unstagedItems.length) {
    lines.push('', 'Changes not staged for commit:')
    lines.push('  (use "git add <file>..." to update what will be committed)')
    for (const i of unstagedItems) {
      const label = i.xy[1] === 'D' ? 'deleted:' : 'modified:'
      lines.push(`\t${label}   ${i.p}`)
    }
  }

  if (untracked.length) {
    lines.push('', 'Untracked files:')
    lines.push('  (use "git add <file>..." to include in what will be committed)')
    for (const i of untracked) lines.push(`\t${i.p}`)
  }

  lines.push('')
  if (!items.length) lines.push('nothing to commit, working tree clean')
  else if (!stagedItems.length) lines.push('nothing added to commit but untracked files present (use "git add" to track)')
  return { type: 'output', lines }
}

/** 供可视化面板使用的结构化状态：返回 { path, index, working }[] */
export function getStatusMap(customState = null) {
  const s = customState || state
  if (!s.initialized) return []
  const tree = headTree(s)
  const paths = new Set([...Object.keys(s.workdir), ...Object.keys(s.staged), ...Object.keys(tree)])
  const result = []
  for (const p of paths) {
    const xy = fmtStatusLine(p, { staged: s.staged, workdir: s.workdir, headTreeCache: tree })
    if (xy === '  ') continue
    result.push({ path: p, index: xy[0], working: xy[1] })
  }
  return result
}

function gitAdd(args) {
  const req = requireInit()
  if (req) return req
  if (!args.length || args.includes('--help')) {
    return { type: 'error', lines: ['用法: git add <file>... 或 git add .（添加全部）'] }
  }
  const added = []
  const missing = []
  for (const arg of args) {
    if (arg === '.') {
      for (const p of Object.keys(state.workdir)) {
        state.staged[p] = state.workdir[p]
        added.push(p)
      }
      // 已被跟踪但工作区删除的文件也要暂存删除
      const tree = headTree()
      for (const p of Object.keys(tree)) {
        if (state.workdir[p] === undefined && !state.staged[p]) {
          state.staged[p] = null
          added.push(p)
        }
      }
      continue
    }
    if (state.workdir[arg] !== undefined) {
      state.staged[arg] = state.workdir[arg]
      added.push(arg)
    } else if (headTree()[arg] !== undefined) {
      state.staged[arg] = null
      added.push(arg)
    } else {
      missing.push(arg)
    }
  }
  const lines = []
  for (const p of added) lines.push(`✅ 已暂存: ${p}`)
  for (const p of missing) lines.push(`fatal: pathspec '${p}' did not match any files`)
  if (!lines.length) lines.push('nothing to add')
  return { type: 'output', lines }
}

function gitCommit(args) {
  const req = requireInit()
  if (req) return req
  if (!args.length) return { type: 'error', lines: ['用法: git commit -m "提交说明"', '示例: git commit -m "feat: 添加首页"'] }
  const idx = args.indexOf('-m')
  let msg = idx > -1 ? args.slice(idx + 1).join(' ').replace(/^["']|["']$/g, '') : ''
  if (!msg) return { type: 'error', lines: ['fatal: no commit message provided. 请使用 -m 参数：git commit -m "提交说明"'] }
  if (!Object.keys(state.staged).length) {
    return { type: 'error', lines: ['nothing to commit, working tree clean', '提示：先 git add 把文件加入暂存区，再 git commit。'] }
  }
  if (!state.config.user.name) {
    return {
      type: 'error',
      lines: [
        '*** Please tell me who you are.',
        '',
        'Run',
        '',
        '  git config --global user.email "you@example.com"',
        '  git config --global user.name "Your Name"',
        '',
        'to set your account\'s default identity.',
        '提示：先配置身份信息（git config）才能提交。'
      ]
    }
  }
  // 生成新树
  const tree = headTree()
  for (const [p, v] of Object.entries(state.staged)) {
    if (v === null) delete tree[p]
    else tree[p] = v
  }
  const commit = newCommit(msg, tree)
  state.staged = {}
  return {
    type: 'output',
    lines: [
      `[${state.head} ${commit.hash}] ${msg}`,
      ` ${Object.keys(commit.files).length} file(s) changed`,
      '✅ 提交成功！提交历史已更新。'
    ],
    delay: 300
  }
}

function gitLog(args) {
  const req = requireInit()
  if (req) return req
  const head = headCommit()
  if (!head) return { type: 'output', lines: ['fatal: your current branch has no commits yet', '提示：先 git add + git commit 创建第一个提交。'] }
  const oneline = args.includes('--oneline')
  const all = args.includes('--all')
  const lines = []
  let cur = head.hash
  let depth = 0
  if (all) {
    // --all：从所有分支头 / 标签 / HEAD 出发收集可达提交，按创建顺序（新→旧）输出
    const refs = new Set(Object.values(state.branches).filter(Boolean))
    for (const h of Object.values(state.tags)) refs.add(h)
    if (state.detachedAt) refs.add(state.detachedAt)
    const reachable = new Set()
    for (const h of refs) {
      let c = h
      while (c) {
        reachable.add(c)
        c = state.commits[c]?.parent || null
      }
    }
    const chain = Object.keys(state.commits).filter((h) => reachable.has(h)).map((h) => state.commits[h]).reverse()
    const emit = (c) => (oneline
      ? lines.push(`${c.hash} ${c.msg}`)
      : lines.push(`commit ${c.hash}`, `Author: ${c.author} <${c.email}>`, `Date:   ${c.date} +0800`, '', `    ${c.msg}`, ''))
    for (const c of chain) emit(c)
    if (!lines.length) lines.push('（没有可达的提交）')
    return { type: 'output', lines, delay: 200 }
  }
  while (cur && depth < 50) {
    const c = state.commits[cur]
    if (oneline) {
      lines.push(`${c.hash} ${c.msg}`)
    } else {
      lines.push(`commit ${c.hash}`)
      lines.push(`Author: ${c.author} <${c.email}>`)
      lines.push(`Date:   ${c.date} +0800`)
      lines.push('')
      lines.push(`    ${c.msg}`)
      lines.push('')
    }
    cur = c.parent
    depth++
  }
  return { type: 'output', lines, delay: 200 }
}

function gitDiff(args) {
  const req = requireInit()
  if (req) return req
  const tree = headTree()
  const stagedOnly = args.includes('--staged') || args.includes('--cached')
  const lines = []
  const paths = new Set([...Object.keys(state.workdir), ...Object.keys(state.staged), ...Object.keys(tree)])
  for (const p of paths) {
    const treeVal = tree[p] ?? null
    const stagedVal = Object.prototype.hasOwnProperty.call(state.staged, p) ? state.staged[p] : treeVal
    const workVal = state.workdir[p] ?? null
    if (stagedOnly) {
      if (stagedVal !== treeVal) {
        lines.push(`diff --git a/${p} b/${p}`, '--- a/' + p, '+++ b/' + p)
        lines.push(`@@ -1 +1 @@`, `-${(treeVal || '').split('\n')[0] || 'deleted'}`, `+${(stagedVal || '').split('\n')[0] || 'deleted'}`)
        lines.push('')
      }
    } else if (workVal !== stagedVal) {
      lines.push(`diff --git a/${p} b/${p}`, '--- a/' + p, '+++ b/' + p)
      lines.push(`@@ -1 +1 @@`, `-${(stagedVal || '').split('\n')[0] || 'deleted'}`, `+${(workVal || '').split('\n')[0] || 'deleted'}`)
      lines.push('')
    }
  }
  if (!lines.length) return { type: 'output', lines: ['（没有差异）'] }
  return { type: 'output', lines }
}

function gitBranch(args) {
  const req = requireInit()
  if (req) return req
  const head = headCommit()
  if (!head && !args.length) return { type: 'output', lines: ['（仓库还没有提交，无法显示分支列表）'] }
  if (!args.length) {
    const lines = []
    for (const [name, hash] of Object.entries(state.branches)) {
      const cur = name === state.head ? '* ' : '  '
      const h = hash ? hash.slice(0, 7) : '(no commits)'
      lines.push(`${cur}${name} ${h}`)
    }
    return { type: 'output', lines }
  }
  if (args[0] === '-a' || args[0] === '-r') {
    const lines = []
    for (const [name] of Object.entries(state.branches)) lines.push(`  ${name}`)
    for (const [rname, r] of Object.entries(state.remotes)) {
      for (const b of Object.keys(r.branches)) lines.push(`  remotes/${rname}/${b}`)
    }
    return { type: 'output', lines }
  }
  if (args[0] === '-d' || args[0] === '-D') {
    const name = args[1]
    if (!name) return { type: 'error', lines: ['用法: git branch -d <分支名>'] }
    if (!branchExists(name)) return { type: 'error', lines: [`error: branch '${name}' not found.`] }
    if (name === state.head) return { type: 'error', lines: [`error: Cannot delete branch '${name}' checked out at '${name}'`, '提示：先切换到其他分支再删除。'] }
    delete state.branches[name]
    return { type: 'output', lines: [`Deleted branch ${name} (was ${state.branches[name] ? state.branches[name].slice(0, 7) : ''}).`] }
  }
  const name = args[0]
  if (name.startsWith('-')) return { type: 'error', lines: [`git: unknown option '${name}'`, '用法: git branch | git branch <name> | git branch -d <name>'] }
  if (branchExists(name)) return { type: 'error', lines: [`fatal: A branch named '${name}' already exists.`] }
  state.branches[name] = headCommit()?.hash || null
  return { type: 'output', lines: [`✅ 已创建分支 ${name}（指向 ${head ? head.hash.slice(0, 7) : '暂无提交'}）`, '提示：用 git checkout <分支名> 或 git switch <分支名> 切换到该分支。'] }
}

function switchToBranch(name, create) {
  const from = state.head
  if (create) {
    if (branchExists(name)) return { type: 'error', lines: [`fatal: A branch named '${name}' already exists.`] }
    state.branches[name] = headCommit()?.hash || null
    state.head = name
    state.detached = false
    pushReflog(`checkout: moving from ${from} to ${name}`)
    return { type: 'output', lines: [`✅ 已创建并切换到分支 ${name}`, '提示：可用 git branch 查看当前所有分支（* 表示当前分支）。'] }
  }
  if (!branchExists(name)) {
    return { type: 'error', lines: [`error: pathspec '${name}' did not match any file(s) known to git`, `提示：分支 ${name} 不存在。先 git branch ${name} 创建，或用 git checkout -b ${name} 创建并切换。`] }
  }
  // 有未提交的修改时阻止切换（只检查已跟踪文件，untracked 不阻止）
  const tree = headTree()
  const dirty = Object.keys(tree).some((p) => (state.workdir[p] ?? null) !== tree[p])
  if (dirty) {
    return { type: 'error', lines: ['error: Your local changes would be overwritten by checkout.', '提示：当前工作区有未提交的修改。先 git add + git commit，或 git stash 暂存，再切换分支。'] }
  }
  state.head = name
  state.detached = false
  pushReflog(`checkout: moving from ${from} to ${name}`)
  return { type: 'output', lines: [`✅ 已切换到分支 ${name}`, '提示：当前 HEAD 指向 ' + name + '，可用 git status 确认。'] }
}

function gitCheckout(args) {
  const req = requireInit()
  if (req) return req
  if (!args.length) return { type: 'error', lines: ['用法: git checkout <分支> | git checkout -b <新分支> | git checkout -- <file>'] }
  if (args[0] === '-b') {
    return switchToBranch(args[1], true)
  }
  if (args[0] === '--') {
    const file = args[1]
    if (!file) return { type: 'error', lines: ['用法: git checkout -- <file>（丢弃工作区的修改）'] }
    const tree = headTree()
    if (tree[file] === undefined) {
      delete state.workdir[file]
      delete state.staged[file]
      return { type: 'output', lines: [`✅ 已丢弃 ${file} 的修改（恢复到 HEAD 状态）。`] }
    }
    state.workdir[file] = tree[file]
    delete state.staged[file]
    return { type: 'output', lines: [`✅ 已丢弃 ${file} 的修改，恢复到最近一次提交的内容。`] }
  }
  return switchToBranch(args[0], false)
}

function gitSwitch(args) {
  const req = requireInit()
  if (req) return req
  if (!args.length) return { type: 'error', lines: ['用法: git switch <分支> | git switch -c <新分支>'] }
  if (args[0] === '-c' || args[0] === '--create') return switchToBranch(args[1], true)
  return switchToBranch(args[0], false)
}

function gitMerge(args) {
  const req = requireInit()
  if (req) return req
  const name = args[0]
  if (!name) return { type: 'error', lines: ['用法: git merge <分支名>'] }
  if (!branchExists(name)) return { type: 'error', lines: [`fatal: '${name}' does not appear to be a git repository`, `提示：分支 ${name} 不存在。`] }
  const target = state.branches[name]
  if (!target) return { type: 'error', lines: [`fatal: couldn't find remote ref ${name}`, '提示：目标分支还没有任何提交。'] }
  const cur = state.branches[state.head]
  if (!cur) return { type: 'error', lines: ['fatal: cannot merge a branch without commits on current branch', '提示：当前分支还没有提交。'] }
  if (name === state.head) return { type: 'output', lines: [`Already up to date.`] }

  const targetCommit = state.commits[target]
  const curCommit = state.commits[cur]

  // 判断是否为 fast-forward（当前分支是目标分支的祖先）
  let isAncestor = false
  let walk = target
  while (walk) {
    if (walk === cur) { isAncestor = true; break }
    walk = state.commits[walk]?.parent || null
  }

  if (isAncestor) {
    state.branches[state.head] = target
    pushReflog(`merge ${name}: Fast-forward`)
    return {
      type: 'output',
      lines: [
        `Updating ${cur.slice(0, 7)}..${target.slice(0, 7)}`,
        'Fast-forward',
        `✅ 已快进合并：${state.head} 分支直接指向了 ${name} 的最新提交。`,
        '提示：git log --oneline 查看合并后的提交历史。'
      ]
    }
  }

  // 模拟三方合并：合并文件树（简化，同名冲突用 target 内容）
  const mergedFiles = { ...curCommit.files }
  let conflict = false
  for (const [p, v] of Object.entries(targetCommit.files)) {
    if (mergedFiles[p] !== undefined && mergedFiles[p] !== v) {
      // 简化为冲突：保留当前分支内容并标记冲突提示
      conflict = true
    } else {
      mergedFiles[p] = v
    }
  }
  // 目标分支删除的文件
  for (const p of Object.keys(curCommit.files)) {
    if (targetCommit.files[p] === undefined) delete mergedFiles[p]
  }

  if (conflict) {
    return {
      type: 'error',
      lines: [
        `Auto-merging conflicts (simulated)`,
        `CONFLICT: merge conflict in files (simulated)`,
        '提示：真实 Git 中需要手动解决冲突；本模拟环境为教学简化，',
        '建议先用 git log --oneline 观察分支差异，再尝试合并。'
      ]
    }
  }

  const hash = randomHash()
  state.commits[hash] = {
    hash,
    msg: `Merge branch '${name}' into ${state.head}`,
    parent: cur,
    author: curCommit.author,
    email: curCommit.email,
    date: nowText(),
    files: mergedFiles
  }
  state.branches[state.head] = hash
  pushReflog(`merge ${name}: Merge made by the 'ort' strategy.`)
  return {
    type: 'output',
    lines: [
      `Merge made by the 'ort' strategy.`,
      `✅ 合并完成！${name} 的内容已合并到 ${state.head}。`,
      '提示：git log --oneline 查看新的合并提交。'
    ]
  }
}

function gitRemote(args) {
  const req = requireInit()
  if (req) return req
  if (!args.length || args[0] === '-v') {
    const lines = []
    for (const [name, r] of Object.entries(state.remotes)) {
      lines.push(`${name}\t${r.url} (fetch)`)
      lines.push(`${name}\t${r.url} (push)`)
    }
    if (!lines.length) lines.push('（还没有配置远程仓库）', '提示：git remote add origin <仓库地址>')
    return { type: 'output', lines }
  }
  if (args[0] === 'add') {
    const name = args[1] || 'origin'
    const url = args[2] || 'https://gitee.com/learner/git-project.git'
    state.remotes[name] = { url, branches: {} }
    return { type: 'output', lines: [`✅ 已添加远程仓库 ${name} -> ${url}`, '提示：git remote -v 查看远程配置。'] }
  }
  return { type: 'error', lines: ['用法: git remote -v | git remote add origin <url>'] }
}

function gitPush(args) {
  const req = requireInit()
  if (req) return req
  const remoteName = args.find((a) => !a.startsWith('-')) || 'origin'
  if (!state.remotes[remoteName]) {
    return { type: 'error', lines: [`fatal: '${remoteName}' does not appear to be a git repository`, '提示：先 git remote add origin <url> 配置远程仓库。'] }
  }
  const head = headCommit()
  if (!head) return { type: 'error', lines: ['error: src refspec master does not match any', '提示：本地还没有提交，先 git commit。'] }
  const remote = state.remotes[remoteName]
  const localHash = state.branches[state.head]
  remote.branches[state.head] = localHash
  return {
    type: 'output',
    lines: [
      `Enumerating objects: 5, done.`,
      `Writing objects: 100% (5/5), done.`,
      `To ${remote.url}`,
      `   ${head.parent ? state.commits[head.parent].hash.slice(0, 7) : '0000000'}..${localHash.slice(0, 7)}  ${state.head} -> ${state.head}`,
      `✅ 已推送！本地 ${state.head} 分支已同步到远程 ${remoteName}。`
    ],
    delay: 400
  }
}

function gitPull(args) {
  const req = requireInit()
  if (req) return req
  const remoteName = args.find((a) => !a.startsWith('-')) || 'origin'
  const remote = state.remotes[remoteName]
  if (!remote) return { type: 'error', lines: ['fatal: No configured remote for your current branch.', '提示：先 git remote add origin <url> 配置远程仓库。'] }
  const remoteHash = remote.branches[state.head]
  if (!remoteHash) return { type: 'output', lines: ['Already up to date.', '（远程仓库还没有该分支的提交，或与本地一致）'] }
  const cur = state.branches[state.head]
  if (cur === remoteHash) return { type: 'output', lines: ['Already up to date.'] }
  if (cur && state.commits[remoteHash]) {
    // 模拟快进拉取
    state.branches[state.head] = remoteHash
    pushReflog(`pull ${remoteName} ${state.head}: Fast-forward`)
    return {
      type: 'output',
      lines: [
        `Updating ${cur.slice(0, 7)}..${remoteHash.slice(0, 7)}`,
        'Fast-forward',
        `✅ 已拉取远程最新内容到本地 ${state.head} 分支。`
      ]
    }
  }
  return { type: 'output', lines: ['Already up to date.'] }
}

function gitClone(args) {
  const url = args.find((a) => !a.startsWith('-')) || 'https://gitee.com/learner/git-project.git'
  state.initialized = true
  const baseHash = randomHash()
  state.commits[baseHash] = {
    hash: baseHash,
    msg: 'Initial commit',
    parent: null,
    author: 'gitee_user',
    email: 'gitee_user@gitee.com',
    date: nowText(),
    files: { ...INITIAL_FILES }
  }
  state.branches = { master: baseHash, main: baseHash }
  state.head = 'master'
  state.workdir = { ...INITIAL_FILES }
  state.staged = {}
  state.remotes = { origin: { url, branches: { master: baseHash } } }
  pushReflog(`clone: from ${url}`)
  return {
    type: 'output',
    lines: [
      `Cloning into 'git-project'...`,
      'remote: Enumerating objects: 5, done.',
      'Receiving objects: 100% (5/5), done.',
      `✅ 克隆完成！已从 ${url} 拉取仓库到本地。`,
      '提示：git log --oneline 查看提交历史。'
    ],
    delay: 400
  }
}

function gitTag(args) {
  const req = requireInit()
  if (req) return req
  if (!args.length) {
    const lines = Object.keys(state.tags)
    return { type: 'output', lines: lines.length ? lines : ['（还没有标签）', '提示：git tag <名称> 为当前提交打标签。'] }
  }
  if (args[0] === '-a') {
    const name = args[1]
    const mi = args.indexOf('-m')
    const msg = mi > -1 ? args.slice(mi + 1).join(' ').replace(/^["']|["']$/g, '') : ''
    if (!name) return { type: 'error', lines: ['用法: git tag -a <标签名> -m "说明"'] }
    const head = headCommit()
    if (!head) return { type: 'error', lines: ['fatal: Failed to resolve \'HEAD\' as a valid ref.', '提示：先创建提交再打标签。'] }
    if (state.tags[name]) return { type: 'error', lines: [`fatal: tag '${name}' already exists`] }
    state.tags[name] = head.hash
    return { type: 'output', lines: [`✅ 已创建附注标签 ${name} -> ${head.hash.slice(0, 7)}（${msg || '无说明'}）`] }
  }
  const name = args[0]
  if (name.startsWith('-')) return { type: 'error', lines: ['用法: git tag <标签名> | git tag -a <标签名> -m "说明"'] }
  const head = headCommit()
  if (!head) return { type: 'error', lines: ['fatal: Failed to resolve \'HEAD\' as a valid ref.', '提示：先创建提交再打标签。'] }
  if (state.tags[name]) return { type: 'error', lines: [`fatal: tag '${name}' already exists`] }
  state.tags[name] = head.hash
  return { type: 'output', lines: [`✅ 已创建轻量标签 ${name} -> ${head.hash.slice(0, 7)}`] }
}

function gitStash(args) {
  const req = requireInit()
  if (req) return req
  const head = headCommit()
  if (!head) return { type: 'output', lines: ['（还没有提交，无法 stash）'] }
  const sub = args[0]
  if (sub === 'list') {
    const lines = state.stash.map((s, i) => `stash@{${i}}: WIP on ${s.branch}: ${s.msg}`)
    return { type: 'output', lines: lines.length ? lines : ['（stash 栈为空）'] }
  }
  if (sub === 'pop') {
    const s = state.stash.shift()
    if (!s) return { type: 'output', lines: ['No stash entries found.', '提示：先 git stash 保存修改。'] }
    Object.assign(state.workdir, s.workdir)
    Object.assign(state.staged, s.staged)
    return { type: 'output', lines: [`✅ 已恢复 stash@{0} 的修改`, '提示：git stash list 查看剩余 stash 条目。'] }
  }
  if (sub === 'clear') {
    state.stash = []
    return { type: 'output', lines: ['✅ 已清空 stash 栈'] }
  }
  if (sub === 'push' || sub === undefined || sub === 'save') {
    // 检查是否有可保存的修改（已跟踪文件）
    const tree = headTree()
    const dirty = Object.keys(tree).some((p) => (state.workdir[p] ?? null) !== tree[p]) || Object.keys(state.staged).length > 0
    if (!dirty) {
      return { type: 'output', lines: ['No local changes to save', '提示：当前工作区干净，没有需要暂存的修改。'] }
    }
    state.stash.unshift({ msg: head.msg, branch: state.head, workdir: { ...state.workdir }, staged: { ...state.staged } })
    // 已跟踪文件恢复到 HEAD，untracked 文件保留
    const untracked = {}
    for (const p of Object.keys(state.workdir)) if (tree[p] === undefined) untracked[p] = state.workdir[p]
    state.workdir = { ...tree, ...untracked }
    state.staged = {}
    return { type: 'output', lines: [`✅ 已保存修改到 stash（stash@{0}）`, '提示：git stash list 查看；git stash pop 恢复修改。'] }
  }
  return { type: 'error', lines: ['用法: git stash | git stash list | git stash pop | git stash clear'] }
}

function gitReset(args) {
  const req = requireInit()
  if (req) return req
  if (!args.length) return { type: 'error', lines: ['用法: git reset [--soft|--mixed|--hard] <commit>', '示例: git reset --hard HEAD~1  （回到上一个提交并丢弃修改）'] }
  const hard = args.includes('--hard')
  const soft = args.includes('--soft')
  const mixed = args.includes('--mixed')
  const target = args.find((a) => !a.startsWith('-')) || 'HEAD'
  const hash = resolveRef(target)
  if (!hash) return { type: 'error', lines: [`fatal: ambiguous argument '${target}': unknown revision`] }
  const cur = headCommit()
  if (!cur) return { type: 'error', lines: ['fatal: Failed to resolve \'HEAD\' as a valid ref.'] }
  const old = cur.hash

  // 移动当前分支到目标
  if (!state.detached) state.branches[state.head] = hash
  else state.detachedAt = hash
  const targetTree = parentTreeOf(hash)

  if (hard) {
    state.workdir = { ...targetTree }
    state.staged = {}
  } else if (soft) {
    // 保留 staged/workdir
  } else {
    // mixed：取消暂存，保留工作区
    state.staged = {}
  }
  pushReflog(`reset: moving to ${hash.slice(0, 7)}`)
  return {
    type: 'output',
    lines: [
      `HEAD is now at ${hash.slice(0, 7)} ${state.commits[hash]?.msg || ''}`,
      hard ? '✅ 已硬重置：工作区、暂存区都恢复到目标提交。' : soft ? '✅ 已软重置：仅移动 HEAD，暂存区与工作区保留。' : '✅ 已混合重置：取消暂存，工作区保留。',
      '提示：git log --oneline 查看当前指向的提交。'
    ]
  }
}

function gitRevert(args) {
  const req = requireInit()
  if (req) return req
  const target = args[0]
  if (!target) return { type: 'error', lines: ['用法: git revert <commit>'] }
  const hash = resolveRef(target)
  if (!hash) return { type: 'error', lines: [`error: could not revert ${target}: unknown commit`] }
  const head = headCommit()
  if (!head) return { type: 'error', lines: ['fatal: Failed to resolve \'HEAD\' as a valid ref.'] }
  if (hash === head.hash) return { type: 'error', lines: ['error: cannot revert the current commit', '提示：选择一个更早的提交来撤销。'] }
  const targetCommit = state.commits[hash]
  const newTree = { ...head.files }
  // 简单反推：用目标的父树内容覆盖目标改动过的文件
  const parentTree = parentTreeOf(hash)
  for (const p of Object.keys(targetCommit.files)) {
    if (parentTree[p] === undefined) delete newTree[p]
    else newTree[p] = parentTree[p]
  }
  const c = newCommit(`Revert "${targetCommit.msg}"`, newTree)
  state.staged = {}
  return {
    type: 'output',
    lines: [
      `[${state.head} ${c.hash}] Revert "${targetCommit.msg}"`,
      `✅ 已生成一个反向提交，撤销了 ${hash.slice(0, 7)} 的改动。`,
      '提示：git log --oneline 查看新的 revert 提交。'
    ]
  }
}

function gitCherryPick(args) {
  const req = requireInit()
  if (req) return req
  const target = args[0]
  if (!target) return { type: 'error', lines: ['用法: git cherry-pick <commit>'] }
  const hash = resolveRef(target)
  if (!hash) return { type: 'error', lines: [`error: bad revision '${target}'`] }
  const tc = state.commits[hash]
  if (!tc) return { type: 'error', lines: [`error: bad revision '${target}'`] }
  const head = headCommit()
  if (!head) return { type: 'error', lines: ['fatal: Failed to resolve \'HEAD\' as a valid ref.'] }
  if (hash === head.hash) return { type: 'error', lines: [`error: cannot cherry-pick the current commit`] }
  // 应用目标提交的变更到当前树
  const parentTree = parentTreeOf(hash)
  const newTree = { ...head.files }
  for (const p of Object.keys(tc.files)) {
    if (parentTree[p] === undefined) delete newTree[p]
    else newTree[p] = tc.files[p]
  }
  const c = newCommit(tc.msg, newTree)
  state.staged = {}
  return {
    type: 'output',
    lines: [
      `[${state.head} ${c.hash}] ${tc.msg}`,
      `✅ 已将 ${hash.slice(0, 7)} 的改动“摘取”到当前分支，生成了新提交 ${c.hash}。`,
      '提示：git log --oneline 查看 cherry-pick 之后的提交历史。'
    ]
  }
}

function gitReflog() {
  const req = requireInit()
  if (req) return req
  const lines = []
  let i = 0
  const cur = state.detached ? state.detachedAt || '(none)' : state.branches[state.head] || '(none)'
  lines.push(`${cur} HEAD@{0}: ${state.reflog[0]?.msg || 'initial'} `)
  for (const r of state.reflog) {
    lines.push(`${r.from} HEAD@{${i + 1}}: ${r.msg} (${r.time})`)
    i++
  }
  return { type: 'output', lines }
}

function gitRm(args) {
  const req = requireInit()
  if (req) return req
  const file = args.find((a) => !a.startsWith('-'))
  if (!file) return { type: 'error', lines: ['用法: git rm <file>'] }
  const tree = headTree()
  if (tree[file] === undefined && state.workdir[file] === undefined) {
    return { type: 'error', lines: [`fatal: pathspec '${file}' did not match any files`] }
  }
  delete state.workdir[file]
  state.staged[file] = null
  return { type: 'output', lines: [`✅ 已删除 ${file}（已暂存删除操作）`, '提示：git commit -m "删除文件" 提交删除。'] }
}

function gitMv(args) {
  const req = requireInit()
  if (req) return req
  const [oldPath, newPath] = args
  if (!oldPath || !newPath) return { type: 'error', lines: ['用法: git mv <旧文件名> <新文件名>'] }
  const tree = headTree()
  if (tree[oldPath] === undefined && state.workdir[oldPath] === undefined) {
    return { type: 'error', lines: [`fatal: bad source, source=${oldPath}, destination=${newPath}`] }
  }
  if (state.workdir[oldPath] !== undefined) {
    state.workdir[newPath] = state.workdir[oldPath]
    delete state.workdir[oldPath]
  }
  state.staged[newPath] = tree[oldPath] ?? state.workdir[newPath]
  state.staged[oldPath] = null
  return { type: 'output', lines: [`✅ 已重命名 ${oldPath} -> ${newPath}（已暂存）`, '提示：git commit -m "重命名文件" 提交。'] }
}

function gitShow(args) {
  const req = requireInit()
  if (req) return req
  const target = args[0] || 'HEAD'
  const hash = resolveRef(target)
  if (!hash) return { type: 'error', lines: [`fatal: bad object ${target}`] }
  const c = state.commits[hash]
  const parent = parentTreeOf(hash)
  const changed = treeDiff(parent, c.files)
  return {
    type: 'output',
    lines: [
      `commit ${c.hash}`,
      `Author: ${c.author} <${c.email}>`,
      `Date:   ${c.date} +0800`,
      '',
      `    ${c.msg}`,
      '',
      changed.length ? `  ${changed.length} file(s) changed:` : '  (无文件变化)',
      ...changed.map((p) => `   ${p}`)
    ]
  }
}

function gitHelp() {
  return {
    type: 'output',
    lines: [
      '可用命令一览（Git 学习模拟环境支持）：',
      '',
      '  git init                       初始化仓库',
      '  git config --global user.name "名字" / user.email "邮箱"  配置身份',
      '  git status / git add <file> / git commit -m "说明"   基本提交流程',
      '  git log [--oneline] / git diff [--staged]   查看历史与差异',
      '  git branch / git checkout [-b] <分支> / git switch [-c] <分支>   分支管理',
      '  git merge <分支> / git tag <名称>   合并与标签',
      '  git remote add origin <url> / git push / git pull   远程仓库',
      '  git stash / git stash list / git stash pop   暂存修改',
      '  git reset [--hard] <commit> / git revert <commit>   撤销操作',
      '  git cherry-pick <commit> / git reflog   进阶技巧',
      '  git rm <file> / git mv <旧> <新> / git show <commit>   文件操作',
      '',
      '其他：clear（清屏）、help（本帮助）、↑↓ 历史、Tab 补全'
    ]
  }
}

export { VERSION }
