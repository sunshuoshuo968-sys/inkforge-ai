import { createServer } from 'node:http'
import { chromium } from 'playwright-core'

const plan = {
  title: '雾城来信',
  genre: '都市悬疑',
  synopsis: '一封迟到十年的信，让记者林乔重新调查一桩旧案。',
  characters: [{
    name: '林乔', role: '调查记者 / 主角', description: '三十二岁，习惯记录每个无法解释的细节。', motivation: '查明旧案真相', conflict: '真相会伤害仍然信任她的人', tags: ['冷静', '执拗'],
  }],
  world: [{ title: '雾城', category: '地点', content: '沿江工业城市，旧城区常年潮湿多雾。' }],
  plot: [{ title: '迟到的信', category: '主线', content: '信件把十年前失踪案和今日的匿名投递者联系起来。' }],
  chapters: [
    { title: '雨夜的信', summary: '林乔收到写着自己名字的旧信，发现十年前车票。', goal: '确认信件来源', obstacle: '寄件信息被抹除', cost: '重新触碰旧案创伤', strand: 'Quest', hook: '车票背面写着明天的日期' },
    { title: '停运站台', summary: '林乔前往废弃站台，遇见认识失踪者的老人。', goal: '找到目击者', obstacle: '有人提前清理现场', cost: '身份暴露', strand: 'Constellation', hook: '老人说失踪者昨晚回来过' },
    { title: '第七码头', summary: '林乔追踪线索到码头，发现旧案的关键证物。', goal: '取得证物', obstacle: '匿名人阻止她离开', cost: '失去同事信任', strand: 'Quest', hook: '证物指向报社内部' },
  ],
}

const chapterBodies = [
  '雨水敲在报社的旧窗上。林乔拆开那封没有寄件人的信，纸页间落下一张十年前的车票。她认得那串褪色的编号，那是哥哥失踪前乘坐的最后一班车。票背有一行新墨：明晚十一点，旧站台见。',
  '旧站台的铁门已经锈死。林乔绕过围墙时，候车棚下亮起一根火柴。老人没有看她，只盯着积水里的倒影。他说昨晚见过那个失踪十年的人，还说有人正在擦掉所有脚印。',
  '第七码头没有登记在城市地图上。林乔在废仓库里找到一只生锈的录音机，磁带标签写着报社内部编号。门外传来锁链落地的声音，她按下播放键，听见总编十年前的声音。',
]
const takeoverBody = '雾从仓库破窗涌进来，林乔握紧那盘磁带，没有立刻按下播放键。门外的锁链拖过水泥地，逼近的脚步每一下都在试探她的退路。她关掉手电，把录音机贴在耳边。总编十年前的声音终于响起，却先叫出了她哥哥的名字。'
const greetingReply = '你好，我在。我们可以先聊聊这一章。'
const adviceReply = '这一章可以先检查开场进入冲突的速度、仓库场景的压迫感，以及章末线索是否足够有牵引力。'
const thanksReply = '不用客气。正文没有改动，需要调整时直接告诉我具体要求就好。'

const parseCssColor = (value) => {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? []
  if (value.startsWith('color(srgb')) return channels.slice(0, 3).map((channel) => channel * 255)
  return channels.slice(0, 3)
}

const colorLuminance = (value) => {
  const [red = 0, green = 0, blue = 0] = parseCssColor(value)
  const linear = [red, green, blue].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

const colorContrast = (foreground, background) => {
  const lighter = Math.max(colorLuminance(foreground), colorLuminance(background))
  const darker = Math.min(colorLuminance(foreground), colorLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

const capturedRequests = []

const mockServer = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }
  let body = ''
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => {
    const payload = JSON.parse(body || '{}')
    capturedRequests.push({ url: request.url, payload })
    const prompt = payload.messages?.at(-1)?.content || ''
    if (!payload.stream) {
      const content = prompt.includes('大纲规划') ? JSON.stringify(plan) : '综合分数：88\n必须修复：无\n建议修复：强化章末钩子。\n保留优点：人物目标明确。'
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ choices: [{ message: { content } }] }))
      return
    }
    const chapterNumber = Number(prompt.match(/第\s*(\d+)\s*章/)?.[1] || 1)
    const content = prompt.includes('章节接管修订')
      ? takeoverBody
      : /^你好[！!。.]?$/.test(prompt.trim())
        ? greetingReply
        : /先别改正文|哪里需要改|怎么改/.test(prompt)
          ? adviceReply
          : /^(?:谢谢|多谢|感谢)/.test(prompt.trim())
            ? thanksReply
            : chapterBodies[chapterNumber - 1] || chapterBodies[0]
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    const parts = content.match(/.{1,12}/gu) || []
    let index = 0
    const timer = setInterval(() => {
      const part = parts[index]
      if (part) response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`)
      index += 1
      if (index >= parts.length) {
        clearInterval(timer)
        response.end('data: [DONE]\n\n')
      }
    }, 55)
  })
})
await new Promise((resolve) => mockServer.listen(4174, '127.0.0.1', resolve))

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
})
const context = await browser.newContext({ viewport: { width: 1474, height: 1067 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const errors = []
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
page.on('pageerror', (error) => errors.push(`page: ${error.stack || error.message}`))

await page.goto(process.env.APP_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle' })
await page.evaluate(async () => { indexedDB.deleteDatabase('mogu-novel-studio'); localStorage.clear() })
await page.reload({ waitUntil: 'networkidle' })
await page.getByText('把一个想法交给 AI').waitFor()
const initialLandscapeBox = await page.locator('.sidebar-landscape').boundingBox()
const initialNavigationBox = await page.locator('.main-nav').boundingBox()
const initialLandscapeStyle = await page.locator('.sidebar-landscape').evaluate((element) => ({
  image: getComputedStyle(element).backgroundImage,
  size: getComputedStyle(element).backgroundSize,
}))
if (
  !initialLandscapeBox
  || !initialNavigationBox
  || ['x', 'y', 'width', 'height'].some((key) => Math.round(initialLandscapeBox[key]) !== Math.round(initialNavigationBox[key]))
  || !initialLandscapeStyle.image.includes('design-sidebar.png')
  || initialLandscapeStyle.size.split(',').some((size) => size.trim() !== 'cover')
) {
  throw new Error(`sidebar landscape does not cover the navigation region: ${JSON.stringify({ initialLandscapeBox, initialNavigationBox, initialLandscapeStyle })}`)
}
await page.screenshot({ path: 'qa/desktop-empty.png', fullPage: true })

const favoritesButton = page.getByRole('button', { name: '我的关注' })
await favoritesButton.click()
const favoritesPopover = page.locator('.favorites-popover')
await favoritesPopover.waitFor()
const favoritesPopoverBox = await favoritesPopover.boundingBox()
const firstNavigationButtonBox = await page.locator('.main-nav > .nav-button').first().boundingBox()
const favoritesPopoverIsOnTop = await page.evaluate(({ popoverBox, navigationBox }) => {
  if (!popoverBox || !navigationBox) return false
  const overlapLeft = Math.max(popoverBox.x, navigationBox.x)
  const overlapTop = Math.max(popoverBox.y, navigationBox.y)
  const overlapRight = Math.min(popoverBox.x + popoverBox.width, navigationBox.x + navigationBox.width)
  const overlapBottom = Math.min(popoverBox.y + popoverBox.height, navigationBox.y + navigationBox.height)
  if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) return false
  const topElement = document.elementFromPoint((overlapLeft + overlapRight) / 2, (overlapTop + overlapBottom) / 2)
  return Boolean(topElement?.closest('.favorites-popover'))
}, { popoverBox: favoritesPopoverBox, navigationBox: firstNavigationButtonBox })
if (!favoritesPopoverIsOnTop) {
  throw new Error(`favorites popover is covered by navigation: ${JSON.stringify({ favoritesPopoverBox, firstNavigationButtonBox })}`)
}
await page.screenshot({ path: 'qa/desktop-sidebar-popover.png', fullPage: true })
await favoritesButton.click()

await page.getByRole('button', { name: 'AI 一键创作' }).first().click()
await page.screenshot({ path: 'qa/desktop-ai-create.png', fullPage: true })
await page.getByRole('button', { name: '前往设置' }).click()
const deepseekChoice = page.getByRole('radio', { name: /DeepSeek/ })
const kimiChoice = page.getByRole('radio', { name: /Kimi/ })
if (await deepseekChoice.getAttribute('aria-checked') !== 'true' || !(await deepseekChoice.innerText()).includes('当前使用')) {
  throw new Error('DeepSeek is not marked as the initial active provider')
}
await kimiChoice.click()
if (
  await kimiChoice.getAttribute('aria-checked') !== 'true'
  || !(await kimiChoice.innerText()).includes('待确认')
  || !(await deepseekChoice.innerText()).includes('当前使用')
) {
  throw new Error('pending and committed provider states are not distinguishable')
}
await page.screenshot({ path: 'qa/desktop-settings-pending.png', fullPage: true })
await page.getByRole('button', { name: 'AI 一键创作' }).first().click()
const pendingModelDialog = page.locator('.ai-create-dialog')
if (await pendingModelDialog.getByLabel('AI 模型').inputValue() !== 'deepseek') {
  throw new Error('unconfirmed provider selection leaked into AI creation')
}
await pendingModelDialog.getByRole('button', { name: '关闭' }).click()
const activeProvider = page.locator('.provider-config')
if (await activeProvider.getByLabel('模型').inputValue() !== 'kimi-k2.6') {
  throw new Error('Kimi default model is not the official general thinking model kimi-k2.6')
}
await activeProvider.getByLabel('接口地址').fill('http://127.0.0.1:4174/v1')
await activeProvider.getByLabel('API Key').fill('test-key')
const applyModelButton = page.getByRole('button', { name: '确定并应用' })
if (await applyModelButton.isDisabled()) throw new Error('model confirmation is disabled with a valid dirty draft')
await applyModelButton.click()
await page.getByText('Kimi 模型配置已应用', { exact: true }).waitFor()
await page.locator('.provider-choice.current.selected', { hasText: 'Kimi' }).waitFor()
if (!(await applyModelButton.isDisabled())) throw new Error('model confirmation remains enabled after applying the draft')
await page.getByRole('button', { name: 'AI 一键创作' }).click()
await page.getByLabel('核心创意').fill('一个替死者投递遗书的快递员，收到了一封写给自己的信。')
await page.getByLabel('章节数').fill('3')
await page.getByText('快速初稿', { exact: true }).click()
await page.getByRole('button', { name: '生成整部小说' }).click()
await page.locator('.live-manuscript').waitFor({ timeout: 10_000 })
await page.screenshot({ path: 'qa/desktop-generating.png', fullPage: true })
await page.getByText('全书初稿已生成', { exact: true }).waitFor({ timeout: 30_000 })
await page.screenshot({ path: 'qa/desktop-editor.png', fullPage: true })
if (await page.locator('.chapter-summary-input').count()) {
  throw new Error('chapter outline is still occupying the manuscript paper')
}
const manuscript = page.locator('textarea.manuscript')
const originalChapterContent = await manuscript.inputValue()
const paperBeforeAi = await page.locator('.paper').boundingBox()
const aiTrigger = page.getByRole('button', { name: '打开章节 AI 助手' })
const aiTriggerBox = await aiTrigger.boundingBox()
if (!aiTriggerBox || aiTriggerBox.width < 44 || aiTriggerBox.height < 44) {
  throw new Error(`AI chapter launcher is too small: ${JSON.stringify(aiTriggerBox)}`)
}
await aiTrigger.click()
const aiRevisionPanel = page.getByRole('dialog', { name: '章节 AI 助手' })
await page.waitForTimeout(250)
if (!(await aiRevisionPanel.count()) || !(await aiRevisionPanel.isVisible())) {
  throw new Error(`AI revision panel did not open: ${JSON.stringify({ errors, panelCount: await aiRevisionPanel.count() })}`)
}
const aiPanelGeometry = await aiRevisionPanel.evaluate((element) => {
  const box = element.getBoundingClientRect()
  return { position: getComputedStyle(element).position, x: box.x, y: box.y, width: box.width, height: box.height }
})
const paperWithAi = await page.locator('.paper').boundingBox()
if (
  aiPanelGeometry.position !== 'fixed'
  || aiPanelGeometry.x < 0
  || aiPanelGeometry.y < 0
  || aiPanelGeometry.x + aiPanelGeometry.width > 1474
  || aiPanelGeometry.y + aiPanelGeometry.height > 1067
  || !paperBeforeAi
  || !paperWithAi
  || ['x', 'y', 'width', 'height'].some((key) => Math.round(paperBeforeAi[key]) !== Math.round(paperWithAi[key]))
) {
  throw new Error(`AI panel is not floating cleanly: ${JSON.stringify({ aiPanelGeometry, paperBeforeAi, paperWithAi })}`)
}
const aiPanelBeforeDrag = await aiRevisionPanel.boundingBox()
const aiDragHandle = aiRevisionPanel.getByRole('button', { name: '拖动 AI 面板' })
const aiDragHandleBox = await aiDragHandle.boundingBox()
const desktopViewport = page.viewportSize()
if (!aiPanelBeforeDrag || !aiDragHandleBox || !desktopViewport || await aiRevisionPanel.getAttribute('data-draggable') !== 'true') {
  throw new Error(`AI panel drag controls are unavailable: ${JSON.stringify({ aiPanelBeforeDrag, aiDragHandleBox, desktopViewport })}`)
}
await page.mouse.move(aiDragHandleBox.x + aiDragHandleBox.width / 2, aiDragHandleBox.y + aiDragHandleBox.height / 2)
await page.mouse.down()
await page.mouse.move(aiDragHandleBox.x - 180, aiDragHandleBox.y - 120, { steps: 8 })
await page.mouse.up()
const aiPanelAfterDrag = await aiRevisionPanel.boundingBox()
const paperAfterPanelDrag = await page.locator('.paper').boundingBox()
if (
  !aiPanelAfterDrag
  || Math.hypot(aiPanelAfterDrag.x - aiPanelBeforeDrag.x, aiPanelAfterDrag.y - aiPanelBeforeDrag.y) < 80
  || aiPanelAfterDrag.x < 12
  || aiPanelAfterDrag.y < 12
  || aiPanelAfterDrag.x + aiPanelAfterDrag.width > desktopViewport.width - 12
  || aiPanelAfterDrag.y + aiPanelAfterDrag.height > desktopViewport.height - 12
  || !paperAfterPanelDrag
  || !paperWithAi
  || ['x', 'y', 'width', 'height'].some((key) => Math.round(paperWithAi[key]) !== Math.round(paperAfterPanelDrag[key]))
) {
  throw new Error(`AI panel drag is invalid: ${JSON.stringify({ aiPanelBeforeDrag, aiPanelAfterDrag, paperWithAi, paperAfterPanelDrag })}`)
}
await page.screenshot({ path: 'qa/desktop-ai-draggable.png', fullPage: true })
if (await aiRevisionPanel.getByRole('tab', { name: '智能对话' }).getAttribute('aria-selected') !== 'true') {
  throw new Error('AI assistant does not open in smart conversation mode')
}
const aiComposer = aiRevisionPanel.locator('.ai-composer textarea')
await aiComposer.fill('你好')
await aiRevisionPanel.getByText('聊天回复', { exact: true }).waitFor()
await aiRevisionPanel.getByRole('button', { name: '发送' }).click()
await aiRevisionPanel.getByText(greetingReply, { exact: true }).waitFor({ timeout: 10_000 })
const greetingRequest = capturedRequests.at(-1)
if (
  await manuscript.inputValue() !== originalChapterContent
  || greetingRequest?.payload.messages?.at(-1)?.content !== '你好'
  || greetingRequest?.payload.messages?.at(-1)?.content?.includes('章节接管修订')
  || await aiRevisionPanel.getByRole('button', { name: '预览并替换' }).count()
  || await aiRevisionPanel.getByRole('button', { name: '追加到正文' }).count()
) {
  throw new Error(`greeting was not handled as normal chat: ${JSON.stringify({ greetingRequest })}`)
}
await page.screenshot({ path: 'qa/desktop-ai-chat.png', fullPage: true })

const advicePrompt = '先别改正文，只告诉我这章哪里需要调整。'
await aiComposer.fill(advicePrompt)
await aiRevisionPanel.getByText('聊天回复', { exact: true }).waitFor()
await aiRevisionPanel.getByRole('button', { name: '发送' }).click()
await aiRevisionPanel.getByText(adviceReply, { exact: true }).waitFor({ timeout: 10_000 })
const adviceRequest = capturedRequests.at(-1)
if (
  await manuscript.inputValue() !== originalChapterContent
  || adviceRequest?.payload.messages?.at(-1)?.content !== advicePrompt
  || adviceRequest?.payload.messages?.at(-1)?.content?.includes('章节接管修订')
  || await aiRevisionPanel.getByRole('button', { name: '预览并替换' }).count()
) {
  throw new Error(`advice-only request was not handled as chat: ${JSON.stringify({ adviceRequest })}`)
}

const aiInstruction = '保持证物结果不变，强化仓库内的压迫感和章末钩子。'
await aiComposer.fill(aiInstruction)
await aiRevisionPanel.getByText('生成修改稿', { exact: true }).waitFor()
await aiRevisionPanel.getByRole('button', { name: '发送' }).click()
if (await manuscript.inputValue() !== originalChapterContent) throw new Error('chapter changed while AI takeover was streaming')
await aiRevisionPanel.getByText(takeoverBody, { exact: true }).waitFor({ timeout: 10_000 })
await aiRevisionPanel.getByRole('button', { name: '预览并替换' }).waitFor()
if (await aiRevisionPanel.getByRole('tab', { name: '智能对话' }).getAttribute('aria-selected') !== 'true') {
  throw new Error('automatic revision permanently changed the selected conversation mode')
}
if (await manuscript.inputValue() !== originalChapterContent) throw new Error('chapter changed before takeover confirmation')
await manuscript.fill(`${originalChapterContent}\n临时手动修改`)
await aiRevisionPanel.getByText('正文已变化，请重新生成候选稿', { exact: true }).waitFor()
if (await aiRevisionPanel.getByRole('button', { name: '预览并替换' }).count()) throw new Error('stale AI candidate can still replace the chapter')
await manuscript.fill(originalChapterContent)
await aiComposer.fill(aiInstruction)
await aiRevisionPanel.getByRole('button', { name: '发送' }).click()
await aiRevisionPanel.getByRole('button', { name: '预览并替换' }).waitFor({ timeout: 10_000 })
await page.screenshot({ path: 'qa/desktop-ai-takeover.png', fullPage: true })
await aiRevisionPanel.getByRole('button', { name: '预览并替换' }).click()
await aiRevisionPanel.getByText(/确认替换《/).waitFor()
if (await manuscript.inputValue() !== originalChapterContent) throw new Error('opening takeover confirmation changed the chapter')
await aiRevisionPanel.getByRole('button', { name: '取消' }).click()
if (await manuscript.inputValue() !== originalChapterContent) throw new Error('cancelling takeover changed the chapter')
await aiRevisionPanel.getByRole('button', { name: '预览并替换' }).click()
await page.screenshot({ path: 'qa/desktop-ai-takeover-confirm.png', fullPage: true })
await aiRevisionPanel.getByRole('button', { name: '确认替换' }).click()
await page.getByText('AI 修改已应用，可随时恢复原文', { exact: true }).waitFor()
if (await manuscript.inputValue() !== takeoverBody) throw new Error('confirmed AI candidate did not replace the chapter atomically')
await aiRevisionPanel.getByRole('button', { name: '恢复原文' }).click()
await page.getByText('已恢复 AI 修改前的正文', { exact: true }).waitFor()
if (await manuscript.inputValue() !== originalChapterContent) throw new Error('AI revision backup did not restore the original chapter')
await aiComposer.fill('谢谢')
await aiRevisionPanel.getByText('聊天回复', { exact: true }).waitFor()
await aiRevisionPanel.getByRole('button', { name: '发送' }).click()
await aiRevisionPanel.getByText(thanksReply, { exact: true }).waitFor({ timeout: 10_000 })
const thanksRequest = capturedRequests.at(-1)
if (
  await manuscript.inputValue() !== originalChapterContent
  || thanksRequest?.payload.messages?.at(-1)?.content !== '谢谢'
  || await aiRevisionPanel.getByRole('button', { name: '预览并替换' }).count()
  || await aiRevisionPanel.getByRole('button', { name: '追加到正文' }).count()
) {
  throw new Error(`conversation did not return to chat after automatic revision: ${JSON.stringify({ thanksRequest })}`)
}
await aiRevisionPanel.getByRole('button', { name: '关闭章节 AI 助手' }).click()
const paperAfterAi = await page.locator('.paper').boundingBox()
if (!paperAfterAi || !paperBeforeAi || ['x', 'y', 'width', 'height'].some((key) => Math.round(paperBeforeAi[key]) !== Math.round(paperAfterAi[key]))) {
  throw new Error(`paper geometry changed after closing AI: ${JSON.stringify({ paperBeforeAi, paperAfterAi })}`)
}
const designGeometry = await page.evaluate(() => {
  const rect = (selector) => {
    const box = document.querySelector(selector)?.getBoundingClientRect()
    return box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null
  }
  return {
    sidebar: rect('.sidebar'),
    topbar: rect('.topbar'),
    status: rect('.editor-status-row'),
    main: rect('.editor-main'),
    chapterPanel: rect('.chapter-panel'),
    paper: rect('.paper'),
    topbarActionCount: document.querySelectorAll('.topbar-actions > button').length,
    projectSwitcherCount: document.querySelectorAll('.project-switcher').length,
  }
})
if (
  designGeometry.sidebar?.width !== 270
  || designGeometry.topbar?.height !== 84
  || designGeometry.status?.y !== 84
  || designGeometry.status?.height !== 76
  || designGeometry.main?.y !== 160
  || designGeometry.chapterPanel?.width !== 280
  || designGeometry.paper?.y !== 234
  || designGeometry.paper?.x !== 582
  || designGeometry.paper?.width !== 839
  || designGeometry.topbarActionCount !== 3
  || designGeometry.projectSwitcherCount
) {
  throw new Error(`editor frame does not match the design geometry: ${JSON.stringify(designGeometry)}`)
}
await page.getByRole('button', { name: '我的关注' }).waitFor()
await page.getByRole('button', { name: '时间线' }).waitFor()
await page.setViewportSize({ width: 1840, height: 820 })
await page.screenshot({ path: 'qa/desktop-wide-editor.png', fullPage: true })
await page.setViewportSize({ width: 1474, height: 1067 })

await page.getByRole('button', { name: '章节设置' }).click()
await page.screenshot({ path: 'qa/desktop-chapter-settings.png', fullPage: true })
await page.getByLabel('目标字数').fill('3000')
await page.getByLabel('本章需要记住的事实').fill('林乔已经取得录音机；证物指向报社内部；下一章必须承接总编录音。')
await page.getByRole('button', { name: '保存章节设置' }).click()
await page.getByText('章节设置已保存', { exact: true }).waitFor()

await page.getByRole('button', { name: '时间线' }).click()
await page.getByText('第七码头 · 本章事实', { exact: true }).waitFor()
await page.getByLabel('记忆内容').waitFor()
if (await page.getByLabel('记忆内容').inputValue() !== '林乔已经取得录音机；证物指向报社内部；下一章必须承接总编录音。') {
  throw new Error('chapter memory was not persisted')
}
await page.screenshot({ path: 'qa/desktop-memory.png', fullPage: true })

await page.getByRole('button', { name: '角色' }).click()
await page.getByText('林乔', { exact: true }).waitFor()
await page.screenshot({ path: 'qa/desktop-characters.png', fullPage: true })

for (const target of [
  { label: '世界观', id: 'world' },
  { label: '情节', id: 'plot' },
  { label: '灵感', id: 'ideas' },
  { label: '回收站', id: 'trash' },
]) {
  await page.getByRole('button', { name: target.label, exact: true }).click()
  await page.locator('.content-area').waitFor()
  if (target.id === 'plot') await page.screenshot({ path: 'qa/desktop-plot.png', fullPage: true })
}

await page.getByRole('button', { name: '设置', exact: true }).click()
await page.getByText('webnovel-plan', { exact: false }).waitFor()
await page.getByText('fanqie-audit', { exact: false }).waitFor()
await page.locator('.provider-choice.current.selected', { hasText: 'Kimi' }).waitFor()
if (await page.locator('.toast').count()) await page.locator('.toast').waitFor({ state: 'detached' })
await page.screenshot({ path: 'qa/desktop-settings.png', fullPage: true })

await page.getByLabel('界面主题').selectOption('dark')
await page.locator(':root[data-theme="dark"]').waitFor()
const darkProviderStyles = await page.evaluate(() => {
  const choice = getComputedStyle(document.querySelector('.provider-choice.selected'))
  const config = getComputedStyle(document.querySelector('.provider-config'))
  return { choiceBackground: choice.backgroundColor, choiceColor: choice.color, configBackground: config.backgroundColor, configColor: config.color }
})
if (darkProviderStyles.configBackground === 'rgb(250, 247, 241)' || darkProviderStyles.configColor === darkProviderStyles.configBackground) {
  throw new Error(`provider settings do not adapt to dark theme: ${JSON.stringify(darkProviderStyles)}`)
}
await page.screenshot({ path: 'qa/desktop-settings-dark.png', fullPage: true })

await page.getByRole('button', { name: '角色', exact: true }).click()
await page.locator('.record-editor').waitFor()
const darkCharacterStyles = await page.evaluate(() => {
  const read = (selector) => {
    const style = getComputedStyle(document.querySelector(selector))
    return { background: style.backgroundColor, color: style.color }
  }
  return {
    index: read('.library-index'),
    editor: read('.record-editor'),
    input: read('.record-fields input:not([type="checkbox"])'),
    textarea: read('.record-fields textarea'),
  }
})
if (
  [darkCharacterStyles.index, darkCharacterStyles.editor, darkCharacterStyles.input, darkCharacterStyles.textarea]
    .some(({ background }) => colorLuminance(background) >= 0.25)
  || [darkCharacterStyles.editor, darkCharacterStyles.input, darkCharacterStyles.textarea]
    .some(({ background, color }) => colorContrast(color, background) < 4.5)
) {
  throw new Error(`character library does not adapt to dark theme: ${JSON.stringify(darkCharacterStyles)}`)
}
await page.screenshot({ path: 'qa/desktop-characters-dark.png', fullPage: true })

await page.getByRole('button', { name: '大纲', exact: true }).click()
await page.getByLabel('章节标题').waitFor()
const darkEditorStyles = await page.evaluate(() => {
  const read = (selector) => {
    const style = getComputedStyle(document.querySelector(selector))
    return { background: style.backgroundColor, color: style.color }
  }
  return {
    status: read('.editor-status-row'),
    chapterPanel: read('.chapter-panel'),
    activeChapter: read('.chapter-row.active'),
    toolbar: read('.writing-toolbar'),
    paper: read('.paper'),
    title: read('.chapter-title-input'),
    manuscript: read('.manuscript'),
    statusbar: read('.editor-statusbar'),
  }
})
if (
  [darkEditorStyles.status, darkEditorStyles.chapterPanel, darkEditorStyles.activeChapter, darkEditorStyles.toolbar, darkEditorStyles.paper, darkEditorStyles.statusbar]
    .some(({ background }) => colorLuminance(background) >= 0.25)
  || colorContrast(darkEditorStyles.title.color, darkEditorStyles.paper.background) < 4.5
  || colorContrast(darkEditorStyles.manuscript.color, darkEditorStyles.paper.background) < 4.5
  || colorContrast(darkEditorStyles.activeChapter.color, darkEditorStyles.activeChapter.background) < 4.5
) {
  throw new Error(`chapter editor does not adapt to dark theme: ${JSON.stringify(darkEditorStyles)}`)
}
await page.screenshot({ path: 'qa/desktop-editor-dark.png', fullPage: true })

await page.getByRole('button', { name: '打开章节 AI 助手' }).click()
const darkAiPanel = page.getByRole('dialog', { name: '章节 AI 助手' })
await darkAiPanel.waitFor()
const darkAiStyles = await darkAiPanel.evaluate((element) => {
  const read = (selector) => {
    const style = getComputedStyle(element.querySelector(selector))
    return { background: style.backgroundColor, color: style.color }
  }
  const panelStyle = getComputedStyle(element)
  return {
    panel: { background: panelStyle.backgroundColor, color: panelStyle.color },
    header: read('.ai-panel-head'),
    title: read('.ai-panel-head strong'),
    composer: read('.ai-composer'),
    textarea: read('.ai-composer textarea'),
  }
})
if (
  [darkAiStyles.panel, darkAiStyles.header, darkAiStyles.composer].some(({ background }) => colorLuminance(background) >= 0.25)
  || colorContrast(darkAiStyles.title.color, darkAiStyles.header.background) < 4.5
  || colorContrast(darkAiStyles.textarea.color, darkAiStyles.composer.background) < 4.5
) {
  throw new Error(`AI panel does not adapt to dark theme: ${JSON.stringify(darkAiStyles)}`)
}
await page.screenshot({ path: 'qa/desktop-ai-dark.png', fullPage: true })
await darkAiPanel.getByRole('button', { name: '关闭章节 AI 助手' }).click()

await page.locator('.status-target-button').click()
const darkChapterDialog = page.locator('.chapter-settings-dialog')
await darkChapterDialog.waitFor()
const darkDialogStyles = await darkChapterDialog.evaluate((element) => {
  const style = getComputedStyle(element)
  const title = getComputedStyle(element.querySelector('h2'))
  return { background: style.backgroundColor, titleColor: title.color }
})
if (colorLuminance(darkDialogStyles.background) >= 0.25 || colorContrast(darkDialogStyles.titleColor, darkDialogStyles.background) < 4.5) {
  throw new Error(`chapter dialog does not adapt to dark theme: ${JSON.stringify(darkDialogStyles)}`)
}
await page.screenshot({ path: 'qa/desktop-dialog-dark.png', fullPage: true })
await darkChapterDialog.getByRole('button', { name: '关闭' }).click()

await page.getByRole('button', { name: '设置', exact: true }).click()
await page.getByLabel('界面主题').waitFor()
await page.getByLabel('界面主题').selectOption('light')
await page.locator(':root[data-theme="light"]').waitFor()

await page.setViewportSize({ width: 390, height: 844 })
await page.locator('.settings-page').evaluate((element) => { element.scrollTop = 0 })
const mobileSettingsLayout = await page.evaluate(() => {
  const rect = (selector) => {
    const box = document.querySelector(selector)?.getBoundingClientRect()
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null
  }
  return {
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    providerGrid: rect('.provider-choice-grid'),
    providerChoice: rect('.provider-choice'),
    config: rect('.provider-config'),
    confirmButton: rect('.model-confirm-button'),
    selectedText: document.querySelector('.provider-choice.current.selected .provider-choice-state')?.textContent,
  }
})
if (
  mobileSettingsLayout.pageWidth > mobileSettingsLayout.viewportWidth
  || !mobileSettingsLayout.providerGrid
  || !mobileSettingsLayout.providerChoice
  || Math.round(mobileSettingsLayout.providerGrid.width) !== Math.round(mobileSettingsLayout.providerChoice.width)
  || !mobileSettingsLayout.config
  || !mobileSettingsLayout.confirmButton
  || !mobileSettingsLayout.selectedText?.includes('当前使用')
) {
  throw new Error(`mobile settings layout is invalid: ${JSON.stringify(mobileSettingsLayout)}`)
}
await page.screenshot({ path: 'qa/mobile-settings.png', fullPage: true })
await page.locator('.model-settings-actions').scrollIntoViewIfNeeded()
const mobileSettingsActionBox = await page.locator('.model-settings-actions').boundingBox()
if (!mobileSettingsActionBox || mobileSettingsActionBox.x < 0 || mobileSettingsActionBox.x + mobileSettingsActionBox.width > 390) {
  throw new Error(`mobile model actions overflow the viewport: ${JSON.stringify(mobileSettingsActionBox)}`)
}
await page.screenshot({ path: 'qa/mobile-settings-actions.png', fullPage: true })
await page.getByRole('button', { name: '打开导航' }).click()
const mobileSidebarBox = await page.locator('.sidebar').boundingBox()
const mobileLandscapeBox = await page.locator('.sidebar-landscape').boundingBox()
const mobileNavigationBox = await page.locator('.main-nav').boundingBox()
const navigationAnimations = await page.evaluate(() => document.getAnimations().length)
if (
  !mobileSidebarBox
  || mobileSidebarBox.x !== 0
  || mobileSidebarBox.width < 250
  || !mobileLandscapeBox
  || !mobileNavigationBox
  || ['x', 'y', 'width', 'height'].some((key) => Math.round(mobileLandscapeBox[key]) !== Math.round(mobileNavigationBox[key]))
  || navigationAnimations
) {
  throw new Error(`mobile navigation is not fully covered and static: ${JSON.stringify({ mobileSidebarBox, mobileLandscapeBox, mobileNavigationBox, navigationAnimations })}`)
}
await page.screenshot({ path: 'qa/mobile-navigation.png', fullPage: true })
await page.getByRole('button', { name: '大纲' }).click()
await page.waitForTimeout(250)
await page.getByLabel('章节标题').waitFor()
await page.screenshot({ path: 'qa/mobile-editor.png', fullPage: true })

const mobileAiTrigger = page.getByRole('button', { name: '打开章节 AI 助手' })
const mobileAiTriggerBox = await mobileAiTrigger.boundingBox()
if (!mobileAiTriggerBox || mobileAiTriggerBox.width < 44 || mobileAiTriggerBox.height < 44) {
  throw new Error(`mobile AI launcher is too small: ${JSON.stringify(mobileAiTriggerBox)}`)
}
await mobileAiTrigger.click()
const mobileAiPanel = page.getByRole('dialog', { name: '章节 AI 助手' })
const mobileAiPanelBox = await mobileAiPanel.boundingBox()
const mobileAiComposerBox = await mobileAiPanel.locator('.ai-composer').boundingBox()
const mobileAiPanelStyle = await mobileAiPanel.evaluate((element) => {
  const style = getComputedStyle(element)
  return {
    position: style.position,
    documentWidth: document.documentElement.scrollWidth,
    draggable: element.getAttribute('data-draggable'),
    modal: element.getAttribute('aria-modal'),
  }
})
if (
  !mobileAiPanelBox
  || mobileAiPanelBox.x < 0
  || mobileAiPanelBox.x + mobileAiPanelBox.width > 390
  || mobileAiPanelBox.y < 0
  || mobileAiPanelBox.y + mobileAiPanelBox.height > 844
  || !mobileAiComposerBox
  || mobileAiComposerBox.y + mobileAiComposerBox.height > mobileAiPanelBox.y + mobileAiPanelBox.height
  || !(await page.locator('.ai-panel-scrim').isVisible())
  || mobileAiPanelStyle.position !== 'fixed'
  || mobileAiPanelStyle.documentWidth > 390
  || mobileAiPanelStyle.draggable !== 'false'
  || mobileAiPanelStyle.modal !== 'true'
  || await mobileAiPanel.getByRole('button', { name: '拖动 AI 面板' }).isVisible()
  || Math.abs(mobileAiPanelBox.x) > 1
  || Math.abs(mobileAiPanelBox.width - 390) > 1
  || Math.abs(mobileAiPanelBox.y + mobileAiPanelBox.height - 844) > 1
) {
  throw new Error(`mobile AI panel overflows the viewport: ${JSON.stringify({ mobileAiPanelBox, mobileAiComposerBox, mobileAiPanelStyle })}`)
}
const mobileAiHeadBox = await mobileAiPanel.locator('.ai-panel-head').boundingBox()
if (!mobileAiHeadBox) throw new Error('mobile AI panel header is missing')
await page.mouse.move(mobileAiHeadBox.x + mobileAiHeadBox.width / 2, mobileAiHeadBox.y + mobileAiHeadBox.height / 2)
await page.mouse.down()
await page.mouse.move(40, Math.max(20, mobileAiHeadBox.y - 100), { steps: 5 })
await page.mouse.up()
const mobileAiPanelAfterDragAttempt = await mobileAiPanel.boundingBox()
if (
  !mobileAiPanelAfterDragAttempt
  || ['x', 'y', 'width', 'height'].some((key) => Math.abs(mobileAiPanelAfterDragAttempt[key] - mobileAiPanelBox[key]) > 1)
) {
  throw new Error(`mobile AI bottom sheet should not be draggable: ${JSON.stringify({ mobileAiPanelBox, mobileAiPanelAfterDragAttempt })}`)
}
await page.screenshot({ path: 'qa/mobile-ai-takeover.png', fullPage: true })
await mobileAiPanel.getByRole('button', { name: '关闭章节 AI 助手' }).click()

const layout = await page.evaluate(() => {
  const exportIcon = document.querySelector('.chapter-action-menu summary svg:first-of-type')
  const exportIconBox = exportIcon?.getBoundingClientRect()
  const exportIconStyle = exportIcon ? getComputedStyle(exportIcon) : null
  return ({
  viewportWidth: document.documentElement.clientWidth,
  pageWidth: document.documentElement.scrollWidth,
  title: document.title,
  chapters: document.querySelectorAll('.chapter-row').length,
  progressWidth: document.querySelector('.generation-progress span')?.getAttribute('style'),
  inlineOutlineCount: document.querySelectorAll('.chapter-summary-input').length,
  unwantedMotionNodes: document.querySelectorAll('.ink-motion-canvas, .taiji-click-effect, .motion-page, .motion-hovering').length,
  activeAnimations: document.getAnimations().length,
  hasInkHeader: getComputedStyle(document.querySelector('.topbar')).backgroundImage.includes('design-header'),
  hasInkPaper: document.querySelectorAll('.paper-decoration').length === 3,
  mobileHasBamboo: getComputedStyle(document.querySelector('.paper-bamboo-art')).display !== 'none',
  mobileExportIconVisible: getComputedStyle(document.querySelector('.chapter-action-menu summary svg:first-of-type')).display !== 'none',
  mobileExportIconBox: exportIconBox ? { x: exportIconBox.x, y: exportIconBox.y, width: exportIconBox.width, height: exportIconBox.height } : null,
  mobileExportIconStyle: exportIconStyle ? { color: exportIconStyle.color, opacity: exportIconStyle.opacity, visibility: exportIconStyle.visibility } : null,
  })
})

await page.waitForTimeout(700)
await page.setViewportSize({ width: 1474, height: 1067 })
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: '设置', exact: true }).click()
const persistedKimiChoice = page.getByRole('radio', { name: /Kimi/ })
await persistedKimiChoice.waitFor()
if (await persistedKimiChoice.getAttribute('aria-checked') !== 'true' || !(await persistedKimiChoice.innerText()).includes('当前使用')) {
  throw new Error('confirmed provider selection did not persist after reload')
}
const persistedProviderConfig = page.locator('.provider-config')
if (
  await persistedProviderConfig.getByLabel('接口地址').inputValue() !== 'http://127.0.0.1:4174/v1'
  || await persistedProviderConfig.getByLabel('API Key').inputValue() !== 'test-key'
) {
  throw new Error('confirmed provider credentials did not persist after reload')
}

await browser.close()
mockServer.close()

const kimiRequests = capturedRequests.filter(({ payload }) => payload.model === 'kimi-k2.6')
const invalidKimiRequest = kimiRequests.find(({ url, payload }) => (
  url !== '/v1/chat/completions'
  || 'temperature' in payload
  || payload.max_tokens < 16000
  || payload.thinking?.type !== 'enabled'
))
const takeoverRequests = capturedRequests.filter(({ payload }) => payload.messages?.at(-1)?.content?.includes('章节接管修订'))
const invalidTakeoverRequest = takeoverRequests.find(({ payload }) => {
  const prompt = payload.messages.at(-1).content
  const systemPrompt = payload.messages?.[0]?.content || ''
  return !prompt.includes('<original_chapter>')
    || !prompt.includes(originalChapterContent)
    || !prompt.includes('强化仓库内的压迫感和章末钩子')
    || !systemPrompt.includes('当前是写作执行模式')
})
const chatRequests = capturedRequests.filter(({ payload }) => ['你好', advicePrompt, '谢谢'].includes(payload.messages?.at(-1)?.content))
const invalidChatRequest = chatRequests.find(({ payload }) => {
  const prompt = payload.messages.at(-1).content
  const systemPrompt = payload.messages?.[0]?.content || ''
  return prompt.includes('章节接管修订') || prompt.includes('<original_chapter>') || !systemPrompt.includes('当前是对话协作模式')
})
if (!kimiRequests.length || invalidKimiRequest) {
  console.error(JSON.stringify({ error: 'Kimi thinking request is not compliant with the official guide', kimiRequests, invalidKimiRequest }, null, 2))
  process.exit(1)
}
if (takeoverRequests.length < 2 || invalidTakeoverRequest) {
  console.error(JSON.stringify({ error: 'chapter takeover prompt is incomplete', takeoverRequests: takeoverRequests.length, invalidTakeoverRequest }, null, 2))
  process.exit(1)
}
if (chatRequests.length !== 3 || invalidChatRequest) {
  console.error(JSON.stringify({ error: 'normal conversation was routed into chapter revision', chatRequests: chatRequests.length, invalidChatRequest }, null, 2))
  process.exit(1)
}

if (errors.length) {
  console.error(JSON.stringify({ errors, layout }, null, 2))
  process.exit(1)
}
if (layout.pageWidth > layout.viewportWidth || layout.chapters !== 3 || layout.inlineOutlineCount || layout.unwantedMotionNodes || layout.activeAnimations || !layout.hasInkHeader || !layout.hasInkPaper || layout.mobileHasBamboo || !layout.mobileExportIconVisible || layout.mobileExportIconBox?.width !== 14 || layout.mobileExportIconBox?.height !== 14) {
  console.error(JSON.stringify({ error: 'layout or generation assertion failed', layout }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, errors, layout }, null, 2))
