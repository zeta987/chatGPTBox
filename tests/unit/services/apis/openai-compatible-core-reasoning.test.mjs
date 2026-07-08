import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFakePort } from '../../helpers/port.mjs'
import { createMockSseResponse } from '../../helpers/sse-response.mjs'

import { generateAnswersWithOpenAICompatible } from '../../../../src/services/apis/openai-compatible-core.mjs'

const baseConfig = {
  maxConversationContextLength: 3,
  maxResponseTokenLength: 256,
  temperature: 0.5,
}

const makeSession = () => ({
  conversationRecords: [],
  isRetry: false,
})

test('generateAnswersWithOpenAICompatible emits thinking_update then content_update for providers that send reasoning_content', async (t) => {
  t.mock.method(console, 'debug', () => {})

  const session = makeSession()
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () =>
    createMockSseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"Let me "}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"think."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
    ]),
  )

  await generateAnswersWithOpenAICompatible({
    port,
    question: 'Q',
    session,
    endpointType: 'chat',
    requestUrl: 'https://api.example.com/v1/chat/completions',
    model: 'reasoner-model',
    apiKey: 'sk-test',
    config: baseConfig,
  })

  const thinkingMessages = port.postedMessages.filter((m) => m.type === 'thinking_update')
  assert.equal(thinkingMessages.length, 2)
  assert.equal(thinkingMessages[0].reasoningContent, 'Let me ')
  assert.equal(thinkingMessages[0].isThinking, true)
  assert.equal(thinkingMessages[0].done, false)
  assert.equal(thinkingMessages[0].session, null)
  assert.equal(thinkingMessages[1].reasoningContent, 'Let me think.')

  const contentMessages = port.postedMessages.filter((m) => m.type === 'content_update')
  // 2 streaming content_update messages, plus 1 final flush posted from finish() right before
  // the done message (mirrors the same shape, kept even though content already flowed so the
  // finish-path flush stays unconditional and simple).
  assert.equal(contentMessages.length, 3)
  assert.equal(contentMessages[0].actualContent, 'Hel')
  assert.equal(contentMessages[0].reasoningContent, 'Let me think.')
  assert.equal(contentMessages[0].answer, '> Let me think.\n\nHel')
  assert.equal(contentMessages[0].isThinking, false)
  assert.equal(contentMessages[1].actualContent, 'Hello')
  assert.equal(contentMessages[1].answer, '> Let me think.\n\nHello')
  assert.equal(contentMessages[2].actualContent, 'Hello')
  assert.equal(contentMessages[2].reasoningContent, 'Let me think.')
  assert.equal(contentMessages[2].answer, '> Let me think.\n\nHello')
  assert.equal(contentMessages[2].isThinking, false)
  assert.equal(contentMessages[2].done, false)
  assert.equal(contentMessages[2].session, null)

  // No plain-format messages should have been sent once reasoning kicked in.
  assert.equal(
    port.postedMessages.some((m) => !m.type && m.answer !== null && m.done === false),
    false,
  )

  const doneMessage = port.postedMessages.find((m) => m.done === true && m.session === session)
  assert.ok(doneMessage)
  assert.equal(doneMessage.answer, null)

  // The saved conversation record must hold the actual content, not the blockquoted display
  // text, and must persist the reasoning so ThinkingBlock survives a session reload.
  const record = session.conversationRecords.at(-1)
  assert.equal(record.question, 'Q')
  assert.equal(record.answer, 'Hello')
  assert.equal(typeof record.thinkingData.thinkingTime, 'number')
  assert.deepEqual(record.thinkingData, {
    reasoningContent: 'Let me think.',
    actualContent: 'Hello',
    thinkingTime: record.thinkingData.thinkingTime,
    hasReasoning: true,
    isThinking: false,
  })
})

test('generateAnswersWithOpenAICompatible keeps the plain answer/done message shape for providers without reasoning_content', async (t) => {
  t.mock.method(console, 'debug', () => {})

  const session = makeSession()
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () =>
    createMockSseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
    ]),
  )

  await generateAnswersWithOpenAICompatible({
    port,
    question: 'Q',
    session,
    endpointType: 'chat',
    requestUrl: 'https://api.example.com/v1/chat/completions',
    model: 'plain-model',
    apiKey: 'sk-test',
    config: baseConfig,
  })

  assert.equal(
    port.postedMessages.some((m) => m.type === 'thinking_update' || m.type === 'content_update'),
    false,
  )
  assert.equal(
    port.postedMessages.some((m) => m.answer === 'Hel' && m.done === false && m.session === null),
    true,
  )
  assert.equal(
    port.postedMessages.some((m) => m.answer === 'Hello' && m.done === false && m.session === null),
    true,
  )
  assert.deepEqual(port.postedMessages.at(-1), { answer: null, done: true, session })
  assert.deepEqual(session.conversationRecords.at(-1), { question: 'Q', answer: 'Hello' })
})

test('generateAnswersWithOpenAICompatible ignores null reasoning_content deltas without flipping hasReasoning', async (t) => {
  t.mock.method(console, 'debug', () => {})

  const session = makeSession()
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () =>
    createMockSseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":null}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\n',
    ]),
  )

  await generateAnswersWithOpenAICompatible({
    port,
    question: 'Q',
    session,
    endpointType: 'chat',
    requestUrl: 'https://api.example.com/v1/chat/completions',
    model: 'reasoner-model',
    apiKey: 'sk-test',
    config: baseConfig,
  })

  // A null reasoning_content delta must not flip hasReasoning (it isn't a real reasoning
  // signal), so the whole exchange must stay in the plain answer/done message shape.
  assert.equal(
    port.postedMessages.some((m) => m.type === 'thinking_update' || m.type === 'content_update'),
    false,
  )
  assert.equal(
    port.postedMessages.some((m) => m.answer === 'OK' && m.done === false && m.session === null),
    true,
  )
  assert.deepEqual(port.postedMessages.at(-1), { answer: null, done: true, session })
  assert.deepEqual(session.conversationRecords.at(-1), { question: 'Q', answer: 'OK' })
})

test('generateAnswersWithOpenAICompatible ignores empty-string reasoning_content deltas without flipping hasReasoning', async (t) => {
  t.mock.method(console, 'debug', () => {})

  const session = makeSession()
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () =>
    createMockSseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":""}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\n',
    ]),
  )

  await generateAnswersWithOpenAICompatible({
    port,
    question: 'Q',
    session,
    endpointType: 'chat',
    requestUrl: 'https://api.example.com/v1/chat/completions',
    model: 'reasoner-model',
    apiKey: 'sk-test',
    config: baseConfig,
  })

  // An empty-string reasoning_content placeholder must not flip hasReasoning either, otherwise
  // it would leave a permanent empty thinking block in the UI (hasReasoning is sticky there).
  assert.equal(
    port.postedMessages.some((m) => m.type === 'thinking_update' || m.type === 'content_update'),
    false,
  )
  assert.equal(
    port.postedMessages.some((m) => m.answer === 'OK' && m.done === false && m.session === null),
    true,
  )
  assert.deepEqual(port.postedMessages.at(-1), { answer: null, done: true, session })
  assert.deepEqual(session.conversationRecords.at(-1), { question: 'Q', answer: 'OK' })
})

test('generateAnswersWithOpenAICompatible flushes a final content_update when finish_reason arrives with reasoning but zero content deltas', async (t) => {
  t.mock.method(console, 'debug', () => {})

  const session = makeSession()
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () =>
    createMockSseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"Thinking about it."},"finish_reason":"length"}]}\n\n',
    ]),
  )

  await generateAnswersWithOpenAICompatible({
    port,
    question: 'Q',
    session,
    endpointType: 'chat',
    requestUrl: 'https://api.example.com/v1/chat/completions',
    model: 'reasoner-model',
    apiKey: 'sk-test',
    config: baseConfig,
  })

  const contentMessages = port.postedMessages.filter((m) => m.type === 'content_update')
  assert.equal(contentMessages.length, 1)
  assert.equal(contentMessages[0].isThinking, false)
  assert.equal(contentMessages[0].done, false)
  assert.equal(contentMessages[0].reasoningContent, 'Thinking about it.')
  assert.equal(contentMessages[0].actualContent, '')

  const doneMessage = port.postedMessages.find((m) => m.done === true && m.session === session)
  assert.ok(doneMessage)

  // Saved without crashing, with an empty actual-content answer since no content ever arrived,
  // while the reasoning itself is still persisted for reloads.
  const record = session.conversationRecords.at(-1)
  assert.equal(record.question, 'Q')
  assert.equal(record.answer, '')
  assert.equal(record.thinkingData.reasoningContent, 'Thinking about it.')
  assert.equal(record.thinkingData.actualContent, '')
  assert.equal(record.thinkingData.hasReasoning, true)
  assert.equal(record.thinkingData.isThinking, false)
})

test('generateAnswersWithOpenAICompatible flushes a final content_update on [DONE] when reasoning never produced content', async (t) => {
  t.mock.method(console, 'debug', () => {})

  const session = makeSession()
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () =>
    createMockSseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"Considering options."}}]}\n\n',
      'data: [DONE]\n\n',
    ]),
  )

  await generateAnswersWithOpenAICompatible({
    port,
    question: 'Q',
    session,
    endpointType: 'chat',
    requestUrl: 'https://api.example.com/v1/chat/completions',
    model: 'reasoner-model',
    apiKey: 'sk-test',
    config: baseConfig,
  })

  const contentMessages = port.postedMessages.filter((m) => m.type === 'content_update')
  assert.equal(contentMessages.length, 1)
  assert.equal(contentMessages[0].isThinking, false)
  assert.equal(contentMessages[0].reasoningContent, 'Considering options.')
  assert.equal(contentMessages[0].actualContent, '')

  assert.deepEqual(port.postedMessages.at(-1), { answer: null, done: true, session })
  const record = session.conversationRecords.at(-1)
  assert.equal(record.question, 'Q')
  assert.equal(record.answer, '')
  assert.equal(record.thinkingData.reasoningContent, 'Considering options.')
  assert.equal(record.thinkingData.hasReasoning, true)
})
