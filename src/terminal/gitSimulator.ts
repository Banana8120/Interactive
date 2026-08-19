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
    cherryPickState: null,
    worktrees: [],                       // 额外 worktree：[{ path, branch, hash }]
    bisectState: null                    // 二分定位状态（教学模拟）
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

/** 查找两个提交的最近共同祖先（merge base），用于真正的三方合并 */
function findMergeBase(hashA, hashB) {
  const ancestors = new Set()
  let h = hashA
  while (h) {
    ancestors.add(h)
    h = state.commits[h]?.parent || null
  }
  h = hashB
  while (h) {
    if (ancestors.has(h)) return h
    h = state.commits[h]?.parent || null
  }
  return null
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

/** 逐行对比两份文件内容，估算新增/删除行数（驱动 commit/push/merge 的动态统计输出） */
function countLineChanges(oldText, newText) {
  const oldLines = (oldText || '').split('\n').filter((l) => l !== '')
  const newLines = (newText || '').split('\n').filter((l) => l !== '')
  const oldSet = new Set(oldLines)
  const newSet = new Set(newLines)
  let insertions = 0
  let deletions = 0
  for (const l of newLines) if (!oldSet.has(l)) insertions++
  for (const l of oldLines) if (!newSet.has(l)) deletions++
  return { insertions, deletions }
}

/** 计算两份树之间的变更摘要：{ files, count, insertions, deletions } */
function changeTotals(oldTree, newTree) {
  const files = treeDiff(oldTree, newTree)
  let insertions = 0
  let deletions = 0
  for (const p of files) {
    const r = countLineChanges(oldTree[p], newTree[p])
    insertions += r.insertions
    deletions += r.deletions
  }
  return { files, count: files.length, insertions, deletions }
}

/** 生成类似真实 Git 的 diffstat 行：` file | N +-` + 汇总行 */
function diffStatLines(oldTree, newTree) {
  const { files, insertions, deletions } = changeTotals(oldTree, newTree)
  const lines = []
  for (const p of files) {
    const r = countLineChanges(oldTree[p], newTree[p])
    const n = r.insertions + r.deletions
    const bar = '+'.repeat(Math.min(r.insertions, 8)) + '-'.repeat(Math.min(r.deletions, 8))
    lines.push(` ${p.padEnd(20)} | ${String(n).padStart(3)} ${bar}`)
  }
  if (files.length) {
    lines.push(` ${files.length} file(s) changed, ${insertions} insertion(s)(+), ${deletions} deletion(s)(-)`)
  }
  return lines
}

/** 估算仓库对象数：文件 blob + 目录树 + 提交 */
function repoObjectCount(fileCount, commitCount = 1) {
  return Math.max(3, fileCount + 1 + commitCount)
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
  if (sub === 'fetch') return gitFetch(rest)
  if (sub === 'tag') return gitTag(rest)
  if (sub === 'stash') return gitStash(rest)
  if (sub === 'reset') return gitReset(rest)
  if (sub === 'restore') return gitRestore(rest)
  if (sub === 'revert') return gitRevert(rest)
  if (sub === 'cherry-pick') return gitCherryPick(rest)
  if (sub === 'rebase') return gitRebase(rest)
  if (sub === 'clean') return gitClean(rest)
  if (sub === 'reflog') return gitReflog(rest)
  if (sub === 'rm') return gitRm(rest)
  if (sub === 'mv') return gitMv(rest)
  if (sub === 'show') return gitShow(rest)
  if (sub === 'clone') return gitClone(rest)
  if (sub === 'grep') return gitGrep(rest)
  if (sub === 'blame') return gitBlame(rest)
  if (sub === 'shortlog') return gitShortlog(rest)
  if (sub === 'archive') return gitArchive(rest)
  if (sub === 'worktree') return gitWorktree(rest)
  if (sub === 'bisect') return gitBisect(rest)
  if (sub === 'gc') return gitGc(rest)
  if (sub === 'fsck') return gitFsck(rest)

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

const KNOWN_SUBS = ['init', 'config', 'status', 'add', 'commit', 'log', 'diff', 'branch', 'checkout', 'switch', 'merge', 'rebase', 'remote', 'fetch', 'push', 'pull', 'tag', 'stash', 'reset', 'restore', 'revert', 'cherry-pick', 'reflog', 'rm', 'mv', 'show', 'clean', 'clone', 'grep', 'blame', 'shortlog', 'archive', 'worktree', 'bisect', 'gc', 'fsck', 'help', 'version']

function suggestFix(sub) {
  for (const k of KNOWN_SUBS) {
    if (k.startsWith(sub) && sub.length >= 3) return k
  }
  const map = {
    comit: 'commit', cmmit: 'commit', commmit: 'commit', staus: 'status', statsu: 'status',
    ad: 'add', addd: 'add', brnach: 'branch', branh: 'branch', checkot: 'checkout',
    chckout: 'checkout', merget: 'merge', marge: 'merge', pulll: 'pull', puch: 'push',
    tagg: 'tag', logg: 'log', stah: 'stash', resset: 'reset', rest: 'reset', branc: 'branch',
    restor: 'restore', fetchh: 'fetch', rebbase: 'rebase', greep: 'grep', blam: 'blame',
    worktre: 'worktree', bisct: 'bisect', arvhive: 'archive', fsk: 'fsck'
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
  const hasIdentity = state.config.user.name && state.config.user.email
  const lines = [
    "hint: Using 'master' as the name for the initial branch. This default branch name",
    'hint: is subject to change. To configure the initial branch name to use in all',
    'hint: of your new repositories, which will suppress this warning, call:',
    '',
    'hint:   git config --global init.defaultBranch master',
    '',
    "Initialized empty Git repository in /home/learner/git-project/.git/"
  ]
  if (hasIdentity) {
    lines.push(
      '',
      `✅ 仓库已初始化！身份信息已配置 (${state.config.user.name} <${state.config.user.email}>)。`
    )
  } else {
    lines.push(
      '',
      '✅ 仓库已初始化！接下来配置你的身份信息：',
      '   git config --global user.name "你的名字"',
      '   git config --global user.email "你的邮箱"'
    )
  }
  return { type: 'output', lines }
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
  // 精确统计本次提交的变更（对比父提交树，而非整个仓库文件数）
  const parent = headCommit()?.hash || null
  const totals = changeTotals(parentTreeOf(parent), tree)
  const commit = newCommit(msg, tree)
  state.staged = {}
  return {
    type: 'output',
    lines: [
      `[${state.head} ${commit.hash}] ${msg}`,
      ` ${totals.count} file(s) changed, ${totals.insertions} insertion(s)(+), ${totals.deletions} deletion(s)(-)`,
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

function switchToBranch(name, create, startPoint) {
  const from = state.head
  if (create) {
    if (branchExists(name)) return { type: 'error', lines: [`fatal: A branch named '${name}' already exists.`] }
    const start = startPoint ? resolveRef(startPoint) : headCommit()?.hash || null
    if (startPoint && !start) return { type: 'error', lines: [`fatal: invalid reference: '${startPoint}'`] }
    const oldTree = headTree()
    const oldWorkdir = { ...state.workdir }
    const oldStaged = { ...state.staged }
    state.branches[name] = start
    state.head = name
    state.detached = false
    if (startPoint) {
      // 从指定起点创建：工作区同步为起点树（保留未跟踪文件），清空暂存区
      const keep = {}
      for (const p of Object.keys(oldWorkdir)) {
        if (!Object.prototype.hasOwnProperty.call(oldTree, p) && !Object.prototype.hasOwnProperty.call(oldStaged, p)) {
          keep[p] = oldWorkdir[p]
        }
      }
      state.workdir = { ...parentTreeOf(start), ...keep }
      state.staged = {}
    }
    pushReflog(`checkout: moving from ${from} to ${name}`)
    return { type: 'output', lines: [`✅ 已创建并切换到分支 ${name}`, '提示：可用 git branch 查看当前所有分支（* 表示当前分支）。'] }
  }
  if (!branchExists(name)) {
    return { type: 'error', lines: [`error: pathspec '${name}' did not match any file(s) known to git`, `提示：分支 ${name} 不存在。先 git branch ${name} 创建，或用 git checkout -b ${name} 创建并切换。`] }
  }
  // 有未提交的修改时阻止切换：未提交改动 = 工作区相对暂存区(index)的差异（真实 git 语义）
  const tree = headTree()
  const dirty = Object.keys(tree).some((p) => {
    const indexVal = Object.prototype.hasOwnProperty.call(state.staged, p) ? state.staged[p] : tree[p]
    return (state.workdir[p] ?? null) !== indexVal
  })
  if (dirty) {
    return { type: 'error', lines: ['error: Your local changes would be overwritten by checkout.', '提示：当前工作区有未提交的修改。先 git add + git commit，或 git stash 暂存，再切换分支。'] }
  }
  state.head = name
  state.detached = false
  // 切换后同步工作区到目标分支内容（保留未跟踪文件），并清空暂存区 —— 与真实 git 一致
  const oldTree = tree
  const targetTree = parentTreeOf(state.branches[name])
  const keep = {}
  for (const p of Object.keys(state.workdir)) {
    if (!Object.prototype.hasOwnProperty.call(oldTree, p) && !Object.prototype.hasOwnProperty.call(state.staged, p)) {
      keep[p] = state.workdir[p]
    }
  }
  state.workdir = { ...targetTree, ...keep }
  state.staged = {}
  pushReflog(`checkout: moving from ${from} to ${name}`)
  return { type: 'output', lines: [`✅ 已切换到分支 ${name}`, '提示：当前 HEAD 指向 ' + name + '，可用 git status 确认。'] }
}

function gitCheckout(args) {
  const req = requireInit()
  if (req) return req
  if (!args.length) return { type: 'error', lines: ['用法: git checkout <分支> | git checkout -b <新分支> [<起点>] | git checkout -- <file>'] }
  if (args[0] === '-b') {
    return switchToBranch(args[1], true, args[2])
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
  if (args[0] === '-c' || args[0] === '--create') return switchToBranch(args[1], true, args[2])
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

  // 目标分支是当前分支的祖先 → 已是最新，无需合并
  let isTargetAncestor = false
  let w = cur
  while (w) {
    if (w === target) { isTargetAncestor = true; break }
    w = state.commits[w]?.parent || null
  }
  if (isTargetAncestor) {
    return { type: 'output', lines: ['Already up to date.', `（${state.head} 已包含 ${name} 的全部提交）`] }
  }

  // 当前分支是目标分支的祖先 → fast-forward 快进
  let isCurAncestor = false
  w = target
  while (w) {
    if (w === cur) { isCurAncestor = true; break }
    w = state.commits[w]?.parent || null
  }
  if (isCurAncestor) {
    state.branches[state.head] = target
    pushReflog(`merge ${name}: Fast-forward`)
    const statLines = diffStatLines(curCommit.files, targetCommit.files)
    return {
      type: 'output',
      lines: [
        `Updating ${cur.slice(0, 7)}..${target.slice(0, 7)}`,
        'Fast-forward',
        ...statLines,
        `✅ 已快进合并：${state.head} 分支直接指向了 ${name} 的最新提交。`,
        '提示：git log --oneline 查看合并后的提交历史。'
      ]
    }
  }

  // 真正的三方合并：以 merge base 为基准，逐文件按 3 路规则判断
  const baseHash = findMergeBase(cur, target)
  const baseTree = baseHash ? parentTreeOf(baseHash) : {}
  const mergedFiles = {}
  const conflictFiles = []
  const paths = new Set([
    ...Object.keys(baseTree),
    ...Object.keys(curCommit.files),
    ...Object.keys(targetCommit.files)
  ])
  for (const p of paths) {
    const b = baseTree[p] ?? null   // 合并基点版本
    const o = curCommit.files[p] ?? null  // 当前分支版本（ours）
    const t = targetCommit.files[p] ?? null // 待合并分支版本（theirs）
    if (o === t) {
      // 两边一致：保留该内容（或都不存在 → 删除）
      if (o !== null) mergedFiles[p] = o
    } else if (o === b) {
      // 只有目标分支改了 → 采纳 theirs
      if (t !== null) mergedFiles[p] = t
    } else if (t === b) {
      // 只有当前分支改了 → 保留 ours
      if (o !== null) mergedFiles[p] = o
    } else {
      // 双方都改且改得不同（含 增/增 冲突、改/删 冲突）→ 冲突
      conflictFiles.push(p)
      if (o !== null) mergedFiles[p] = o
    }
  }

  if (conflictFiles.length) {
    const lines = []
    for (const p of conflictFiles) lines.push(`Auto-merging ${p}`)
    for (const p of conflictFiles) lines.push(`CONFLICT (content): Merge conflict in ${p}`)
    lines.push(
      'Automatic merge failed; fix conflicts and then commit the result.',
      '提示：真实 Git 中需要手动解决冲突。可先用 git status 查看冲突文件，',
      '或 git merge --abort 取消本次合并。'
    )
    return { type: 'error', lines }
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
  const statLines = diffStatLines(curCommit.files, mergedFiles)
  return {
    type: 'output',
    lines: [
      `Merge made by the 'ort' strategy.`,
      ...statLines,
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
  const remoteBefore = remote.branches[state.head] || null
  // 本次推送的对象数：远程缺失的提交数 + 这些提交改动的文件 blob + 目录树，动态计算
  const newCommits = []
  let h = localHash
  while (h && h !== remoteBefore) {
    newCommits.push(h)
    h = state.commits[h]?.parent || null
  }
  const changedFiles = new Set()
  for (const hc of newCommits) {
    const c = state.commits[hc]
    for (const p of treeDiff(parentTreeOf(c.parent), c.files)) changedFiles.add(p)
  }
  const objectCount = repoObjectCount(changedFiles.size, newCommits.length)
  remote.branches[state.head] = localHash
  const from = remoteBefore ? remoteBefore.slice(0, 7) : '0000000'
  return {
    type: 'output',
    lines: [
      `Enumerating objects: ${objectCount}, done.`,
      `Counting objects: 100% (${objectCount}/${objectCount}), done.`,
      `Writing objects: 100% (${objectCount}/${objectCount}), done.`,
      `To ${remote.url}`,
      `   ${from}..${localHash.slice(0, 7)}  ${state.head} -> ${state.head}`,
      `✅ 已推送！本地 ${state.head} 分支已同步到远程 ${remoteName}（${newCommits.length} 个提交）。`
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

/**
 * git fetch：从远程下载引用（只更新远程跟踪分支，不动工作区/本地分支）
 *   输出由 remote.url 与 remote.branches 数据驱动
 */
function gitFetch(args) {
  const req = requireInit()
  if (req) return req
  const remoteName = args.find((a) => !a.startsWith('-')) || 'origin'
  const remote = state.remotes[remoteName]
  if (!remote) {
    return {
      type: 'error',
      lines: [
        `fatal: '${remoteName}' does not appear to be a git repository`,
        `fatal: Could not read from remote repository.`,
        '提示：先 git remote add origin <url> 配置远程仓库。'
      ]
    }
  }
  const refs = Object.entries(remote.branches)
  const lines = [`From ${remote.url}`]
  let updated = 0
  for (const [br, hash] of refs) {
    const local = state.branches[br]
    const isNew = !local
    if (isNew) {
      lines.push(` * [new branch]      ${br} -> origin/${br}`)
      updated++
    } else if (local !== hash && state.commits[hash]) {
      lines.push(`   ${local.slice(0, 7)}..${hash.slice(0, 7)}  ${br} -> origin/${br}`)
      updated++
    } else {
      lines.push(`   ${br} -> origin/${br}`)
    }
  }
  lines.push('')
  if (updated) {
    lines.push(`✅ 已从 ${remoteName} 获取 ${updated} 个分支更新（仅更新远程跟踪分支，工作区与本地分支未改动）。`)
    lines.push('提示：git merge origin/<分支> 或 git pull 可将远程更新合并到本地。')
  } else {
    lines.push('Already up to date.')
    lines.push('提示：git fetch 只下载引用，不合并；配合 git merge origin/<分支> 使用。')
  }
  return { type: 'output', lines }
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
  // 克隆对象数 = 文件 blob + 目录树 + 提交，随仓库内容动态计算
  const objectCount = repoObjectCount(Object.keys(INITIAL_FILES).length, 1)
  return {
    type: 'output',
    lines: [
      `Cloning into 'git-project'...`,
      `remote: Enumerating objects: ${objectCount}, done.`,
      `remote: Counting objects: 100% (${objectCount}/${objectCount}), done.`,
      `Receiving objects: 100% (${objectCount}/${objectCount}), done.`,
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

// 索引（index）中某路径的内容：staged 有记录则取其值，否则与 HEAD 一致
function indexContentOf(p, headTreeCache) {
  if (Object.prototype.hasOwnProperty.call(state.staged, p)) return state.staged[p]
  return headTreeCache[p] !== undefined ? headTreeCache[p] : undefined
}

/**
 * git restore：从暂存区/HEAD/指定提交恢复工作区或暂存区（数据驱动）
 *   git restore <file>                丢弃工作区改动，恢复为暂存区（index）版本
 *   git restore --staged <file>       取消暂存（unstage），恢复为 HEAD 版本
 *   git restore --source=<ref> <file> 从指定提交恢复
 *   git restore . / git restore --staged .   批量恢复
 */
function gitRestore(args) {
  const req = requireInit()
  if (req) return req
  const stagedOnly = args.includes('--staged') || args.includes('-S')
  const srcFlag = args.some((a) => a.startsWith('--source=') || /^-s\S+/.test(a))
  const sourceRef = (() => {
    const eq = args.find((a) => a.startsWith('--source='))
    if (eq) return eq.slice('--source='.length) || 'HEAD'
    const s = args.find((a) => /^-s\S+/.test(a))
    return s ? s.slice(2) : 'HEAD'
  })()
  const rawPaths = args.filter((a) => !a.startsWith('-'))
  const dot = rawPaths.includes('.')
  const tree = headTree()
  const known = dot
    ? [...new Set([...Object.keys(tree), ...Object.keys(state.staged)])]
    : rawPaths.filter((p) => p !== '.')

  if (!known.length) {
    return {
      type: 'error',
      lines: [
        '用法: git restore [--staged] [--source=<提交>] <file>...',
        '示例:',
        '  git restore app.js              # 丢弃工作区修改，恢复为暂存区版本',
        '  git restore --staged app.js     # 取消暂存（unstage），保留工作区改动',
        '  git restore --source=HEAD~1 app.js   # 从上一个提交恢复该文件',
        '  git restore . / git restore --staged .   # 批量恢复全部'
      ]
    }
  }

  // 解析 source 树
  let srcTree
  if (sourceRef === 'HEAD') {
    srcTree = tree
  } else {
    const hash = resolveRef(sourceRef)
    if (!hash) return { type: 'error', lines: [`fatal: invalid reference: ${sourceRef}`] }
    srcTree = parentTreeOf(hash)
  }

  // pathspec 校验：未被 git 认识的路径整体报错（真实 git 行为：不执行任何恢复）
  const missing = known.filter((p) => {
    const inIndex = indexContentOf(p, tree) !== undefined
    const inHead = Object.prototype.hasOwnProperty.call(tree, p)
    const inStaged = Object.prototype.hasOwnProperty.call(state.staged, p)
    return !inIndex && !inHead && !inStaged
  })
  if (missing.length) {
    return { type: 'error', lines: [`fatal: pathspec '${missing[0]}' did not match any file(s) known to git`, '提示：git restore 只能恢复已被跟踪（提交过或已暂存）的文件。'] }
  }

  const restored = []
  const untouched = []
  for (const p of known) {
    const srcVal = srcTree[p]          // source 中该路径的内容（undefined = source 中不存在）
    const indexVal = indexContentOf(p, tree)  // 当前 index 内容
    let changed = false
    if (stagedOnly) {
      // 恢复暂存区：staged[p] = source 内容
      const cur = Object.prototype.hasOwnProperty.call(state.staged, p) ? state.staged[p] : undefined
      if (srcVal === undefined) {
        if (cur !== undefined) { delete state.staged[p]; changed = true }
      } else if (cur !== srcVal) {
        state.staged[p] = srcVal
        changed = true
      }
    } else {
      // 恢复工作区：workdir[p] = index 内容（默认）或 source 内容
      const target = srcFlag ? srcVal : indexVal
      const cur = Object.prototype.hasOwnProperty.call(state.workdir, p) ? state.workdir[p] : undefined
      if (target === undefined) {
        if (cur !== undefined) { delete state.workdir[p]; changed = true }
      } else if (cur !== target) {
        state.workdir[p] = target
        changed = true
      }
    }
    if (changed) restored.push(p)
    else untouched.push(p)
  }

  const lines = []
  for (const p of restored) lines.push(`restored '${p}'`)
  if (restored.length) {
    lines.push(
      stagedOnly
        ? `✅ 已取消暂存 ${restored.length} 个文件（工作区改动保留）。git status 可确认。`
        : `✅ 已恢复 ${restored.length} 个文件。git status 可确认工作区已干净。`
    )
  }
  if (untouched.length) {
    lines.push(`提示：${untouched.map((p) => `'${p}'`).join('、')} 与要恢复的版本一致，无需恢复。`)
  }
  return { type: 'output', lines }
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
  // 反推：用目标提交的父树内容覆盖目标改动过的文件（撤销该提交的改动）
  const parentTree = targetCommit.parent ? parentTreeOf(targetCommit.parent) : {}
  const changed = treeDiff(parentTree, targetCommit.files)
  for (const p of changed) {
    if (parentTree[p] === undefined) delete newTree[p]
    else newTree[p] = parentTree[p]
  }
  const c = newCommit(`Revert "${targetCommit.msg}"`, newTree)
  state.staged = {}
  state.workdir = { ...newTree } // revert 后工作区同步为新树（真实 git 行为）
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
  // 应用目标提交的变更集到当前树（基于目标提交相对其父树的差异）
  const parentTree = tc.parent ? parentTreeOf(tc.parent) : {}
  const newTree = { ...head.files }
  const changed = treeDiff(parentTree, tc.files)
  for (const p of changed) {
    if (tc.files[p] === undefined) delete newTree[p]
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

/**
 * git rebase：把当前分支独有提交重放到目标分支之上（数据驱动的简化三方变基）
 *   冲突判定：重放时若目标分支已改动同一路径（与共同祖先不同）→ 冲突中止
 */
function gitRebase(args) {
  const req = requireInit()
  if (req) return req
  const target = args.find((a) => !a.startsWith('-'))
  if (!target) {
    return { type: 'error', lines: ['用法: git rebase <分支>', '示例: git rebase master  （把当前分支的提交重放到 master 之上，历史变线性）'] }
  }
  const targetHash = resolveRef(target)
  if (!targetHash) return { type: 'error', lines: [`fatal: invalid upstream '${target}'`] }
  const cur = headCommit()
  if (!cur) return { type: 'error', lines: ['fatal: Failed to resolve \'HEAD\' as a valid ref.'] }
  if (cur.hash === targetHash) return { type: 'output', lines: [`Current branch ${state.head} is up to date.`] }

  const base = findMergeBase(cur.hash, targetHash)
  if (!base) return { type: 'error', lines: ['fatal: no common ancestor', '提示：变基需要两个分支有共同祖先提交。'] }

  // 收集当前分支独有提交（从旧到新，不含 base）
  const own = []
  let h = cur.hash
  while (h && h !== base) {
    own.push(h)
    h = state.commits[h]?.parent || null
  }
  own.reverse()
  if (!own.length) return { type: 'output', lines: [`Current branch ${state.head} is up to date.`] }

  // 逐提交重放：目标树 + 变更集，冲突检测以 merge-base 为基准（三方语义）
  const baseTree = parentTreeOf(base)
  const newTree = { ...parentTreeOf(targetHash) }
  const savedHead = state.branches[state.head]
  // 临时把分支起点移到 target，使 newCommit 的 parent 链按重放顺序衔接
  state.branches[state.head] = targetHash
  let replayed = 0
  for (const oh of own) {
    const oc = state.commits[oh]
    // 注意：parentTreeOf(hash) 返回的是 hash 提交自身的树；父树需显式取 commits[parent]
    const op = oc.parent ? parentTreeOf(oc.parent) : {}
    const changedPaths = treeDiff(op, oc.files)
    for (const p of changedPaths) {
      if (newTree[p] !== baseTree[p]) {
        state.branches[state.head] = savedHead // 冲突中止：恢复分支原指向
        return {
          type: 'error',
          lines: [
            `CONFLICT (content): Merge conflict in ${p} during rebase`,
            `提示：变基到 ${target} 时，${p} 在两边都被修改。`,
            '真实 Git 中需解决冲突后 git rebase --continue；本模拟环境建议',
            '先 git log --oneline 观察差异，或用 git rebase --abort 取消变基。'
          ]
        }
      }
    }
    for (const p of changedPaths) {
      if (oc.files[p] === undefined) delete newTree[p]
      else newTree[p] = oc.files[p]
    }
    newCommit(oc.msg, { ...newTree }) // parent 自动衔接上一个重放提交
    replayed++
  }

  // 同步工作区与暂存区
  state.workdir = { ...newTree }
  state.staged = {}
  pushReflog(`rebase ${target}: Successfully rebased and updated refs/heads/${state.head}.`)
  return {
    type: 'output',
    lines: [
      `Successfully rebased and updated refs/heads/${state.head}.`,
      `✅ 变基完成：${replayed} 个提交已重放到 ${target} 之上，历史变为线性。`,
      '提示：git log --oneline 查看线性提交历史。'
    ]
  }
}

/**
 * git clean：清理未跟踪文件（数据驱动）
 *   git clean -n   预览将要删除的文件
 *   git clean -f   强制删除未跟踪文件（-fd / -ffd / -fx 同理）
 */
function gitClean(args) {
  const req = requireInit()
  if (req) return req
  const dry = args.includes('-n')
  const force = args.some((a) => /^-f/.test(a))
  if (!dry && !force) {
    return {
      type: 'error',
      lines: [
        'fatal: clean.requireForce is true and -f was not given: refusing to clean',
        '提示：先用 git clean -n 预览，再执行 git clean -f 删除未跟踪文件。'
      ]
    }
  }
  const tree = headTree()
  const untracked = Object.keys(state.workdir).filter(
    (p) => !Object.prototype.hasOwnProperty.call(tree, p) && !Object.prototype.hasOwnProperty.call(state.staged, p)
  )
  if (!untracked.length) return { type: 'output', lines: ['Nothing to clean.'] }
  const lines = untracked.map((p) => (dry ? `Would remove ${p}` : `Removing ${p}`))
  if (!dry) {
    for (const p of untracked) delete state.workdir[p]
    lines.push(`✅ 已清理 ${untracked.length} 个未跟踪文件。`)
  } else {
    lines.push(`提示：共 ${untracked.length} 个未跟踪文件，确认后执行 git clean -f 删除。`)
  }
  return { type: 'output', lines }
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

function gitGrep(args) {
  const req = requireInit()
  if (req) return req
  const numbered = args.includes('-n') || args.includes('--line-number')
  const fixed = args.includes('-F') || args.includes('--fixed-strings')
  const pattern = args.find((a) => !a.startsWith('-'))
  if (!pattern) return { type: 'error', lines: ['用法: git grep [-n] <pattern>', '示例: git grep -n hello'] }
  const needle = pattern.replace(/^["']|["']$/g, '')
  const lines = []
  const matcher = fixed
    ? (text) => text.includes(needle)
    : (text) => {
        try { return new RegExp(needle, 'i').test(text) } catch (e) { return text.toLowerCase().includes(needle.toLowerCase()) }
      }
  for (const [file, content] of Object.entries(state.workdir)) {
    String(content || '').split('\n').forEach((line, i) => {
      if (matcher(line)) lines.push(numbered ? `${file}:${i + 1}:${line}` : `${file}:${line}`)
    })
  }
  return { type: 'output', lines: lines.length ? lines : [`（没有找到匹配：${needle}）`] }
}

function gitBlame(args) {
  const req = requireInit()
  if (req) return req
  const file = args.filter((a) => !a.startsWith('-')).pop()
  if (!file) return { type: 'error', lines: ['用法: git blame <file>'] }
  const content = state.workdir[file] ?? headTree()[file]
  if (content === undefined) return { type: 'error', lines: [`fatal: no such path '${file}' in HEAD`] }
  const head = headCommit()
  const hash = head?.hash || '0000000'
  const author = head?.author || state.config.user.name || 'learner'
  const date = head?.date || nowText()
  const lines = String(content).replace(/\n$/, '').split('\n')
  return {
    type: 'output',
    lines: lines.map((line, i) => `${hash.slice(0, 7)} (${author.padEnd(10, ' ')} ${date} ${String(i + 1).padStart(3, ' ')}) ${line}`)
  }
}

function gitShortlog(args) {
  const req = requireInit()
  if (req) return req
  const summary = args.includes('-s') || args.includes('--summary')
  const numbered = args.includes('-n') || args.includes('--numbered')
  const groups = {}
  for (const c of Object.values(state.commits)) {
    const key = c.author || 'learner'
    if (!groups[key]) groups[key] = []
    groups[key].push(c)
  }
  let authors = Object.entries(groups)
  if (numbered) authors = authors.sort((a, b) => b[1].length - a[1].length)
  const lines = []
  for (const [author, commits] of authors) {
    if (summary) {
      lines.push(`${String(commits.length).padStart(6, ' ')}\t${author}`)
    } else {
      lines.push(`${author} (${commits.length}):`)
      for (const c of commits) lines.push(`      ${c.msg}`)
      lines.push('')
    }
  }
  return { type: 'output', lines: lines.length ? lines : ['（暂无提交）'] }
}

function gitArchive(args) {
  const req = requireInit()
  if (req) return req
  const outputIdx = args.findIndex((a) => a === '-o' || a === '--output')
  const output = outputIdx !== -1 ? args[outputIdx + 1] : (args.find((a) => a.startsWith('--output=')) || '').replace(/^--output=/, '')
  const ref = args.find((a, i) => !a.startsWith('-') && i !== outputIdx + 1) || 'HEAD'
  const hash = resolveRef(ref)
  if (!hash) return { type: 'error', lines: [`fatal: not a valid object name: ${ref}`] }
  const tree = parentTreeOf(hash)
  const fileCount = Object.keys(tree).length
  return {
    type: 'output',
    lines: [
      output
        ? `已创建归档 ${output}（模拟）：${fileCount} 个文件来自 ${hash.slice(0, 7)}`
        : `（模拟 tar 输出）${fileCount} 个文件来自 ${hash.slice(0, 7)}`,
      '提示：真实 Git 中 git archive 常用于导出某个提交的源码快照，不包含 .git 历史。'
    ]
  }
}

function gitWorktree(args) {
  const req = requireInit()
  if (req) return req
  if (!state.worktrees) state.worktrees = []
  const sub = args[0] || 'list'
  if (sub === 'list') {
    const head = headCommit()?.hash || '(no commits)'
    const lines = [`/home/learner/git-project  ${String(head).slice(0, 7)} [${state.head}]`]
    for (const wt of state.worktrees) {
      lines.push(`${wt.path}  ${String(wt.hash || '(no commits)').slice(0, 7)} [${wt.branch}]`)
    }
    return { type: 'output', lines }
  }
  if (sub === 'add') {
    const create = args[1] === '-b'
    const path = create ? args[3] : args[1]
    const branch = create ? args[2] : args[2]
    if (!path) return { type: 'error', lines: ['用法: git worktree add [-b <new-branch>] <path> [<branch>]'] }
    const branchName = branch || path.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9_.-]/g, '-') || `worktree-${state.worktrees.length + 1}`
    if (create) {
      if (branchExists(branchName)) return { type: 'error', lines: [`fatal: a branch named '${branchName}' already exists`] }
      state.branches[branchName] = headCommit()?.hash || null
    } else if (!branchExists(branchName)) {
      state.branches[branchName] = headCommit()?.hash || null
    }
    if (state.worktrees.some((w) => w.path === path)) return { type: 'error', lines: [`fatal: '${path}' is already a working tree`] }
    state.worktrees.push({ path, branch: branchName, hash: state.branches[branchName] })
    return { type: 'output', lines: [`Preparing worktree (checking out '${branchName}')`, `HEAD is now at ${(state.branches[branchName] || '0000000').slice(0, 7)} ${headCommit()?.msg || ''}`] }
  }
  if (sub === 'remove') {
    const path = args[1]
    if (!path) return { type: 'error', lines: ['用法: git worktree remove <path>'] }
    const idx = state.worktrees.findIndex((w) => w.path === path)
    if (idx === -1) return { type: 'error', lines: [`fatal: '${path}' is not a working tree`] }
    state.worktrees.splice(idx, 1)
    return { type: 'output', lines: [`已移除 worktree: ${path}`] }
  }
  if (sub === 'prune') {
    return { type: 'output', lines: ['（没有需要清理的失效 worktree 记录）'] }
  }
  return { type: 'error', lines: ['用法: git worktree list | add [-b <branch>] <path> [<branch>] | remove <path> | prune'] }
}

function commitChainFrom(hash) {
  const chain = []
  let cur = hash
  while (cur) {
    chain.unshift(cur)
    cur = state.commits[cur]?.parent || null
  }
  return chain
}

function bisectCandidate(bisect) {
  const bad = bisect.bad || headCommit()?.hash
  const chain = commitChainFrom(bad)
  if (!chain.length) return null
  const goodIdx = bisect.good ? chain.indexOf(bisect.good) : -1
  const badIdx = bisect.bad ? chain.indexOf(bisect.bad) : chain.length - 1
  const lo = goodIdx + 1
  const hi = badIdx === -1 ? chain.length - 1 : badIdx
  if (hi < lo) return null
  return chain[Math.floor((lo + hi) / 2)]
}

function gitBisect(args) {
  const req = requireInit()
  if (req) return req
  const sub = args[0]
  if (!sub || sub === 'help') return { type: 'output', lines: ['用法: git bisect start | good [ref] | bad [ref] | reset | log'] }
  if (sub === 'start') {
    const head = headCommit()
    if (!head) return { type: 'error', lines: ['fatal: bad HEAD - I need a HEAD'] }
    state.bisectState = { active: true, good: null, bad: head.hash, current: head.hash, log: ['git bisect start'] }
    return { type: 'output', lines: ['status: waiting for both good and bad commits', `提示：当前 HEAD 默认作为 bad，可运行 git bisect good <较早提交>。`] }
  }
  if (sub === 'reset') {
    state.bisectState = null
    return { type: 'output', lines: ['Previous HEAD position was restored. Bisect reset.'] }
  }
  if (sub === 'log') {
    return { type: 'output', lines: state.bisectState?.log?.length ? state.bisectState.log : ['（尚未开始 bisect）'] }
  }
  if (sub === 'good' || sub === 'bad') {
    if (!state.bisectState) state.bisectState = { active: true, good: null, bad: null, current: null, log: ['git bisect start'] }
    const ref = args[1] || state.bisectState.current || 'HEAD'
    const hash = resolveRef(ref)
    if (!hash) return { type: 'error', lines: [`fatal: Needed a single revision: ${ref}`] }
    state.bisectState[sub] = hash
    state.bisectState.log.push(`git bisect ${sub} ${hash.slice(0, 7)}`)
    const candidate = bisectCandidate(state.bisectState)
    state.bisectState.current = candidate
    if (!candidate || candidate === state.bisectState.good || candidate === state.bisectState.bad) {
      return { type: 'output', lines: [`${(state.bisectState.bad || hash).slice(0, 7)} is the first bad commit（模拟结果）`] }
    }
    return { type: 'output', lines: [`Bisecting: next commit to test is ${candidate.slice(0, 7)}`, '提示：在真实项目中运行测试，然后标记 git bisect good 或 git bisect bad。'] }
  }
  return { type: 'error', lines: ['用法: git bisect start | good [ref] | bad [ref] | reset | log'] }
}

function gitGc() {
  const req = requireInit()
  if (req) return req
  const objects = repoObjectCount(Object.keys(headTree()).length, Object.keys(state.commits).length)
  return { type: 'output', lines: [
    'Enumerating objects: ' + objects + ', done.',
    'Counting objects: 100% (' + objects + '/' + objects + '), done.',
    'Delta compression using up to 8 threads',
    'Compressing objects: 100% (' + Math.max(1, objects - 2) + '/' + Math.max(1, objects - 2) + '), done.',
    'Writing objects: 100% (' + objects + '/' + objects + '), done.',
    '✅ 垃圾回收完成（模拟）：仓库对象已打包优化。'
  ], delay: 400 }
}

function gitFsck() {
  const req = requireInit()
  if (req) return req
  const missingParents = Object.values(state.commits).filter((c) => c.parent && !state.commits[c.parent])
  if (missingParents.length) {
    return { type: 'error', lines: missingParents.map((c) => `broken link from commit ${c.hash} to parent ${c.parent}`) }
  }
  return { type: 'output', lines: ['Checking object directories: 100% (256/256), done.', 'Checking objects: 100% (' + Object.keys(state.commits).length + '/' + Object.keys(state.commits).length + '), done.', '✅ fsck 未发现仓库对象损坏。'] }
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
      '  git merge <分支> / git rebase <分支> / git tag <名称>   合并、变基与标签',
      '  git remote add origin <url> / git fetch / git push / git pull   远程仓库',
      '  git stash / git stash list / git stash pop   暂存修改',
      '  git reset [--hard] <commit> / git restore [--staged] <file> / git revert <commit>   撤销与恢复',
      '  git clean [-n|-f]   清理未跟踪文件',
      '  git grep [-n] <pattern> / git blame <file>   搜索与追踪代码来源',
      '  git shortlog [-s -n] / git archive -o <file> <ref>   历史摘要与源码归档',
      '  git worktree list/add/remove   多工作区管理',
      '  git bisect start/good/bad/reset/log   二分定位问题提交',
      '  git gc / git fsck   仓库维护与对象检查',
      '  git cherry-pick <commit> / git reflog   进阶技巧',
      '  git rm <file> / git mv <旧> <新> / git show <commit>   文件操作',
      '',
      '其他：clear（清屏）、help（本帮助）、↑↓ 历史、Tab 补全'
    ]
  }
}

export { VERSION }
