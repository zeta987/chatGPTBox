import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { generateAnswersWithOpenAiApiCompat } from '../../../../src/services/apis/openai-api.mjs'
import { generateAnswersWithOpenAICompatible } from '../../../../src/services/apis/openai-compatible-core.mjs'
import { createSession, getSession } from '../../../../src/services/local-session.mjs'
import { createFakePort } from '../../helpers/port.mjs'
import { createMockSseResponse } from '../../helpers/sse-response.mjs'

const reasoningSseChunks = [
  'data: {"choices":[{"delta":{"reasoning_content":"Let me think. "}}]}\n\n',
  'data: {"choices":[{"delta":{"reasoning_content":"Two plus two is four."}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"The answer is 4."},"finish_reason":"stop"}]}\n\n',
]
const expectedReasoning = 'Let me think. Two plus two is four.'
const expectedAnswer = 'The answer is 4.'

const coreConfig = {
  maxConversationContextLength: 3,
  maxResponseTokenLength: 256,
  temperature: 0.2,
}

beforeEach(() => {
  globalThis.__TEST_BROWSER_SHIM__.clearStorage()
})

test('generateAnswersWithOpenAiApiCompat persists reasoning into conversationRecords', async (t) => {
  t.mock.method(console, 'debug', () => {})
  globalThis.__TEST_BROWSER_SHIM__.replaceStorage({
    maxConversationContextLength: 3,
    maxResponseTokenLength: 256,
    temperature: 0.2,
  })

  const session = {
    modelName: 'chatgptApi4oMini',
    conversationRecords: [],
    isRetry: false,
  }
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () => createMockSseResponse(reasoningSseChunks))

  await generateAnswersWithOpenAiApiCompat(
    'https://api.example.com/v1',
    port,
    'CurrentQ',
    session,
    'sk-test',
  )

  const record = session.conversationRecords.at(-1)
  assert.equal(record.question, 'CurrentQ')
  assert.equal(record.answer, expectedAnswer)
  assert.equal(record.thinkingData.reasoningContent, expectedReasoning)
  assert.equal(record.thinkingData.actualContent, expectedAnswer)
  assert.equal(record.thinkingData.hasReasoning, true)
  assert.equal(record.thinkingData.isThinking, false)
  assert.equal(typeof record.thinkingData.thinkingTime, 'number')
  assert.equal(record.thinkingData.thinkingTime >= 0, true)

  const doneMessage = port.postedMessages.find(
    (message) => message.done === true && message.session,
  )
  assert.equal(doneMessage.session.conversationRecords.at(-1).thinkingData.hasReasoning, true)
})

test('generateAnswersWithOpenAiApiCompat keeps plain records when the stream has no reasoning', async (t) => {
  t.mock.method(console, 'debug', () => {})
  globalThis.__TEST_BROWSER_SHIM__.replaceStorage({
    maxConversationContextLength: 3,
    maxResponseTokenLength: 256,
    temperature: 0.2,
  })

  const session = {
    modelName: 'chatgptApi4oMini',
    conversationRecords: [],
    isRetry: false,
  }
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () =>
    createMockSseResponse([
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\n',
    ]),
  )

  await generateAnswersWithOpenAiApiCompat(
    'https://api.example.com/v1',
    port,
    'CurrentQ',
    session,
    'sk-test',
  )

  assert.deepEqual(session.conversationRecords, [{ question: 'CurrentQ', answer: 'Hello' }])
})

test('generateAnswersWithOpenAICompatible streams thinking updates and persists reasoning', async (t) => {
  t.mock.method(console, 'debug', () => {})

  const session = {
    modelName: 'customModel',
    conversationRecords: [],
    isRetry: false,
  }
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () => createMockSseResponse(reasoningSseChunks))

  await generateAnswersWithOpenAICompatible({
    port,
    question: 'CurrentQ',
    session,
    endpointType: 'chat',
    requestUrl: 'https://api.example.com/v1/chat/completions',
    model: 'deepseek-reasoner',
    apiKey: 'sk-test',
    config: coreConfig,
  })

  const thinkingUpdates = port.postedMessages.filter(
    (message) => message.type === 'thinking_update',
  )
  assert.equal(thinkingUpdates.length > 0, true)
  assert.equal(thinkingUpdates.at(-1).reasoningContent, expectedReasoning)
  assert.equal(thinkingUpdates.at(-1).isThinking, true)

  const contentUpdates = port.postedMessages.filter((message) => message.type === 'content_update')
  assert.equal(contentUpdates.length > 0, true)
  assert.equal(contentUpdates.at(-1).actualContent, expectedAnswer)
  assert.equal(contentUpdates.at(-1).reasoningContent, expectedReasoning)
  assert.equal(contentUpdates.at(-1).isThinking, false)

  const record = session.conversationRecords.at(-1)
  assert.equal(record.question, 'CurrentQ')
  assert.equal(record.answer, expectedAnswer)
  assert.equal(record.thinkingData.reasoningContent, expectedReasoning)
  assert.equal(record.thinkingData.actualContent, expectedAnswer)
  assert.equal(record.thinkingData.hasReasoning, true)
  assert.equal(record.thinkingData.isThinking, false)
  assert.equal(typeof record.thinkingData.thinkingTime, 'number')
})

test('generateAnswersWithOpenAICompatible keeps legacy messages and plain records without reasoning', async (t) => {
  t.mock.method(console, 'debug', () => {})

  const session = {
    modelName: 'customModel',
    conversationRecords: [],
    isRetry: false,
  }
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () =>
    createMockSseResponse([
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\n',
    ]),
  )

  await generateAnswersWithOpenAICompatible({
    port,
    question: 'CurrentQ',
    session,
    endpointType: 'chat',
    requestUrl: 'https://api.example.com/v1/chat/completions',
    model: 'some-model',
    apiKey: 'sk-test',
    config: coreConfig,
  })

  assert.equal(
    port.postedMessages.some((message) => message.type === 'content_update'),
    false,
  )
  assert.equal(
    port.postedMessages.some((message) => message.done === false && message.answer === 'Hello'),
    true,
  )
  assert.deepEqual(session.conversationRecords, [{ question: 'CurrentQ', answer: 'Hello' }])
})

test('reasoning survives a save/reload round-trip through local sessions', async (t) => {
  t.mock.method(console, 'debug', () => {})

  const session = {
    sessionId: 'reasoning-round-trip',
    sessionName: 'Reasoning Round Trip',
    modelName: 'customModel',
    conversationRecords: [],
    isRetry: false,
  }
  const port = createFakePort()

  t.mock.method(globalThis, 'fetch', async () => createMockSseResponse(reasoningSseChunks))

  await generateAnswersWithOpenAICompatible({
    port,
    question: 'CurrentQ',
    session,
    endpointType: 'chat',
    requestUrl: 'https://api.example.com/v1/chat/completions',
    model: 'deepseek-reasoner',
    apiKey: 'sk-test',
    config: coreConfig,
  })

  await createSession(session)

  // Simulate an extension reload: storage only retains JSON-serializable data.
  globalThis.__TEST_BROWSER_SHIM__.replaceStorage(
    JSON.parse(JSON.stringify(globalThis.__TEST_BROWSER_SHIM__.getStorage())),
  )

  const { session: reloadedSession } = await getSession('reasoning-round-trip')
  const reloadedRecord = reloadedSession.conversationRecords.at(-1)
  assert.equal(reloadedRecord.question, 'CurrentQ')
  assert.equal(reloadedRecord.answer, expectedAnswer)
  assert.deepEqual(reloadedRecord.thinkingData, {
    reasoningContent: expectedReasoning,
    actualContent: expectedAnswer,
    thinkingTime: reloadedRecord.thinkingData.thinkingTime,
    hasReasoning: true,
    isThinking: false,
  })
  assert.equal(typeof reloadedRecord.thinkingData.thinkingTime, 'number')
})
