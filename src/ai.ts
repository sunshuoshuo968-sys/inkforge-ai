import type { AiMessage, AiNovelPlan, AiNovelRequest, AiProvider, NovelProject } from './types'

type AiInteractionMode = 'chat' | 'revision'

interface StreamOptions {
  provider: AiProvider
  project: NovelProject
  chapterTitle?: string
  chapterContent?: string
  chapterContextLimit?: number
  interactionMode?: AiInteractionMode
  messages: AiMessage[]
  signal?: AbortSignal
  onChunk: (text: string) => void
}

interface CompleteOptions {
  provider: AiProvider
  project: NovelProject
  prompt: string
  signal?: AbortSignal
}

const trimSlash = (value: string) => value.replace(/\/+$/, '')

const chatCompletionsUrl = (provider: AiProvider) => {
  const baseUrl = trimSlash(provider.baseUrl.trim())
  if (/\/chat\/completions$/i.test(baseUrl)) return baseUrl
  if (/\/v1$/i.test(baseUrl)) return `${baseUrl}/chat/completions`
  return `${baseUrl}/v1/chat/completions`
}

const modelOptions = (provider: AiProvider, temperature: number) => {
  const model = provider.model.trim().toLowerCase()
  if (provider.id !== 'kimi') return { temperature }
  if (model === 'kimi-k3') return { max_tokens: 32768, reasoning_effort: 'max' }
  if (model === 'kimi-k2.7-code' || model === 'kimi-k2.7-code-highspeed') return { max_tokens: 32768 }
  if (model === 'kimi-k2.6' || model === 'kimi-k2.5') {
    return { max_tokens: 32768, thinking: { type: 'enabled' } }
  }
  return { temperature }
}

const requestHeaders = (provider: AiProvider) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${provider.apiKey.trim()}`,
})

const assertProvider = (provider: AiProvider) => {
  if (!provider.apiKey.trim()) throw new Error(`请先在设置中填写 ${provider.name} API Key`)
  if (!provider.baseUrl.trim() || !provider.model.trim()) throw new Error('AI 接口地址和模型名称不能为空')
}

const chapterExcerpt = (content: string, limit: number) => {
  if (!content) return '暂无'
  if (content.length <= limit) return content
  const headLength = Math.floor(limit * .58)
  const tailLength = limit - headLength
  return `${content.slice(0, headLength)}\n\n【中段因上下文长度省略】\n\n${content.slice(-tailLength)}`
}

const buildSystemPrompt = (
  project: NovelProject,
  chapterTitle = '',
  chapterContent = '',
  chapterContextLimit = 6000,
  interactionMode: AiInteractionMode = 'chat',
) => {
  const characters = project.characters
    .map((item) => `${item.name}（${item.role || '角色'}）：${item.description || item.motivation}`)
    .join('\n')
  const world = project.worldNotes.map((item) => `${item.title}：${item.content}`).join('\n')
  const plots = project.plotNotes.map((item) => `${item.title}：${item.content}`).join('\n')
  const outline = project.chapters.map((item, index) => `第${index + 1}章 ${item.title}：${item.summary}`).join('\n')
  const orderedMemories = [...(project.memories ?? [])].sort((left, right) => (
    Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt
  ))
  const memoryLines: string[] = []
  let memoryLength = 0
  for (const item of orderedMemories) {
    const line = `[${item.category}] ${item.title}：${item.content}`
    if (memoryLength + line.length > 7000) continue
    memoryLines.push(line)
    memoryLength += line.length
  }
  const interactionRules = interactionMode === 'chat'
    ? '当前是对话协作模式。对寒暄自然回应；对分析、评价和“怎么改”等咨询只给具体建议，不主动输出整章改稿、不声称已经修改正文。用户意图不明确时先正常回答或询问，不擅自执行写作。'
    : '当前是写作执行模式。严格执行最后一条写作或修订要求，只输出用户要求的正文结果，不输出寒暄、解释、报告或 Markdown。'

  return `你是专业的中文网络小说创作引擎，严格执行作者给出的创意、设定、大纲和质量工作流。
作品：${project.title}
类型：${project.genre}
简介：${project.synopsis || '暂无'}
当前章节：${chapterTitle || '未指定'}
已有正文：${chapterExcerpt(chapterContent, Math.max(1000, chapterContextLimit))}
角色资料：\n${characters || '暂无'}
世界观：\n${world || '暂无'}
情节资料：\n${plots || '暂无'}
长期记忆（置顶与最近记录）：\n${memoryLines.join('\n') || '暂无'}
全书章节大纲：\n${outline || '暂无'}

保持人物口吻、时间线和设定一致。分析时结论必须具体、可执行。
${interactionRules}`
}

const stripJsonFence = (value: string) => value
  .trim()
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/, '')

const normalizePlan = (value: string, request: AiNovelRequest): AiNovelPlan => {
  let parsed: Partial<AiNovelPlan>
  try {
    parsed = JSON.parse(stripJsonFence(value)) as Partial<AiNovelPlan>
  } catch {
    const first = value.indexOf('{')
    const last = value.lastIndexOf('}')
    if (first < 0 || last <= first) throw new Error('模型没有返回可识别的小说计划，请重试')
    parsed = JSON.parse(value.slice(first, last + 1)) as Partial<AiNovelPlan>
  }
  if (!parsed.title || !parsed.synopsis || !Array.isArray(parsed.chapters) || !parsed.chapters.length) {
    throw new Error('模型返回的小说计划不完整，请重试')
  }
  const chapters = parsed.chapters.slice(0, request.chapterCount).map((item, index) => ({
    title: typeof item?.title === 'string' ? item.title : `第${index + 1}章`,
    summary: typeof item?.summary === 'string' ? item.summary : '',
    goal: typeof item?.goal === 'string' ? item.goal : '',
    obstacle: typeof item?.obstacle === 'string' ? item.obstacle : '',
    cost: typeof item?.cost === 'string' ? item.cost : '',
    strand: item?.strand,
    hook: typeof item?.hook === 'string' ? item.hook : '',
  }))
  while (chapters.length < request.chapterCount) {
    chapters.push({
      title: `第${chapters.length + 1}章`, summary: '承接前文并推动核心冲突。', goal: '', obstacle: '', cost: '', strand: undefined, hook: '',
    })
  }
  return {
    title: String(parsed.title),
    genre: String(parsed.genre || request.genre),
    synopsis: String(parsed.synopsis),
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    world: Array.isArray(parsed.world) ? parsed.world : [],
    plot: Array.isArray(parsed.plot) ? parsed.plot : [],
    chapters,
  }
}

export const generateNovelPlan = async (provider: AiProvider, request: AiNovelRequest, signal?: AbortSignal): Promise<AiNovelPlan> => {
  assertProvider(provider)
  const prompt = `执行“大纲规划”工作流，根据下面的需求设计一部可以直接逐章生成的中文网络小说。

核心创意：${request.idea}
类型：${request.genre || '由你判断'}
计划章数：严格为 ${request.chapterCount} 章
每章目标：约 ${request.wordsPerChapter} 字
文风：${request.style}
额外要求：${request.constraints || '无'}

先在内部完成：设定基线；承诺→至少三次危机递增→中段反转→最低谷→高潮兑现的节拍；单调递增的时间线；Quest 主线 55-65%、Fire 情感线 20-30%、Constellation 世界/谜团线 10-20% 的交织。
每章必须具备具体事件、目标、阻力、代价、可感知变化和章末未闭合问题。最后 3-5 章集中兑现核心冲突，不能用概述代替章纲。

只输出一个 JSON 对象，不要 Markdown 或解释：
{"title":"书名","genre":"类型","synopsis":"完整故事简介","characters":[{"name":"姓名","role":"定位","description":"人物小传","motivation":"核心欲望","conflict":"内外冲突","tags":["标签"]}],"world":[{"title":"设定名","category":"地点/规则/历史/势力/物件","content":"详细设定"}],"plot":[{"title":"情节名","category":"主线/支线/伏笔/转折/结局","content":"详细说明"}],"chapters":[{"title":"章节名","summary":"具体事件与转折","goal":"目标","obstacle":"阻力","cost":"代价","strand":"Quest/Fire/Constellation","hook":"章末钩子"}]}`

  const payload = {
    model: provider.model.trim(),
    ...modelOptions(provider, 0.75),
    messages: [
      { role: 'system', content: '你是资深中文网文总编，擅长把一个创意扩展成结构严密、可逐章执行的完整小说方案。' },
      { role: 'user', content: prompt },
    ],
  }
  const sendRequest = (jsonMode: boolean) => fetch(chatCompletionsUrl(provider), {
    method: 'POST',
    headers: requestHeaders(provider),
    body: JSON.stringify(jsonMode ? { ...payload, response_format: { type: 'json_object' } } : payload),
    signal,
  })

  let response = await sendRequest(true)
  if (!response.ok && response.status === 400) response = await sendRequest(false)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`规划生成失败（${response.status}）：${body.slice(0, 180) || response.statusText}`)
  }
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = result.choices?.[0]?.message?.content
  if (!content) throw new Error('模型没有返回小说计划')
  return normalizePlan(content, request)
}

export const completeChat = async ({ provider, project, prompt, signal }: CompleteOptions) => {
  assertProvider(provider)
  const response = await fetch(chatCompletionsUrl(provider), {
    method: 'POST',
    headers: requestHeaders(provider),
    body: JSON.stringify({
      model: provider.model.trim(),
      ...modelOptions(provider, 0.25),
      messages: [
        { role: 'system', content: buildSystemPrompt(project) },
        { role: 'user', content: prompt },
      ],
    }),
    signal,
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`审稿请求失败（${response.status}）：${body.slice(0, 180) || response.statusText}`)
  }
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  return result.choices?.[0]?.message?.content?.trim() || '未发现明确问题。'
}

export const streamChat = async ({
  provider,
  project,
  chapterTitle,
  chapterContent,
  chapterContextLimit,
  interactionMode,
  messages,
  signal,
  onChunk,
}: StreamOptions) => {
  assertProvider(provider)
  const response = await fetch(chatCompletionsUrl(provider), {
    method: 'POST',
    headers: requestHeaders(provider),
    body: JSON.stringify({
      model: provider.model.trim(),
      stream: true,
      ...modelOptions(provider, 0.8),
      messages: [
        { role: 'system', content: buildSystemPrompt(project, chapterTitle, chapterContent, chapterContextLimit, interactionMode) },
        ...messages,
      ],
    }),
    signal,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`请求失败（${response.status}）：${body.slice(0, 180) || response.statusText}`)
  }
  if (!response.body) throw new Error('当前浏览器不支持流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const processLine = (rawLine: string) => {
    const line = rawLine.trim()
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
      const content = parsed.choices?.[0]?.delta?.content
      if (content) onChunk(content)
    } catch {
      // Compatible providers may emit non-JSON keepalive events.
    }
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const rawLine of lines) processLine(rawLine)
  }
  buffer += decoder.decode()
  if (buffer.trim()) for (const rawLine of buffer.split('\n')) processLine(rawLine)
}
