import { fetchSSE } from '../../utils/fetch-sse.mjs'
import { getConversationPairs } from '../../utils/get-conversation-pairs.mjs'
import { isEmpty } from 'lodash-es'
import { getCompletionPromptBase, pushRecord, setAbortController } from './shared.mjs'
import { getChatCompletionsTokenParams } from './openai-token-params.mjs'

function buildHeaders(apiKey, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

function buildMessageAnswer(answer, data, allowLegacyResponseField) {
  if (allowLegacyResponseField && typeof data?.response === 'string' && data.response) {
    return data.response
  }

  const delta = data?.choices?.[0]?.delta?.content
  const content = data?.choices?.[0]?.message?.content
  const text = data?.choices?.[0]?.text
  if (typeof delta === 'string') return answer + delta
  if (typeof content === 'string' && content) return content
  if (typeof text === 'string' && text) return answer + text
  return answer
}

function hasFinished(data) {
  return Boolean(data?.choices?.[0]?.finish_reason)
}

/**
 * @param {object} params
 * @param {Browser.Runtime.Port} params.port
 * @param {string} params.question
 * @param {Session} params.session
 * @param {'chat'|'completion'} params.endpointType
 * @param {string} params.requestUrl
 * @param {string} params.model
 * @param {string} params.apiKey
 * @param {UserConfig} params.config
 * @param {string} [params.provider]
 * @param {Record<string, any>} [params.extraBody]
 * @param {Record<string, string>} [params.extraHeaders]
 * @param {boolean} [params.allowLegacyResponseField]
 */
export async function generateAnswersWithOpenAICompatible({
  port,
  question,
  session,
  endpointType,
  requestUrl,
  model,
  apiKey,
  config,
  provider = 'compat',
  extraBody = {},
  extraHeaders = {},
  allowLegacyResponseField = false,
}) {
  const { controller, messageListener, disconnectListener } = setAbortController(port)

  let requestBody
  const conversationRecords = Array.isArray(session.conversationRecords)
    ? session.conversationRecords
    : []
  session.conversationRecords = conversationRecords
  if (endpointType === 'completion') {
    const prompt =
      (await getCompletionPromptBase()) +
      getConversationPairs(conversationRecords.slice(-config.maxConversationContextLength), true) +
      `Human: ${question}\nAI: `
    requestBody = {
      prompt,
      model,
      stream: true,
      max_tokens: config.maxResponseTokenLength,
      temperature: config.temperature,
      stop: '\nHuman',
      ...extraBody,
    }
  } else {
    const messages = getConversationPairs(
      conversationRecords.slice(-config.maxConversationContextLength),
      false,
    )
    messages.push({ role: 'user', content: question })
    const tokenParams = getChatCompletionsTokenParams(
      provider,
      model,
      config.maxResponseTokenLength,
    )
    const conflictingTokenParamKey =
      'max_completion_tokens' in tokenParams ? 'max_tokens' : 'max_completion_tokens'
    const safeExtraBody = { ...extraBody }
    delete safeExtraBody[conflictingTokenParamKey]
    requestBody = {
      messages,
      model,
      stream: true,
      ...tokenParams,
      temperature: config.temperature,
      ...safeExtraBody,
    }
  }

  let answer = ''
  let finished = false

  // Reasoning/thinking state (mirrors the reasoning handling that used to live in
  // generateAnswersWithOpenAiApiCompat, see src/services/apis/openai-api.mjs).
  // Only kicks in once a delta actually carries a `reasoning_content` key, so
  // providers that never send it keep using the plain `answer`/`done` message shape.
  let hasReasoning = false
  let reasoning = ''
  let actualContent = ''
  const startTime = Date.now()
  let lastProgressTime = 0

  const finish = () => {
    if (finished) return
    finished = true
    if (hasReasoning) {
      // Flush a final content_update with isThinking:false, mirroring the shape of the
      // streaming content_update messages above. This is required even when no content
      // delta was ever received (e.g. finish_reason during thinking, or a refusal) so the
      // UI's ThinkingBlock is never left stuck in the "thinking" state, and it also flushes
      // any reasoning tail that the throttled thinking_update messages haven't sent yet.
      const currentTime = Date.now() - startTime
      const displayAnswer = reasoning
        ? `> ${reasoning.split('\n').join('\n> ')}\n\n${actualContent}`
        : actualContent
      port.postMessage({
        type: 'content_update',
        answer: displayAnswer,
        actualContent: actualContent,
        reasoningContent: reasoning,
        thinkingTime: currentTime,
        isThinking: false,
        done: false,
        session: null,
      })
    }
    pushRecord(session, question, hasReasoning ? actualContent : answer)
    port.postMessage({ answer: null, done: true, session: session })
  }

  await fetchSSE(requestUrl, {
    method: 'POST',
    signal: controller.signal,
    headers: buildHeaders(apiKey, extraHeaders),
    body: JSON.stringify(requestBody),
    onMessage(message) {
      if (finished) return
      if (message.trim() === '[DONE]') {
        finish()
        return
      }
      let data
      try {
        data = JSON.parse(message)
      } catch (error) {
        console.debug('json error', error)
        return
      }

      const reasoningContent = data?.choices?.[0]?.delta?.reasoning_content
      // Only a non-empty string actually signals reasoning is happening. An empty string (some
      // providers send `reasoning_content: ""` as a placeholder before real reasoning starts, or
      // never at all) or null must not flip hasReasoning, since that flag is sticky in the UI and
      // would otherwise leave a permanent empty thinking block.
      if (typeof reasoningContent === 'string' && reasoningContent !== '') {
        hasReasoning = true
        reasoning += reasoningContent
        const currentTime = Date.now() - startTime
        if (currentTime - lastProgressTime > 500 || reasoning.length < 100) {
          lastProgressTime = currentTime
          port.postMessage({
            type: 'thinking_update',
            answer: `> ${reasoning.split('\n').join('\n> ')}`,
            reasoningContent: reasoning,
            thinkingTime: currentTime,
            isThinking: true,
            done: false,
            session: null,
          })
        }
      }

      if (hasReasoning) {
        const content = data?.choices?.[0]?.delta?.content
        if (content !== undefined && content !== null) {
          actualContent += content
          const currentTime = Date.now() - startTime
          const displayAnswer = reasoning
            ? `> ${reasoning.split('\n').join('\n> ')}\n\n${actualContent}`
            : actualContent
          port.postMessage({
            type: 'content_update',
            answer: displayAnswer,
            actualContent: actualContent,
            reasoningContent: reasoning,
            thinkingTime: currentTime,
            isThinking: false,
            done: false,
            session: null,
          })
        }
      } else {
        answer = buildMessageAnswer(answer, data, allowLegacyResponseField)
        port.postMessage({ answer: answer, done: false, session: null })
      }

      if (hasFinished(data)) {
        finish()
      }
    },
    async onStart() {},
    async onEnd() {
      if (!finished) {
        finish()
      }
      port.onMessage.removeListener(messageListener)
      port.onDisconnect.removeListener(disconnectListener)
    },
    async onError(resp) {
      port.onMessage.removeListener(messageListener)
      port.onDisconnect.removeListener(disconnectListener)
      if (resp instanceof Error) throw resp
      const error = await resp.json().catch(() => ({}))
      throw new Error(!isEmpty(error) ? JSON.stringify(error) : `${resp.status} ${resp.statusText}`)
    },
  })
}
