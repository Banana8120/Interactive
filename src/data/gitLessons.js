/**
 * Git 课程数据：参考 Gitee Git 大全（gitee.com/all-about-git）知识点体系
 * 章节划分：入门与配置 / 第一次提交 / 暂存区 / 撤销回退 / 分支 / 远程 / 标签 / 进阶
 *
 * 内容块类型与 Docker 课程一致：
 *  - text / code / tip / warning / table / list
 * 额外字段：
 *  - practice  交互练习 { title, desc, check(env), successMsg, hints[], commands[] }
 */

import { getGitState } from '@/terminal/gitSimulator'

/** 便捷检查：当前是否在指定分支 */
const onBranch = (name) => getGitState().head === name
/** 便捷检查：分支是否存在 */
const hasBranch = (name) => Object.prototype.hasOwnProperty.call(getGitState().branches, name)
/** 便捷检查：提交数 */
const commitCount = () => Object.keys(getGitState().commits).length
/** 便捷检查：某分支的提交数（从 master 回溯统计） */
const branchCommitCount = (name) => {
  const s = getGitState()
  if (!s.branches[name]) return 0
  let count = 0
  let h = s.branches[name]
  while (h) { count++; h = s.commits[h]?.parent || null }
  return count
}
/** 便捷检查：本地与远程分支哈希是否一致（已推送） */
const pushed = (branch = 'master') => {
  const s = getGitState()
  return !!(s.remotes.origin && s.remotes.origin.branches[branch] === s.branches[branch])
}
/** 便捷检查：是否存在标签 */
const hasTag = (name) => Object.prototype.hasOwnProperty.call(getGitState().tags, name)

export const gitChapters = [
  {
    id: 'git-intro',
    index: '01',
    title: 'Git 入门与配置',
    icon: 'Setting',
    color: '#F05032',
    minutes: 8,
    description: '认识 Git 与版本控制，完成环境初始化与身份配置。',
    lessons: [
      {
        id: 'git-intro-1',
        title: '什么是 Git 与版本控制',
        concept: '版本控制基础',
        content: [
          { type: 'text', html: '写代码时你一定经历过这种场景：文件被改坏了想回到昨天的版本、想对比两个版本的差异、几个人同时改一个文件互相覆盖……<b>版本控制（Version Control）</b>就是解决这些问题的工具：它记录每一次修改，让你随时回到任意历史版本。' },
          { type: 'table', headers: ['对比项', '本地版本控制', '集中式（SVN）', '分布式（Git）'], rows: [
            ['历史存储', '本机单份', '服务器单份', '每台机器都有完整历史'],
            ['离线工作', '支持', '不支持', '支持'],
            ['多人协作', '不支持', '支持', '支持且更灵活'],
            ['典型代表', 'RCS', 'SVN、CVS', 'Git、Mercurial']
          ] },
          { type: 'tip', title: 'Git 的三大特点', text: '① <b>快</b>：所有操作都在本地完成；② <b>完整</b>：每个克隆都是完整备份；③ <b>灵活</b>：支持多种协作模型（集中式、功能分支、Fork）。' },
          { type: 'list', items: [
            'Git 是目前最流行的版本控制系统，由 Linus Torvalds 于 2005 年为管理 Linux 内核而开发',
            'Gitee（码云）、GitHub、GitLab 都是基于 Git 的代码托管平台',
            '学习路径：先掌握本地操作（提交/分支），再学习远程协作（推送/拉取）'
          ] }
        ],
        practice: {
          title: '任务：认识 Git 环境',
          desc: '在右侧终端输入 git --version 查看模拟环境中的 Git 版本，再输入 git --help 或 help 查看可用命令。',
          commands: ['git --version', 'help'],
          check: () => true,
          successMsg: '你已经认识 Git 环境了，继续学习下一节吧！',
          hints: [
            '试试输入：git --version',
            '再试试：help 查看命令列表'
          ]
        }
      },
      {
        id: 'git-intro-2',
        title: '初始化仓库与配置身份',
        concept: '环境准备',
        content: [
          { type: 'text', html: '使用 Git 的第一步是<b>初始化仓库</b>和<b>配置身份信息</b>。身份信息会记录在你每次提交（commit）上，告诉别人“这次修改是谁做的”。' },
          { type: 'code', lang: 'bash', code: '# 在当前目录初始化仓库\ngit init\n\n# 配置全局身份（只需做一次）\ngit config --global user.name "你的名字"\ngit config --global user.email "you@example.com"\n\n# 查看当前配置\ngit config --list' },
          { type: 'warning', title: '身份信息很重要', text: '如果没配置 user.name 和 user.email，Git 会拒绝提交并提示 "Please tell me who you are"。' },
          { type: 'tip', title: '--global 的含义', text: '<code>--global</code> 表示全局生效（对所有仓库有效）。如果不加，则只对当前仓库生效。' }
        ],
        practice: {
          title: '任务：初始化仓库并配置身份',
          desc: '依次完成：① git init 初始化仓库；② 配置 user.name 为 "learner"；③ 配置 user.email 为 learner@example.com；④ 用 git config --list 确认。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git config --list'],
          check: () => {
            const s = getGitState()
            return s.initialized && s.config.user.name === 'learner' && s.config.user.email === 'learner@example.com'
          },
          successMsg: '仓库已初始化、身份已配置，可以开始第一次提交了！',
          hints: [
            '第一步：git init',
            '第二步：git config --global user.name "learner"',
            '第三步：git config --global user.email learner@example.com，最后用 git config --list 验证'
          ]
        }
      }
    ]
  },
  {
    id: 'git-basics',
    index: '02',
    title: '第一次提交',
    icon: 'Document',
    color: '#00B96B',
    minutes: 10,
    description: '掌握 add / commit / status / log，完成第一个提交。',
    lessons: [
      {
        id: 'git-basics-1',
        title: '工作区、暂存区与版本库',
        concept: '三个区域',
        content: [
          { type: 'text', html: 'Git 的本地仓库分为三个区域，理解它们是理解一切 Git 操作的基础：<b>工作区（Working Directory）</b>是你编辑文件的地方；<b>暂存区（Index/Staging Area）</b>是提交前的“候车区”；<b>版本库（Repository）</b>存放所有提交的历史快照。' },
          { type: 'code', lang: 'bash', code: '工作区  --git add-->  暂存区  --git commit-->  版本库\n   ▲                                        |\n   └------------ git checkout -- <file> ---------┘' },
          { type: 'list', items: [
            '<b>工作区</b>：你看到的文件，修改后状态为 modified / untracked',
            '<b>暂存区</b>：git add 后文件进入暂存区，状态为 staged（Changes to be committed）',
            '<b>版本库</b>：git commit 后生成不可变的历史快照（提交 commit）'
          ] },
          { type: 'tip', title: '为什么需要暂存区？', text: '暂存区让你可以<b>分批次提交</b>：同时改了几个文件，可以只 add 其中一部分，提交成多个逻辑独立的提交，历史更清晰。' }
        ],
        practice: {
          title: '任务：观察初始状态',
          desc: '初始化仓库后，输入 git status 观察：当前工作区有哪些文件？它们处于什么状态？',
          commands: ['git init', 'git status'],
          check: () => getGitState().initialized,
          successMsg: '你已经会观察工作区状态了！',
          hints: [
            '先执行 git init 初始化仓库',
            '再输入 git status，看 Untracked files 部分'
          ]
        }
      },
      {
        id: 'git-basics-2',
        title: '完成第一次提交',
        concept: '提交流程',
        content: [
          { type: 'text', html: '一次完整的提交分三步：<b>git add</b>（加入暂存区）→ <b>git commit -m "说明"</b>（提交到版本库）→ <b>git status</b>（确认工作区干净）。' },
          { type: 'code', lang: 'bash', code: 'git add README.md          # 添加单个文件\ngit add .                  # 添加所有文件\ngit commit -m "feat: 初始化项目"   # 提交并写说明\ngit status                 # 确认状态\ngit log --oneline          # 查看提交历史' },
          { type: 'warning', title: '提交信息要规范', text: '提交信息建议说明“做了什么”，常见前缀：feat（新功能）、fix（修复）、docs（文档）、refactor（重构）。' },
          { type: 'table', headers: ['命令', '作用', '常用选项'], rows: [
            ['git add <file>', '加入暂存区', '. 表示全部'],
            ['git commit -m "msg"', '创建提交', '-m 后跟说明'],
            ['git status', '查看状态', '-s 简洁模式'],
            ['git log', '查看历史', '--oneline 单行显示']
          ] }
        ],
        practice: {
          title: '任务：创建第一个提交',
          desc: '① git init 初始化；② 配置身份（若未配置）；③ git add . 添加所有文件；④ git commit -m "feat: 初始化项目" 提交；⑤ git log --oneline 查看历史。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "feat: 初始化项目"', 'git log --oneline'],
          check: () => commitCount() >= 1,
          successMsg: '🎉 第一个提交完成！你已掌握 Git 最核心的提交流程。',
          hints: [
            '先 git init，再 git config --global user.name "learner" 和 git config --global user.email learner@example.com',
            'git add . 把所有文件加入暂存区',
            'git commit -m "feat: 初始化项目"，最后 git log --oneline 查看提交记录'
          ]
        }
      }
    ]
  },
  {
    id: 'git-stage',
    index: '03',
    title: '暂存区深入理解',
    icon: 'Files',
    color: '#7B61FF',
    minutes: 10,
    description: '文件增删改与状态解读，掌握 add / rm / mv / diff。',
    lessons: [
      {
        id: 'git-stage-1',
        title: '文件操作：add / rm / mv',
        concept: '文件跟踪',
        content: [
          { type: 'text', html: 'Git 通过 <code>git add</code> 跟踪文件，用 <code>git rm</code> 删除文件，用 <code>git mv</code> 重命名文件。注意：<b>直接删除或重命名文件并不会自动反映到 Git</b>，需要让 Git 记录这些操作。' },
          { type: 'code', lang: 'bash', code: 'git rm old.txt            # 删除文件（同时记录到暂存区）\ngit mv old.txt new.txt     # 重命名文件（同时记录到暂存区）\ngit add new.txt            # 手动跟踪新文件\n# 然后一起提交\ngit commit -m "chore: 整理文件"' },
          { type: 'tip', title: 'rm 与手动删除的区别', text: '直接 rm 删除文件后，Git 会显示 "deleted: file"，仍需 git add（或 git rm）把删除记录到暂存区再提交；用 git rm 则一步到位。' }
        ],
        practice: {
          title: '任务：删除并重命名文件',
          desc: '初始化仓库后：① git rm index.html 删除文件；② git mv README.md README_cn.md 重命名；③ git status 查看变化；④ git commit -m "chore: 整理文件" 提交。',
          commands: ['git init', 'git rm index.html', 'git mv README.md README_cn.md', 'git status', 'git commit -m "chore: 整理文件"'],
          check: () => {
            const s = getGitState()
            return commitCount() >= 1 && s.workdir['index.html'] === undefined && s.workdir['README.md'] === undefined && s.workdir['README_cn.md'] !== undefined
          },
          successMsg: '文件操作全部完成，提交已生成！',
          hints: [
            '删除文件：git rm index.html；重命名：git mv README.md README_cn.md',
            '用 git status 查看暂存区变化',
            'git commit -m "chore: 整理文件" 提交'
          ]
        }
      },
      {
        id: 'git-stage-2',
        title: 'diff 与状态解读',
        concept: '查看差异',
        content: [
          { type: 'text', html: '<code>git diff</code> 查看<b>工作区与暂存区</b>的差异（还未 add 的修改）；<code>git diff --staged</code> 查看<b>暂存区与版本库</b>的差异（已 add 未 commit 的修改）。' },
          { type: 'code', lang: 'bash', code: 'echo "update" >> README.md   # 修改文件\ngit diff                     # 查看未暂存的修改\ngit add README.md\ngit diff --staged            # 查看已暂存的修改\ngit diff HEAD                # 工作区与版本库的差异' },
          { type: 'table', headers: ['状态', '含义', '如何进入'], rows: [
            ['Untracked', '未被 Git 跟踪的新文件', '新建文件后'],
            ['modified (unstaged)', '已跟踪但修改未暂存', '改文件后'],
            ['staged (Changes to be committed)', '已加入暂存区', 'git add 后'],
            ['clean', '工作区与版本库一致', 'commit 后']
          ] }
        ],
        practice: {
          title: '任务：体验 diff 查看差异',
          desc: '① git init + 提交初始文件；② 修改 app.js（任意追加一行）；③ git diff 查看未暂存差异；④ git add app.js；⑤ git diff --staged 查看已暂存差异。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "init"', 'echo "// update by learner" >> app.js', 'git diff', 'git add app.js', 'git diff --staged'],
          check: () => {
            const s = getGitState()
            const tree = s.commits[s.branches.master]?.files || {}
            return Object.keys(s.staged).length > 0 && s.staged['app.js'] !== tree['app.js']
          },
          successMsg: '你已学会用 diff 查看文件差异！',
          hints: [
            '先完成一次提交（git add . && git commit -m "init"）',
            '修改 app.js：可以先用 echo 模拟，本环境建议直接 git add 后再 diff --staged',
            'git diff --staged 查看暂存区的差异'
          ]
        }
      }
    ]
  },
  {
    id: 'git-undo',
    index: '04',
    title: '撤销与回退',
    icon: 'RefreshLeft',
    color: '#F7A600',
    minutes: 12,
    description: '安全撤销工作区修改，掌握 reset 与 revert 的正确姿势。',
    lessons: [
      {
        id: 'git-undo-1',
        title: '撤销工作区修改',
        concept: 'checkout -- / restore',
        content: [
          { type: 'text', html: '把文件改坏了想“回到上次提交的样子”？<code>git checkout -- &lt;file&gt;</code> 或 <code>git restore &lt;file&gt;</code> 可以<b>丢弃工作区中未暂存的修改</b>，把文件恢复到暂存区/版本库中的内容。' },
          { type: 'code', lang: 'bash', code: 'git checkout -- app.js       # 丢弃 app.js 的未暂存修改\ngit restore app.js           # 等价写法（新版本推荐）\ngit restore --staged app.js  # 把已暂存的文件移出暂存区（取消 add）' },
          { type: 'warning', title: '危险操作，无法找回', text: 'checkout -- 会直接覆盖工作区文件，<b>未暂存的修改将永久丢失</b>，无法恢复。执行前确认真的要丢弃。' },
          { type: 'tip', title: '暂存区撤销', text: '如果文件已经 git add 了，用 <code>git restore --staged &lt;file&gt;</code> 把它“请出”暂存区（等价于旧的 git reset HEAD &lt;file&gt;）。' }
        ],
        practice: {
          title: '任务：丢弃错误的修改',
          desc: '① 完成一次初始提交；② 修改 README.md（模拟写错）；③ 用 git checkout -- README.md 丢弃修改；④ git status 确认工作区恢复干净。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "init"', 'echo "typo in readme" >> README.md', 'git checkout -- README.md', 'git status'],
          check: () => {
            const s = getGitState()
            const tree = s.commits[s.branches.master]?.files || {}
            return s.workdir['README.md'] === tree['README.md']
          },
          successMsg: '修改已成功丢弃，工作区恢复干净！',
          hints: [
            '先完成一次提交（git add . && git commit -m "init"）',
            '执行 git checkout -- README.md 丢弃工作区修改',
            'git status 确认 Changes not staged 为空'
          ]
        }
      },
      {
        id: 'git-undo-2',
        title: 'reset 与 revert：回退的正确姿势',
        concept: '历史回退',
        content: [
          { type: 'text', html: '要回退到历史版本，有两个常用命令：<code>git reset</code>（移动 HEAD 指针，改变历史）和 <code>git revert</code>（生成一个反向提交，保留历史）。<b>已推送到远程的提交，永远不要用 reset！</b>' },
          { type: 'code', lang: 'bash', code: 'git reset --soft HEAD~1    # 软重置：回到上一个提交，暂存区保留\ngit reset --mixed HEAD~1   # 混合重置（默认）：取消暂存，工作区保留\ngit reset --hard HEAD~1    # 硬重置：工作区、暂存区全部回到上一个提交\ngit revert <commit>        # 生成反向提交撤销指定提交' },
          { type: 'table', headers: ['命令', '工作区', '暂存区', '适用场景'], rows: [
            ['reset --soft', '保留', '保留', '重新提交'],
            ['reset --mixed', '保留', '清空', '取消暂存'],
            ['reset --hard', '清空', '清空', '彻底回退（慎用）'],
            ['revert', '保留', '保留', '回退已推送的提交']
          ] },
          { type: 'warning', title: '--hard 慎用', text: 'git reset --hard 会丢弃工作区所有未提交的修改且无法恢复。如果不小心执行了，可以用 <code>git reflog</code> 找到之前的提交救回来（进阶章节会讲）。' }
        ],
        practice: {
          title: '任务：回退上一个提交',
          desc: '① 连续创建两个提交；② 用 git reset --hard HEAD~1 回退到第一个提交；③ git log --oneline 确认只剩 1 个提交；④ 再用 git reflog 找回被回退的提交。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "first"', 'echo "// second change" >> README.md', 'git add .', 'git commit -m "second"', 'git reset --hard HEAD~1', 'git log --oneline', 'git reflog'],
          check: () => {
            const s = getGitState()
            let count = 0
            let h = s.branches.master
            while (h) { count++; h = s.commits[h]?.parent || null }
            return count === 1 && s.reflog.length >= 2
          },
          successMsg: '回退完成，而且你学会了用 reflog 找回历史！',
          hints: [
            '先创建两个提交：第一次 git commit -m "first"，第二次 git commit -m "second"',
            'git reset --hard HEAD~1 回退一个提交',
            'git log --oneline 确认只剩 1 个提交；git reflog 能看到完整历史'
          ]
        }
      }
    ]
  },
  {
    id: 'git-branch',
    index: '05',
    title: '分支管理',
    icon: 'Share',
    color: '#2496ED',
    minutes: 12,
    description: '分支是 Git 的灵魂：创建、切换、合并分支，安全并行开发。',
    lessons: [
      {
        id: 'git-branch-1',
        title: '创建与切换分支',
        concept: '分支基础',
        content: [
          { type: 'text', html: '<b>分支（Branch）</b>是 Git 最强大的功能：它让你可以在同一份代码上并行开发不同功能而互不干扰。分支本质上是一个<b>指向提交的可移动指针</b>。' },
          { type: 'code', lang: 'bash', code: 'git branch                # 查看所有分支（* 为当前分支）\ngit branch feature         # 创建分支 feature\ngit checkout feature       # 切换到 feature\ngit switch feature         # 切换（新命令，推荐）\ngit checkout -b feature    # 创建并切换（一步到位）\ngit switch -c feature      # 创建并切换（新命令）' },
          { type: 'tip', title: 'checkout 还是 switch？', text: 'git switch 是 Git 2.23+ 专门用于切换分支的新命令，职责更单一、更安全；git checkout 还能做文件恢复等操作，是老手习惯。两者都支持。' },
          { type: 'warning', title: '切换分支前先提交', text: '如果工作区有未提交的修改，切换分支可能被拒绝（本模拟环境会提示）。养成“改完就提交”的习惯。' }
        ],
        practice: {
          title: '任务：创建并切换分支',
          desc: '① 完成一次初始提交；② git branch feature 创建分支；③ git checkout feature 切换到分支；④ git branch 确认当前在 feature（带 * 号）；⑤ 切回 master。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "init"', 'git branch feature', 'git checkout feature', 'git branch', 'git checkout master'],
          check: () => {
            const s = getGitState()
            return hasBranch('feature') && s.head === 'master' && branchCommitCount('feature') === 1 && branchCommitCount('master') === 1
          },
          successMsg: '分支创建与切换都掌握了！',
          hints: [
            '先 git init + git add . + git commit -m "init" 完成初始提交',
            'git branch feature 创建分支，git checkout feature 切换',
            '最后 git checkout master 切回主分支'
          ]
        }
      },
      {
        id: 'git-branch-2',
        title: '合并分支与冲突',
        concept: 'git merge',
        content: [
          { type: 'text', html: '功能开发完成后，要把分支合并回主线：<code>git merge &lt;分支&gt;</code>。合并有两种结果：<b>Fast-forward（快进）</b>——目标分支是当前分支的直接后继，指针直接前移；<b>三方合并（Merge commit）</b>——两条分支各自有独立提交，生成一个新的合并提交。' },
          { type: 'code', lang: 'bash', code: '# 在 feature 分支上开发\ngit checkout -b feature\ngit add . && git commit -m "feat: 新功能"\n\n# 回到 master 合并\ngit checkout master\ngit merge feature\n\n# 合并后 feature 分支可以删除\ngit branch -d feature' },
          { type: 'warning', title: '冲突（Conflict）', text: '当两个分支修改了<b>同一个文件的同一位置</b>时，Git 无法自动合并，需要手动解决冲突：编辑文件保留正确内容，然后 git add + git commit。本模拟环境会提示冲突但自动简化。' },
          { type: 'tip', title: '合并前先看状态', text: 'git status 确认工作区干净再 merge；合并冲突时不要慌，Git 会标记冲突文件位置。' }
        ],
        practice: {
          title: '任务：开发并合并一个功能分支',
          desc: '① 初始提交；② 创建并切换到 feature 分支；③ 在 feature 上提交一次；④ 切回 master；⑤ git merge feature 合并；⑥ git log --oneline 确认合并结果；⑦ git branch -d feature 删除分支。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "init"', 'git checkout -b feature', 'echo "// feature code" >> app.js', 'git add app.js', 'git commit -m "feat: 新功能"', 'git checkout master', 'git merge feature', 'git log --oneline', 'git branch -d feature'],
          check: () => {
            const s = getGitState()
            return !hasBranch('feature') && branchCommitCount('master') === 2 && s.head === 'master'
          },
          successMsg: '完整的分支开发流程已跑通：创建 → 开发 → 合并 → 删除！',
          hints: [
            'git checkout -b feature 创建并切换',
            '在 feature 上 git add app.js && git commit -m "feat: 新功能"',
            '切回 master 后 git merge feature 合并，最后 git branch -d feature 删除'
          ]
        }
      }
    ]
  },
  {
    id: 'git-remote',
    index: '06',
    title: '远程仓库协作',
    icon: 'Connection',
    color: '#00A6FF',
    minutes: 12,
    description: '连接远程仓库：remote / clone / push / pull，开启团队协作。',
    lessons: [
      {
        id: 'git-remote-1',
        title: '配置远程仓库与克隆',
        concept: 'remote / clone',
        content: [
          { type: 'text', html: '远程仓库（Remote）是存放在服务器上的副本，常用托管平台有 Gitee、GitHub、GitLab。<code>git remote add</code> 把本地仓库与远程关联；<code>git clone</code> 把远程仓库完整复制到本地（包括全部历史）。' },
          { type: 'code', lang: 'bash', code: 'git remote add origin https://gitee.com/user/repo.git\ngit remote -v                  # 查看远程配置\n\ngit clone https://gitee.com/user/repo.git   # 克隆到本地' },
          { type: 'tip', title: 'origin 是什么？', text: 'origin 是 Git 对第一个远程仓库的<b>默认名称</b>（约定俗成），可以理解为“源仓库”。一个本地仓库可以关联多个远程。' },
          { type: 'list', items: [
            'HTTPS 方式：每次推送需要账号密码（或令牌）',
            'SSH 方式：配置公钥后免密推送',
            '推送前要先有提交：git 不会推送未提交的内容'
          ] }
        ],
        practice: {
          title: '任务：关联远程仓库',
          desc: '① git init 并完成一次提交；② git remote add origin https://gitee.com/learner/git-project.git 关联远程；③ git remote -v 确认配置。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "init"', 'git remote add origin https://gitee.com/learner/git-project.git', 'git remote -v'],
          check: () => {
            const s = getGitState()
            return !!(s.remotes.origin && s.remotes.origin.url.includes('gitee.com'))
          },
          successMsg: '远程仓库已关联，下一步学习推送与拉取！',
          hints: [
            '先完成一次提交',
            'git remote add origin https://gitee.com/learner/git-project.git',
            'git remote -v 确认远程配置'
          ]
        }
      },
      {
        id: 'git-remote-2',
        title: '推送与拉取',
        concept: 'push / pull',
        content: [
          { type: 'text', html: '<code>git push</code> 把本地提交推送到远程；<code>git pull</code> 把远程最新提交拉取到本地。团队协作的日常就是：拉取最新 → 本地开发 → 提交 → 推送。' },
          { type: 'code', lang: 'bash', code: 'git push origin master      # 推送本地 master 到远程\ngit push                     # 简写（已关联 upstream）\n\ngit pull origin master      # 拉取远程 master\n# 等价于 git fetch + git merge' },
          { type: 'warning', title: '推送冲突', text: '如果远程有新提交而你本地没有，push 会被拒绝（non-fast-forward）。此时先 git pull 合并，再 push。' },
          { type: 'table', headers: ['命令', '方向', '作用'], rows: [
            ['git push', '本地 → 远程', '上传本地提交'],
            ['git pull', '远程 → 本地', '下载并合并远程提交'],
            ['git fetch', '远程 → 本地', '只下载，不合并']
          ] }
        ],
        practice: {
          title: '任务：推送并拉取',
          desc: '① 初始化 + 提交；② 关联远程 origin；③ git push 推送；④ git status 确认分支已同步（显示 up to date with origin）；⑤ 再 git pull 验证。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "init"', 'git remote add origin https://gitee.com/learner/git-project.git', 'git push', 'git status', 'git pull'],
          check: () => pushed('master'),
          successMsg: '推送成功！你的代码已经“上云”了，远程协作的核心操作全部掌握！',
          hints: [
            '完成提交后，git remote add origin https://gitee.com/learner/git-project.git',
            'git push 推送，git status 会显示 up to date with origin/master',
            'git pull 拉取验证（应显示 Already up to date）'
          ]
        }
      }
    ]
  },
  {
    id: 'git-tag',
    index: '07',
    title: '标签管理',
    icon: 'PriceTag',
    color: '#FF6B35',
    minutes: 6,
    description: '为重要提交打标签，标记发布版本。',
    lessons: [
      {
        id: 'git-tag-1',
        title: '打标签与发布版本',
        concept: 'git tag',
        content: [
          { type: 'text', html: '<b>标签（Tag）</b>是给特定提交起的“别名”，通常用于标记发布版本（v1.0.0、v2.1.3）。标签分两种：<b>轻量标签</b>（只是指针）和<b>附注标签</b>（带说明信息，推荐）。' },
          { type: 'code', lang: 'bash', code: 'git tag v1.0.0                    # 轻量标签\ngit tag -a v1.0.0 -m "正式版发布"   # 附注标签（推荐）\ngit tag                          # 查看所有标签\ngit show v1.0.0                  # 查看标签对应提交' },
          { type: 'tip', title: '版本号规范', text: '语义化版本：主版本号.次版本号.修订号（如 2.1.3）。主版本号不兼容变更、次版本号新功能、修订号修复。' },
          { type: 'warning', title: '标签不可变', text: '标签一旦创建就固定指向某个提交，不能移动（不像分支）。打错标签需要删除重建。' }
        ],
        practice: {
          title: '任务：为版本打标签',
          desc: '① 完成一次提交；② git tag -a v1.0.0 -m "初始版本发布" 创建附注标签；③ git tag 查看标签列表；④ git show v1.0.0 查看标签指向的提交。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "feat: 完成初始功能"', 'git tag -a v1.0.0 -m "初始版本发布"', 'git tag', 'git show v1.0.0'],
          check: () => {
            const s = getGitState()
            return hasTag('v1.0.0') && s.tags['v1.0.0'] === s.branches.master && commitCount() >= 1
          },
          successMsg: '标签创建成功，你的项目有了第一个版本号！',
          hints: [
            '先完成一次提交',
            'git tag -a v1.0.0 -m "初始版本发布" 创建附注标签',
            'git tag 查看列表，git show v1.0.0 查看详情'
          ]
        }
      }
    ]
  },
  {
    id: 'git-advance',
    index: '08',
    title: '进阶技巧',
    icon: 'MagicStick',
    color: '#E85D75',
    minutes: 14,
    description: 'stash 临时保存、cherry-pick 精准移植、reflog 后悔药。',
    lessons: [
      {
        id: 'git-advance-1',
        title: 'stash：临时保存工作现场',
        concept: 'git stash',
        content: [
          { type: 'text', html: '正改到一半，突然要切分支处理紧急 bug，但改动还没完成不想提交？<code>git stash</code> 可以把当前修改<b>临时存起来</b>，让工作区恢复干净，处理完再 <code>git stash pop</code> 取回来。' },
          { type: 'code', lang: 'bash', code: 'git stash              # 暂存当前修改，工作区恢复干净\ngit stash list         # 查看 stash 列表\ngit stash pop          # 恢复最近一次暂存的修改\ngit stash clear        # 清空 stash（慎用，不可恢复）' },
          { type: 'tip', title: '什么时候用 stash？', text: '① 切分支前有未完成修改；② 想实验性改动又不想提交；③ 需要先看一个干净的代码状态。' },
          { type: 'warning', title: 'stash 不是备份', text: 'stash 适合临时保存，不适合长期存放。重要修改应该提交到分支而不是堆在 stash 里。' }
        ],
        practice: {
          title: '任务：暂存并恢复修改',
          desc: '① 完成初始提交；② 修改 app.js（模拟未完成开发）；③ git stash 暂存；④ git stash list 查看；⑤ git stash pop 恢复；⑥ git status 确认修改回来了。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "init"', 'echo "// work in progress" >> README.md', 'git stash', 'git stash list', 'git stash pop', 'git status'],
          check: () => {
            const s = getGitState()
            const tree = s.commits[s.branches.master]?.files || {}
            return s.stash.length === 0 && Object.keys(s.staged).length === 0 && Object.values(s.workdir).some((v) => typeof v === 'string' && v.includes('console.log'))
          },
          successMsg: 'stash 暂存与恢复都成功了！',
          hints: [
            '先完成一次提交（git add . && git commit -m "init"）',
            'git stash 保存修改 → git stash list 查看 → git stash pop 恢复',
            'git status 确认工作区改动恢复'
          ]
        }
      },
      {
        id: 'git-advance-2',
        title: 'cherry-pick 与 reflog',
        concept: '精准移植与后悔药',
        content: [
          { type: 'text', html: '<code>git cherry-pick &lt;commit&gt;</code> 可以把<b>某个提交的改动精准地“复制”到当前分支</b>，生成一个新提交——适合把修复从一个分支移植到另一个分支。<code>git reflog</code> 记录 HEAD 的所有移动历史，是找回丢失提交的“后悔药”。' },
          { type: 'code', lang: 'bash', code: '# 在 master 上找到修复提交，移植到 release 分支\ngit checkout release\ngit cherry-pick a1b2c3d\n\n# 找回误删的提交\ngit reflog                # 查看所有 HEAD 移动记录\ngit reset --hard HEAD@{2} # 回到 2 步之前的状态' },
          { type: 'table', headers: ['命令', '作用', '场景'], rows: [
            ['git cherry-pick <commit>', '复制单个提交到当前分支', '移植修复/功能'],
            ['git reflog', '查看 HEAD 移动历史', '找回丢失提交'],
            ['git rebase <branch>', '变基，重放提交', '整理历史（本环境仅讲解）']
          ] },
          { type: 'warning', title: 'rebase 概念', text: 'git rebase 会把当前分支的提交“重放”到目标分支之上，得到更线性的历史。它与 merge 目的一样、方式不同。注意：<b>不要 rebase 已推送的提交</b>。' },
          { type: 'tip', title: '最安全的后悔药', text: '只要提交过，就永远有迹可循——reflog 能找回绝大部分“丢失”的提交。大胆练习，Git 比想象中更能容错。' }
        ],
        practice: {
          title: '任务：用 cherry-pick 移植提交',
          desc: '① 初始提交；② 创建并切换到 feature，在 feature 上提交；③ 切回 master 后，用 git cherry-pick 把 feature 的提交移植到 master（先 git log 找到 feature 分支的提交 hash）；④ git log --oneline 确认移植成功。',
          commands: ['git init', 'git config --global user.name "learner"', 'git config --global user.email learner@example.com', 'git add .', 'git commit -m "init"', 'git checkout -b feature', 'echo "// critical fix" >> app.js', 'git add app.js', 'git commit -m "feat: 修复关键 bug"', 'git checkout master', 'git log --oneline'],
          check: () => {
            const s = getGitState()
            return s.head === 'master' && commitCount() >= 3 && branchCommitCount('master') === 2 && !Object.keys(s.staged).length
          },
          successMsg: 'cherry-pick 移植成功，你已掌握精准移植与后悔药技巧！',
          hints: [
            '在 feature 分支提交后，git log 查看提交 hash',
            '切回 master，git cherry-pick <那串hash> 移植提交',
            'git log --oneline 确认 master 上多了一个提交'
          ]
        }
      }
    ]
  }
]

export const gitStats = {
  chapters: gitChapters.length,
  lessons: gitChapters.reduce((s, c) => s + c.lessons.length, 0),
  practices: gitChapters.reduce((s, c) => s + c.lessons.filter((l) => l.practice).length, 0)
}
