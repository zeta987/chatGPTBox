/* global chrome */

// api version

import { getUserConfig } from '../../config/index.mjs'
import { fetchSSE } from '../../utils/fetch-sse.mjs'
import { getConversationPairs } from '../../utils/get-conversation-pairs.mjs'
import { isEmpty } from 'lodash-es'
import { getCompletionPromptBase, pushRecord, setAbortController } from './shared.mjs'
import { getModelValue } from '../../utils/model-name-convert.mjs'

/**
 * @param {Browser.Runtime.Port} port
 * @param {string} question
 * @param {Session} session
 * @param {string} apiKey
 */
export async function generateAnswersWithGptCompletionApi(port, question, session, apiKey) {
  const { controller, messageListener, disconnectListener } = setAbortController(port)
  const model = getModelValue(session)

  const config = await getUserConfig()
  const prompt =
    (await getCompletionPromptBase()) +
    getConversationPairs(
      session.conversationRecords.slice(-config.maxConversationContextLength),
      true,
    ) +
    `Human: ${question}\nAI: `
  const apiUrl = config.customOpenAiApiUrl

  let answer = ''
  let finished = false
  const finish = () => {
    finished = true
    pushRecord(session, question, answer)
    console.debug('conversation history', { content: session.conversationRecords })
    port.postMessage({ answer: null, done: true, session: session })
  }

  const body = {
    prompt: prompt,
    model,
    stream: true,
    temperature: config.temperature,
    stop: '\nHuman',
  }
  if (config.maxResponseTokenLength < 40000) {
    body.max_tokens = config.maxResponseTokenLength
  }

  await fetchSSE(`${apiUrl}/v1/completions`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    onMessage(message) {
      console.debug('sse message', message)
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

      answer += data.choices[0].text
      port.postMessage({ answer: answer, done: false, session: null })

      if (data.choices[0]?.finish_reason) {
        finish()
        return
      }
    },
    async onStart() {},
    async onEnd() {
      port.postMessage({ done: true })
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

/**
 * @param {Browser.Runtime.Port} port
 * @param {string} question
 * @param {Session} session
 * @param {string} apiKey
 */
export async function generateAnswersWithChatgptApi(port, question, session, apiKey) {
  const config = await getUserConfig()
  return generateAnswersWithChatgptApiCompat(
    config.customOpenAiApiUrl + '/v1',
    port,
    question,
    session,
    apiKey,
  )
}

export async function generateAnswersWithChatgptApiCompat(
  baseUrl,
  port,
  question,
  session,
  apiKey,
  extraBody = {},
) {
  const { controller, messageListener, disconnectListener } = setAbortController(port)
  const model = getModelValue(session)

  const config = await getUserConfig()
  const prompt = getConversationPairs(
    session.conversationRecords.slice(-config.maxConversationContextLength),
    false,
  )
  prompt.push({ role: 'user', content: question })

  let answer = '' // 用於顯示的完整內容（包含思考標記）
  let actualContent = '' // 用於保存的實際內容（不包含思考標記）
  let reasoning = ''
  let isReasoning = true
  let finished = false

  let startTime = Date.now()
  let lastProgressTime = 0 // 記錄上次發送進度的時間

  // 添加保活機制
  const keepAlive = (() => {
    let interval
    return (state) => {
      if (state && !interval) {
        interval = setInterval(() => {
          chrome.runtime.getPlatformInfo(() => {})
        }, 20000)
      } else if (!state && interval) {
        clearInterval(interval)
        interval = null
      }
    }
  })()

  const finish = () => {
    finished = true
    pushRecord(session, question, actualContent)
    console.debug('conversation history', { content: session.conversationRecords })
    port.postMessage({ answer: null, done: true, session: session })
    keepAlive(false) // 停止保活
  }

  const baseBody = {
    messages: prompt,
    model,
    stream: true,
    temperature: config.temperature,
    ...extraBody,
  }
  if (config.maxResponseTokenLength < 40000) {
    baseBody.max_tokens = config.maxResponseTokenLength
  }

  try {
    keepAlive(true)
    startTime = Date.now()

    await fetchSSE(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(baseBody),
      onMessage(message) {
        console.debug('sse message', message)
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

        const delta = data.choices[0]?.delta
        const reasoningContent = delta?.reasoning_content
        const content = delta?.content

        if (reasoningContent !== undefined) {
          if (reasoningContent !== null) {
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
        }

        if (content !== undefined) {
          if (content !== null) {
            actualContent += content
            const currentTime = Date.now() - startTime

            if (isReasoning && reasoning) {
              answer = `> ${reasoning.split('\n').join('\n> ')}\n\n${actualContent}`
              isReasoning = false
            } else if (isReasoning && !reasoning) {
              answer = actualContent
              isReasoning = false
            } else {
              if (reasoning) {
                answer = `> ${reasoning.split('\n').join('\n> ')}\n\n${actualContent}`
              } else {
                answer = actualContent
              }
            }

            port.postMessage({
              type: 'content_update',
              answer: answer,
              actualContent: actualContent,
              reasoningContent: reasoning,
              thinkingTime: currentTime,
              isThinking: false,
              done: false,
              session: null,
            })
          }
        }

        if (data.choices[0]?.finish_reason) {
          finish()
          return
        }
      },
      async onStart() {},
      async onEnd() {
        port.postMessage({ done: true })
        port.onMessage.removeListener(messageListener)
        port.onDisconnect.removeListener(disconnectListener)
        keepAlive(false) // 停止保活
      },
      async onError(resp) {
        port.onMessage.removeListener(messageListener)
        port.onDisconnect.removeListener(disconnectListener)
        keepAlive(false) // 停止保活

        if (resp.name === 'AbortError') {
          console.log('Request was aborted, this is normal when switching conversations')
          return
        }

        if (resp instanceof Error) throw resp
        const error = await resp.json().catch(() => ({}))
        throw new Error(
          !isEmpty(error) ? JSON.stringify(error) : `${resp.status} ${resp.statusText}`,
        )
      },
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Connection was aborted, this is normal when closing the chat')
      return
    }

    console.error('Error in generateAnswersWithChatgptApiCompat:', error)
    keepAlive(false) // 確保在出錯時也停止保活
    throw error
  }
}
