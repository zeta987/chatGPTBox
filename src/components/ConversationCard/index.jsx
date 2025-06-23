import { memo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import Browser from 'webextension-polyfill'
import InputBox from '../InputBox'
import ConversationItem from '../ConversationItem'
import {
  apiModeToModelName,
  createElementAtPosition,
  getApiModesFromConfig,
  isApiModeSelected,
  isFirefox,
  isMobile,
  isSafari,
  isUsingModelName,
  modelNameToDesc,
} from '../../utils'
import {
  ArchiveIcon,
  DesktopDownloadIcon,
  LinkExternalIcon,
  MoveToBottomIcon,
  SearchIcon,
} from '@primer/octicons-react'
import { Pin, WindowDesktop, XLg } from 'react-bootstrap-icons'
import FileSaver from 'file-saver'
import { render } from 'preact'
import FloatingToolbar from '../FloatingToolbar'
import { useClampWindowSize } from '../../hooks/use-clamp-window-size'
import { getUserConfig, isUsingBingWebModel, Models } from '../../config/index.mjs'
import { useTranslation } from 'react-i18next'
import DeleteButton from '../DeleteButton'
import { useConfig } from '../../hooks/use-config.mjs'
import { createSession } from '../../services/local-session.mjs'
import { v4 as uuidv4 } from 'uuid'
import { initSession } from '../../services/init-session.mjs'
import { findLastIndex } from 'lodash-es'
import { generateAnswersWithBingWebApi } from '../../services/apis/bing-web.mjs'
import { handlePortError } from '../../services/wrappers.mjs'
import MarkdownRender from '../MarkdownRender/markdown.jsx'

const logo = Browser.runtime.getURL('logo.png')

class ConversationItemData extends Object {
  /**
   * @param {'question'|'answer'|'error'} type
   * @param {string} content
   * @param {bool} done
   * @param {Object} thinkingData - 思考相關數據
   */
  constructor(type, content, done = false, thinkingData = null) {
    super()
    this.type = type
    this.content = content
    this.done = done
    // 新增思考相關數據
    this.thinkingData = thinkingData || {
      reasoningContent: '',
      actualContent: '',
      thinkingTime: 0,
      isThinking: false,
      hasReasoning: false,
    }
  }
}

// 新增思考區塊元件
const ThinkingBlock = memo(({ thinkingData }) => {
  const [collapsed, setCollapsed] = useState(true) // 預設收納
  const [copied, setCopied] = useState(false)
  const [currentThinkingTime, setCurrentThinkingTime] = useState(thinkingData.thinkingTime)
  const [userInteracted, setUserInteracted] = useState(false) // 追蹤用戶是否手動操作過

  // 記錄思考結束時的最終時間
  const finalThinkingTimeRef = useRef(null)

  // 實時更新思考時間 - 優化計時器邏輯
  useEffect(() => {
    let interval = null

    if (thinkingData.isThinking) {
      // 思考開始，清除之前的最終時間記錄
      finalThinkingTimeRef.current = null

      // 使用後端傳來的時間作為基準，前端只做微調
      const baseTime = thinkingData.thinkingTime
      const startTime = Date.now()

      interval = setInterval(() => {
        // 基於後端時間 + 前端經過的時間
        const frontendElapsed = Date.now() - startTime
        setCurrentThinkingTime(baseTime + frontendElapsed)
      }, 100)
    } else {
      // 思考結束
      if (thinkingData.thinkingTime > 0 && finalThinkingTimeRef.current === null) {
        // 第一次收到 isThinking: false，記錄最終時間
        finalThinkingTimeRef.current = thinkingData.thinkingTime
        setCurrentThinkingTime(thinkingData.thinkingTime)
      } else if (finalThinkingTimeRef.current !== null) {
        // 已經記錄了最終時間，使用記錄的時間（不再更新）
        setCurrentThinkingTime(finalThinkingTimeRef.current)
      }
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [thinkingData.isThinking, thinkingData.thinkingTime])

  // 自動展開/收納邏輯
  useEffect(() => {
    // 如果用戶手動操作過，暫時不執行自動行為
    if (userInteracted) {
      return
    }

    // 當開始思考且有思考內容時，自動展開
    if (thinkingData.isThinking && thinkingData.hasReasoning && collapsed) {
      setCollapsed(false)
    }
    // 當思考結束時，立即自動收納
    else if (!thinkingData.isThinking && thinkingData.hasReasoning && !collapsed) {
      setCollapsed(true)
    }
  }, [thinkingData.isThinking, thinkingData.hasReasoning, collapsed, userInteracted])

  // 當新的問題開始時，重置用戶交互狀態和最終時間記錄
  useEffect(() => {
    if (thinkingData.isThinking && thinkingData.thinkingTime < 1000) {
      // 思考剛開始（時間小於1秒），重置用戶交互狀態
      setUserInteracted(false)
      // 重置最終時間記錄
      finalThinkingTimeRef.current = null
    }
  }, [thinkingData.isThinking, thinkingData.thinkingTime])

  const copyThought = () => {
    if (thinkingData.reasoningContent) {
      navigator.clipboard
        .writeText(thinkingData.reasoningContent)
        .then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
        .catch((error) => {
          console.error('Failed to copy text:', error)
        })
    }
  }

  const thinkingTimeSeconds = (currentThinkingTime / 1000).toFixed(1)
  const statusText = thinkingData.isThinking
    ? `思考中 (${thinkingTimeSeconds}秒)`
    : `深度思考 (${thinkingTimeSeconds}秒)`

  if (!thinkingData.hasReasoning) {
    return null
  }

  return (
    <div
      style={{
        marginBottom: '10px',
        border: '1px solid rgb(86, 88, 105)', // 配合原 UI 的邊框顏色
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: 'rgb(52, 53, 65)', // 配合原 UI 的背景顏色
      }}
    >
      {/* 思考區塊標題 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          backgroundColor: 'rgb(64, 65, 79)', // 配合原 UI 的深色背景
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid rgb(86, 88, 105)',
          transition: 'background-color 0.2s',
        }}
        onClick={() => {
          setCollapsed(!collapsed)
          setUserInteracted(true) // 標記用戶手動操作
        }}
        onMouseEnter={(e) => (e.target.style.backgroundColor = 'rgb(74, 75, 89)')}
        onMouseLeave={(e) => (e.target.style.backgroundColor = 'rgb(64, 65, 79)')}
      >
        {/* 燈泡圖示 */}
        <span
          style={{
            marginRight: '8px',
            fontSize: '16px',
            color: thinkingData.isThinking ? '#10a37f' : '#19c37d', // 使用 ChatGPT 綠色調
          }}
        >
          💡
        </span>

        {/* 狀態文字 */}
        <span
          style={{
            color: 'rgb(217, 217, 227)', // 配合原 UI 的文字顏色
            fontSize: '14px',
            flex: 1,
            fontWeight: '500',
          }}
        >
          {statusText}
        </span>

        {/* 思考中的動畫指示器 */}
        {thinkingData.isThinking && (
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              backgroundColor: '#10a37f', // ChatGPT 綠色
              borderRadius: '50%',
              marginRight: '8px',
              animation: 'thinking-pulse 1.5s ease-in-out infinite',
            }}
          ></span>
        )}

        {/* 複製按鈕 */}
        {!thinkingData.isThinking && (
          <button
            style={{
              background: 'none',
              border: 'none',
              color: 'rgb(172, 172, 190)', // 配合原 UI 的按鈕顏色
              cursor: 'pointer',
              padding: '4px 6px',
              marginRight: '4px',
              borderRadius: '4px',
              transition: 'all 0.2s',
            }}
            onClick={(e) => {
              e.stopPropagation()
              copyThought()
            }}
            onMouseEnter={(e) => {
              e.target.style.color = 'rgb(217, 217, 227)'
              e.target.style.backgroundColor = 'rgb(86, 88, 105)'
            }}
            onMouseLeave={(e) => {
              e.target.style.color = 'rgb(172, 172, 190)'
              e.target.style.backgroundColor = 'transparent'
            }}
            title="複製思考內容"
          >
            {copied ? '✓' : '📋'}
          </button>
        )}

        {/* 展開/收納圖示 */}
        <span
          style={{
            color: 'rgb(172, 172, 190)', // 配合原 UI 的圖示顏色
            fontSize: '12px',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </span>
      </div>

      {/* 思考內容 */}
      <div
        className="thinking-block-content-wrapper"
        style={{
          maxHeight: collapsed ? '0' : '60vh', // 使用視窗高度的 60%
          opacity: collapsed ? '0' : '1',
          overflow: collapsed ? 'hidden' : 'auto', // 展開時允許滾動
          transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
        }}
      >
        <div
          style={{
            padding: '12px',
            backgroundColor: 'rgb(52, 53, 65)', // 配合原 UI 背景
            fontSize: '16px', // 再增大字體
            lineHeight: '1.6',
            color: '#ffffff', // 改為白色
            overflowY: 'auto',
            borderTop: '1px solid rgb(86, 88, 105)',
          }}
        >
          <MarkdownRender>{thinkingData.reasoningContent}</MarkdownRender>
        </div>
      </div>
    </div>
  )
})

ThinkingBlock.displayName = 'ThinkingBlock'
ThinkingBlock.propTypes = {
  thinkingData: PropTypes.shape({
    reasoningContent: PropTypes.string,
    actualContent: PropTypes.string,
    thinkingTime: PropTypes.number,
    isThinking: PropTypes.bool,
    hasReasoning: PropTypes.bool,
  }).isRequired,
}

function ConversationCard(props) {
  const { t } = useTranslation()
  const [isReady, setIsReady] = useState(!props.question)
  const [port, setPort] = useState(() => Browser.runtime.connect())
  const [triggered, setTriggered] = useState(!props.waitForTrigger)
  const [session, setSession] = useState(props.session)
  const windowSize = useClampWindowSize([750, 1500], [250, 1100])
  const bodyRef = useRef(null)
  const [completeDraggable, setCompleteDraggable] = useState(false)
  const useForegroundFetch = isUsingBingWebModel(session)
  const [apiModes, setApiModes] = useState([])

  /**
   * @type {[ConversationItemData[], (conversationItemData: ConversationItemData[]) => void]}
   */
  const [conversationItemData, setConversationItemData] = useState([])
  const config = useConfig()

  useLayoutEffect(() => {
    if (session.conversationRecords.length === 0) {
      if (props.question && triggered) {
        // 在網頁滑詞場景中，需要同時創建 question 和 answer 項
        setConversationItemData([
          new ConversationItemData('question', props.question, true),
          new ConversationItemData(
            'answer',
            `<p class="gpt-loading">${t(`Waiting for response...`)}</p>`,
          ),
        ])
      }
    } else {
      const ret = []
      for (const record of session.conversationRecords) {
        ret.push(new ConversationItemData('question', record.question, true))

        // 創建答案項目，如果有思考數據則恢復它
        let answerContent = record.answer // 預設使用 record.answer
        let answerThinkingData = {
          reasoningContent: '',
          actualContent: '',
          thinkingTime: 0,
          isThinking: false,
          hasReasoning: false,
        }

        if (record.thinkingData && record.thinkingData.hasReasoning) {
          // 如果有思考數據，恢復完整的思考信息
          answerThinkingData = {
            reasoningContent: record.thinkingData.reasoningContent || '',
            actualContent: record.thinkingData.actualContent || record.answer, // 確保 actualContent 有值
            thinkingTime: record.thinkingData.thinkingTime || 0,
            isThinking: false, // 恢復時總是設為 false
            hasReasoning: true, // 強制設為 true，確保 ThinkingBlock 顯示
          }

          // 對於有思考數據的項目，使用 actualContent 作為答案內容
          answerContent = answerThinkingData.actualContent || record.answer

          // 調試日誌
          console.log('[ConversationCard] Restoring thinking data:', {
            questionIndex: ret.length / 2,
            hasReasoning: answerThinkingData.hasReasoning,
            reasoningContent: answerThinkingData.reasoningContent?.substring(0, 50) + '...',
            actualContent: answerThinkingData.actualContent?.substring(0, 50) + '...',
          })
        }

        // 根據記錄是否為錯誤類型來決定項目類型
        const itemType = record.isError ? 'error' : 'answer'
        ret.push(new ConversationItemData(itemType, answerContent, true, answerThinkingData))
      }
      setConversationItemData(ret)
    }
  }, [])

  useEffect(() => {
    setCompleteDraggable(!isSafari() && !isFirefox() && !isMobile())
  }, [])

  useEffect(() => {
    if (props.onUpdate) props.onUpdate(port, session, conversationItemData)
  }, [session, conversationItemData])

  useEffect(() => {
    const { offsetHeight, scrollHeight, scrollTop } = bodyRef.current
    if (
      config.lockWhenAnswer &&
      scrollHeight <= scrollTop + offsetHeight + config.answerScrollMargin
    ) {
      bodyRef.current.scrollTo({
        top: scrollHeight,
        behavior: 'instant',
      })
    }
  }, [conversationItemData])

  useEffect(async () => {
    // when the page is responsive, session may accumulate redundant data and needs to be cleared after remounting and before making a new request
    if (props.question && triggered) {
      // 保留現有的 conversationRecords，只更新 question
      const newSession = {
        ...session,
        question: props.question,
        updatedAt: new Date().toISOString(),
      }
      setSession(newSession)
      await postMessage({ session: newSession })
    }
  }, [props.question, triggered]) // usually only triggered once

  useLayoutEffect(() => {
    setApiModes(getApiModesFromConfig(config, true))
  }, [
    config.activeApiModes,
    config.customApiModes,
    config.azureDeploymentName,
    config.ollamaModelName,
  ])

  useEffect(() => {
    // 動態添加 CSS 動畫到 document
    const style = document.createElement('style')
    style.id = 'thinking-pulse-animation' // 添加 ID 避免重複
    style.textContent = `
      @keyframes thinking-pulse {
        0% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.5;
          transform: scale(0.8);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }

      /* 額外的樣式優化 */
      .thinking-indicator {
        animation: thinking-pulse 1.5s ease-in-out infinite;
      }
    `

    // 檢查是否已存在，避免重複添加
    if (!document.getElementById('thinking-pulse-animation')) {
      document.head.appendChild(style)
    }

    return () => {
      // 清理時移除樣式 - 修正這裡的錯誤
      const existingStyle = document.getElementById('thinking-pulse-animation')
      if (existingStyle && document.head.contains(existingStyle)) {
        document.head.removeChild(existingStyle) // 修正：removeChild 而不是 removeListener
      }
    }
  }, [])

  /**
   * @param {string} value
   * @param {boolean} appended
   * @param {'question'|'answer'|'error'} newType
   * @param {boolean} done
   */
  const updateAnswer = (value, appended, newType, done = false) => {
    setConversationItemData((old) => {
      const copy = [...old]
      const lastItem = copy.length > 0 ? copy[copy.length - 1] : null

      // 判斷是更新現有回答/錯誤，還是附加新回答
      if (
        lastItem &&
        (lastItem.type === 'answer' || lastItem.type === 'error') &&
        lastItem.type !== 'question'
      ) {
        // 如果最後一項是 answer 或 error，則更新它
        copy[copy.length - 1] = new ConversationItemData(
          newType,
          appended ? lastItem.content + value : value,
          done,
          lastItem.thinkingData, // 保持現有的思考數據
        )
      } else {
        // 否則（例如最後一項是 question，或者列表為空），附加新的回答項
        const newItem = new ConversationItemData(newType, value, done)
        copy.push(newItem)
      }
      return copy
    })
  }

  const portMessageListener = (msg) => {
    if (msg.answer) {
      updateAnswer(msg.answer, false, 'answer')
    }
    if (msg.session) {
      if (msg.done) msg.session = { ...msg.session, isRetry: false }
      setSession(msg.session)
    }
    if (msg.done) {
      updateAnswer('', true, 'answer', true)
      setIsReady(true)
    }
    if (msg.error) {
      let formattedError = msg.error

      switch (msg.error) {
        case 'UNAUTHORIZED':
          formattedError =
            `${t('UNAUTHORIZED')}<br>${t('Please login at https://chatgpt.com first')}${
              isSafari() ? `<br>${t('Then open https://chatgpt.com/api/auth/session')}` : ''
            }<br>${t('And refresh this page or type you question again')}` +
            `<br><br>${t(
              'Consider creating an api key at https://platform.openai.com/account/api-keys',
            )}`
          break
        case 'CLOUDFLARE':
          formattedError =
            `${t('OpenAI Security Check Required')}<br>${
              isSafari()
                ? t('Please open https://chatgpt.com/api/auth/session')
                : t('Please open https://chatgpt.com')
            }<br>${t('And refresh this page or type you question again')}` +
            `<br><br>${t(
              'Consider creating an api key at https://platform.openai.com/account/api-keys',
            )}`
          break
        default:
          if (typeof msg.error === 'string' && msg.error.trimStart().startsWith('{'))
            try {
              formattedError = JSON.stringify(JSON.parse(msg.error), null, 2)
            } catch (e) {
              /* empty */
            }
          break
      }

      // 統一錯誤處理邏輯
      const errorMessage = t(formattedError)

      // 查找最後一個答案或錯誤項目
      const lastItemIndex = findLastIndex(
        conversationItemData,
        (v) => v.type === 'answer' || v.type === 'error',
      )

      if (
        lastItemIndex !== -1 &&
        (conversationItemData[lastItemIndex].content.includes('gpt-loading') ||
          conversationItemData[lastItemIndex].type === 'error')
      ) {
        // 如果最後一項是加載中或錯誤，直接替換
        updateAnswer(errorMessage, false, 'error', true)
      } else {
        // 否則添加新的錯誤項目
        setConversationItemData((old) => [
          ...old,
          new ConversationItemData('error', errorMessage, true),
        ])
      }
      setIsReady(true)
    }
  }

  const foregroundMessageListeners = useRef([])

  /**
   * @param {Session|undefined} session
   * @param {boolean|undefined} stop
   */
  const postMessage = async ({ session, stop }) => {
    if (useForegroundFetch) {
      foregroundMessageListeners.current.forEach((listener) => listener({ session, stop }))
      if (session) {
        const fakePort = {
          postMessage: (msg) => {
            portMessageListener(msg)
          },
          onMessage: {
            addListener: (listener) => {
              foregroundMessageListeners.current.push(listener)
            },
            removeListener: (listener) => {
              foregroundMessageListeners.current.splice(
                foregroundMessageListeners.current.indexOf(listener),
                1,
              )
            },
          },
          onDisconnect: {
            addListener: () => {},
            removeListener: () => {},
          },
        }
        try {
          const bingToken = (await getUserConfig()).bingAccessToken
          if (isUsingModelName('bingFreeSydney', session))
            await generateAnswersWithBingWebApi(
              fakePort,
              session.question,
              session,
              bingToken,
              true,
            )
          else await generateAnswersWithBingWebApi(fakePort, session.question, session, bingToken)
        } catch (err) {
          handlePortError(session, fakePort, err)
        }
      }
    } else {
      port.postMessage({ session, stop })
    }
  }

  useEffect(() => {
    const portListener = () => {
      setPort(Browser.runtime.connect())
      setIsReady(true)
    }

    const closeChatsMessageListener = (message) => {
      if (message.type === 'CLOSE_CHATS') {
        port.disconnect()
        Browser.runtime.onMessage.removeListener(closeChatsMessageListener)
        window.removeEventListener('keydown', closeChatsEscListener)
        if (props.onClose) props.onClose()
      }
    }
    const closeChatsEscListener = async (e) => {
      if (e.key === 'Escape' && (await getUserConfig()).allowEscToCloseAll) {
        closeChatsMessageListener({ type: 'CLOSE_CHATS' })
      }
    }

    if (props.closeable) {
      Browser.runtime.onMessage.addListener(closeChatsMessageListener)
      window.addEventListener('keydown', closeChatsEscListener)
    }
    port.onDisconnect.addListener(portListener)
    return () => {
      if (props.closeable) {
        Browser.runtime.onMessage.removeListener(closeChatsMessageListener)
        window.removeEventListener('keydown', closeChatsEscListener)
      }
      port.onDisconnect.removeListener(portListener)
    }
  }, [port])

  const messageListener = (msg) => {
    handleMessage(msg)
  }

  useEffect(() => {
    if (port) {
      port.onMessage.addListener(messageListener)
      return () => {
        if (port) {
          port.onMessage.removeListener(messageListener)
        }
      }
    }
  }, [port])

  const isRetryingRef = useRef(false) // 防止重複重試的標誌

  // Create a stable retry function using useRef to access latest state
  const conversationItemDataRef = useRef(conversationItemData)
  conversationItemDataRef.current = conversationItemData

  const retryFn = useCallback(async () => {
    // 防止重複點擊
    if (isRetryingRef.current) {
      console.log('[Retry] Already retrying, skipping...')
      return
    }

    try {
      isRetryingRef.current = true

      // 使用 ref 獲取最新的 conversationItemData
      const currentData = conversationItemDataRef.current

      // 獲取最後一個問題內容（在修改數據之前）
      let lastQuestion = ''
      const lastQuestionIndex = findLastIndex(currentData, (v) => v.type === 'question')
      if (lastQuestionIndex !== -1) {
        lastQuestion = currentData[lastQuestionIndex].content
      }

      // 先移除最後一個錯誤或答案項目
      let itemsToUpdate = [...currentData]
      const lastIndex = findLastIndex(
        itemsToUpdate,
        (v) => v.type === 'answer' || v.type === 'error',
      )
      if (lastIndex !== -1) {
        itemsToUpdate.splice(lastIndex, 1) // 移除錯誤或未完成的答案項
        // 更新實際的 conversationItemData，移除錯誤項目
        setConversationItemData(itemsToUpdate)
      }

      // 判斷是否為首次對話（只有一個問題）
      const isFirstConversation = itemsToUpdate.length <= 1

      // 在移除錯誤項之後，同步對話記錄
      let syncedSession
      if (isFirstConversation) {
        // 首次對話重試：創建一個空的對話記錄
        syncedSession = {
          ...session,
          conversationRecords: [], // 清空上下文
        }
      } else {
        // 多輪對話重試：使用已移除最後答案的數據進行同步
        syncedSession = syncConversationDataToSession(itemsToUpdate, session)
      }

      // 添加 loading 狀態到 UI（這會替換當前的錯誤項目）
      updateAnswer(`<p class="gpt-loading">${t('Waiting for response...')}</p>`, false, 'answer')
      setIsReady(false)

      // 調試日誌
      console.log('[Retry] Session state:', {
        isFirstConversation: isFirstConversation,
        sessionFromProps_records: session?.conversationRecords?.length || 0,
        syncedSession_records: syncedSession?.conversationRecords?.length || 0,
        originalItemsLength: currentData.length,
        itemsAfterRemove: itemsToUpdate.length,
        lastQuestion: lastQuestion,
        modelName: syncedSession?.modelName || session?.modelName,
        apiMode: syncedSession?.apiMode || session?.apiMode,
      })

      // 額外調試：打印完整的 conversationRecords
      console.log('[Retry] conversationRecords:', syncedSession?.conversationRecords)

      // 使用同步後的 conversationRecords
      let sessionForRequest = {
        ...syncedSession,
        question: lastQuestion,
        isRetry: true,
        conversationRecords: syncedSession.conversationRecords || [],
      }

      // 更新父組件的 session 狀態以同步 UI
      setSession(sessionForRequest)

      try {
        await postMessage({ stop: true })
        await postMessage({ session: sessionForRequest })
      } catch (e) {
        updateAnswer(e, false, 'error')
      }
    } finally {
      // 重置標誌，允許下次重試
      setTimeout(() => {
        isRetryingRef.current = false
      }, 1000) // 1秒後允許再次重試
    }
  }, [session, t, updateAnswer, setIsReady, setSession, postMessage])

  // 修改訊息處理邏輯
  const handleMessage = (msg) => {
    console.debug('received message', msg)
    if (isReady && msg?.question) setIsReady(false)

    // 處理新的訊息類型
    if (msg.type === 'thinking_progress') {
      updateThinkingData({
        thinkingTime: msg.thinkingTime,
        isThinking: msg.isThinking,
      })
      return
    }

    if (msg.type === 'thinking_update') {
      updateThinkingData({
        reasoningContent: msg.reasoningContent,
        thinkingTime: msg.thinkingTime,
        isThinking: msg.isThinking,
        hasReasoning: true,
      })
      return
    }

    if (msg.type === 'content_update') {
      updateThinkingData({
        reasoningContent: msg.reasoningContent,
        actualContent: msg.actualContent,
        thinkingTime: msg.thinkingTime,
        isThinking: msg.isThinking,
        // Ensure hasReasoning is true if there's reasoningContent, otherwise preserve existing or default to false
        hasReasoning: !!msg.reasoningContent,
      })
      // 如果有實際內容，更新顯示的答案內容
      if (msg.actualContent && msg.actualContent.trim()) {
        updateAnswer(msg.actualContent, false, 'answer', msg.done)
      }
      return
    }

    // 處理傳統格式的訊息
    if (msg?.answer) {
      updateAnswer(msg.answer, false, 'answer', msg.done)
    }

    // 處理 session 更新（無論新舊格式）
    if (msg.session && msg.done) {
      setSession({ ...session, ...msg.session, isRetry: false })
    }

    // 處理錯誤訊息
    if (msg?.error) {
      let formattedError = msg.error
      if (typeof msg.error === 'string' && msg.error.trimStart().startsWith('{'))
        try {
          formattedError = JSON.stringify(JSON.parse(msg.error), null, 2)
        } catch (e) {
          /* empty */
        }

      // 統一錯誤處理邏輯
      const errorMessage = t(formattedError)

      // 查找最後一個答案或錯誤項目
      const lastItemIndex = findLastIndex(
        conversationItemData,
        (v) => v.type === 'answer' || v.type === 'error',
      )

      if (
        lastItemIndex !== -1 &&
        (conversationItemData[lastItemIndex].content.includes('gpt-loading') ||
          conversationItemData[lastItemIndex].type === 'error')
      ) {
        // 如果最後一項是加載中或錯誤，直接替換
        updateAnswer(errorMessage, false, 'error', true)
      } else {
        // 否則添加新的錯誤項目
        setConversationItemData((old) => [
          ...old,
          new ConversationItemData('error', errorMessage, true),
        ])
      }
      // 錯誤發生時必須設置 isReady 為 true，讓用戶可以重試或發送新消息
      setIsReady(true)
    }

    // 統一處理 done 狀態
    if (msg.done) {
      setIsReady(true)
    }
  }

  // 新增更新思考數據的函數
  const updateThinkingData = (newData) => {
    setConversationItemData((old) => {
      const copy = [...old]
      const index = findLastIndex(copy, (v) => v.type === 'answer')
      if (index === -1) {
        // 如果沒有找到答案項目，創建一個新的
        const initialHasReasoning =
          (newData.reasoningContent && newData.reasoningContent.trim() !== '') ||
          (typeof newData.hasReasoning === 'boolean' ? newData.hasReasoning : false)
        const newItem = new ConversationItemData('answer', '', false, {
          reasoningContent: '',
          actualContent: '',
          thinkingTime: 0,
          isThinking: false,
          hasReasoning: initialHasReasoning, // Initialize correctly
          ...newData, // Spread newData after default hasReasoning
        })
        return [...copy, newItem]
      }

      // 更新現有項目的思考數據
      const existingThinkingData = copy[index].thinkingData || {
        reasoningContent: '',
        actualContent: '',
        thinkingTime: 0,
        isThinking: false,
        hasReasoning: false,
      }

      // Determine the new hasReasoning state with robust stickiness
      let stickyHasReasoning = existingThinkingData.hasReasoning
      if (newData.reasoningContent && newData.reasoningContent.trim() !== '') {
        stickyHasReasoning = true // If new data provides reasoning content
      }
      if (typeof newData.hasReasoning === 'boolean') {
        // If newData explicitly provides hasReasoning, OR it with current sticky state.
        // This ensures if newData.hasReasoning is true, it makes/keeps stickyHasReasoning true.
        stickyHasReasoning = stickyHasReasoning || newData.hasReasoning
      }

      copy[index].thinkingData = {
        ...existingThinkingData, // Spread existing first to maintain unprovided fields
        ...newData, // Then spread new data, which might overwrite some fields
        hasReasoning: stickyHasReasoning, // Finally, apply the calculated sticky hasReasoning
      }
      return copy
    })
  }

  // 新增：將 conversationItemData 同步到 session.conversationRecords
  const syncConversationDataToSession = (itemData, currentSession) => {
    const conversationRecords = []

    console.log('[syncConversationDataToSession] Input:', {
      itemDataLength: itemData.length,
      itemDataTypes: itemData.map((item) => ({ type: item.type, done: item.done })),
      currentSessionRecords: currentSession?.conversationRecords?.length || 0,
    })

    for (let i = 0; i < itemData.length; i += 2) {
      const questionItem = itemData[i]
      const answerItem = itemData[i + 1]

      // 確保有問題和答案配對
      if (
        questionItem &&
        questionItem.type === 'question' &&
        answerItem &&
        (answerItem.type === 'answer' || answerItem.type === 'error')
      ) {
        // 獲取答案內容，優先使用 actualContent
        let answerContent = ''
        if (
          answerItem.type === 'answer' &&
          answerItem.thinkingData?.actualContent &&
          answerItem.thinkingData.actualContent.trim()
        ) {
          answerContent = answerItem.thinkingData.actualContent
        } else if (
          answerItem.type === 'answer' && // Ensure it's an actual answer, not an error message
          answerItem.content &&
          !answerItem.content.includes('gpt-loading') &&
          answerItem.content.trim()
        ) {
          answerContent = answerItem.content
        }

        // 添加到記錄中的條件：
        // 1. 答案成功完成（type === 'answer' 且 done === true）
        // 2. 或者是錯誤但前面還沒有這個問題的記錄（為了保留上下文）
        // 3. 或者有思考數據（即使答案未完成，也要保存思考進度）
        // 4. 或者有答案內容但還未完成（保留進行中的對話）
        const shouldAddRecord =
          (answerItem.type === 'answer' && answerContent && answerItem.done) ||
          (answerItem.type === 'error' &&
            !conversationRecords.some((r) => r.question === questionItem.content)) ||
          (answerItem.type === 'answer' &&
            answerItem.thinkingData &&
            answerItem.thinkingData.hasReasoning) ||
          (answerItem.type === 'answer' &&
            answerContent &&
            !answerItem.done &&
            !conversationRecords.some((r) => r.question === questionItem.content))

        if (shouldAddRecord) {
          const record = {
            question: questionItem.content,
            answer: answerContent || '', // 錯誤情況下可能沒有答案內容
          }

          // 保存思考數據（如果存在）- 不論是 answer 還是 error 類型
          if (answerItem.thinkingData && answerItem.thinkingData.hasReasoning) {
            record.thinkingData = {
              reasoningContent: answerItem.thinkingData.reasoningContent || '',
              actualContent: answerItem.thinkingData.actualContent || answerItem.content || '', // Fallback if actualContent is empty
              thinkingTime: answerItem.thinkingData.thinkingTime || 0,
              hasReasoning: true, // When saving, if we have thinkingData, hasReasoning MUST be true
              isThinking: false, // 保存時總是設為 false
            }
            // 如果有思考數據但 answer 為空，使用 actualContent
            if (!record.answer && record.thinkingData.actualContent) {
              record.answer = record.thinkingData.actualContent
            }

            // 調試日誌
            console.log('[syncConversationDataToSession] Saving thinking data:', {
              questionIndex: conversationRecords.length,
              hasReasoning: record.thinkingData.hasReasoning,
              reasoningContent: record.thinkingData.reasoningContent?.substring(0, 50) + '...',
              actualContent: record.thinkingData.actualContent?.substring(0, 50) + '...',
            })
          }

          // 如果是錯誤類型，標記它
          if (answerItem.type === 'error') {
            record.isError = true
          }

          conversationRecords.push(record)
        }
      }
    }

    return {
      ...currentSession,
      conversationRecords,
    }
  }

  // 在 conversationItemData 更新時同步到 session
  useEffect(() => {
    if (conversationItemData.length > 0) {
      const syncedSession = syncConversationDataToSession(conversationItemData, session)
      // 只有在 conversationRecords 真的發生變化時才更新
      if (
        JSON.stringify(syncedSession.conversationRecords) !==
        JSON.stringify(session.conversationRecords)
      ) {
        setSession(syncedSession)
        // 對於 FloatingToolbar 場景，確保更新傳遞給父組件
        if (props.onUpdate) {
          props.onUpdate(port, syncedSession, conversationItemData)
        }
      }
    }
  }, [conversationItemData])

  return (
    <div className="gpt-inner">
      <div
        className={
          props.draggable ? `gpt-header${completeDraggable ? ' draggable' : ''}` : 'gpt-header'
        }
        style="user-select:none;"
      >
        <span
          className="gpt-util-group"
          style={{
            padding: '15px 0 15px 15px',
            ...(props.notClampSize ? {} : { flexGrow: isSafari() ? 0 : 1 }),
            ...(isSafari() ? { maxWidth: '200px' } : {}),
          }}
        >
          {props.closeable ? (
            <span
              className="gpt-util-icon"
              title={t('Close the Window')}
              onClick={() => {
                port.disconnect()
                if (props.onClose) props.onClose()
              }}
            >
              <XLg size={16} />
            </span>
          ) : props.dockable ? (
            <span
              className="gpt-util-icon"
              title={t('Pin the Window')}
              onClick={() => {
                if (props.onDock) props.onDock()
              }}
            >
              <Pin size={16} />
            </span>
          ) : (
            <img src={logo} style="user-select:none;width:20px;height:20px;" />
          )}
          <select
            style={props.notClampSize ? {} : { width: 0, flexGrow: 1 }}
            className="normal-button"
            required
            onChange={(e) => {
              let apiMode = null
              let modelName = 'customModel'
              if (e.target.value !== '-1') {
                apiMode = apiModes[e.target.value]
                modelName = apiModeToModelName(apiMode)
              }
              const newSession = {
                ...session,
                modelName,
                apiMode,
                aiName: modelNameToDesc(
                  apiMode ? apiModeToModelName(apiMode) : modelName,
                  t,
                  config.customModelName,
                ),
              }
              if (config.autoRegenAfterSwitchModel && conversationItemData.length > 0) {
                setSession(newSession)
                retryFn()
              } else {
                setSession(newSession)
              }
            }}
          >
            {apiModes.map((apiMode, index) => {
              const modelName = apiModeToModelName(apiMode)
              const desc = modelNameToDesc(modelName, t, config.customModelName)
              if (desc) {
                return (
                  <option value={index} key={index} selected={isApiModeSelected(apiMode, session)}>
                    {desc}
                  </option>
                )
              }
            })}
            <option value={-1} selected={!session.apiMode && session.modelName === 'customModel'}>
              {t(Models.customModel.desc)}
            </option>
          </select>
        </span>
        {props.draggable && !completeDraggable && (
          <div className="draggable" style={{ flexGrow: 2, cursor: 'move', height: '55px' }} />
        )}
        <span
          className="gpt-util-group"
          style={{
            padding: '15px 15px 15px 0',
            justifyContent: 'flex-end',
            flexGrow: props.draggable && !completeDraggable ? 0 : 1,
          }}
        >
          {!config.disableWebModeHistory && session && session.conversationId && (
            <a
              title={t('Continue on official website')}
              href={'https://chatgpt.com/chat/' + session.conversationId}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="gpt-util-icon"
              style="color: inherit;"
            >
              <LinkExternalIcon size={16} />
            </a>
          )}
          <span
            className="gpt-util-icon"
            title={t('Float the Window')}
            onClick={() => {
              const position = { x: window.innerWidth / 2 - 300, y: window.innerHeight / 2 - 200 }
              const toolbarContainer = createElementAtPosition(position.x, position.y)
              toolbarContainer.className = 'chatgptbox-toolbar-container-not-queryable'
              render(
                <FloatingToolbar
                  session={session}
                  selection=""
                  container={toolbarContainer}
                  closeable={true}
                  triggered={true}
                />,
                toolbarContainer,
              )
            }}
          >
            <WindowDesktop size={16} />
          </span>
          <DeleteButton
            size={16}
            text={t('Clear Conversation')}
            onConfirm={async () => {
              await postMessage({ stop: true })
              Browser.runtime.sendMessage({
                type: 'DELETE_CONVERSATION',
                data: {
                  conversationId: session.conversationId,
                },
              })
              setConversationItemData([])
              const newSession = initSession({
                ...session,
                question: null,
                conversationRecords: [],
              })
              newSession.sessionId = session.sessionId
              setSession(newSession)
            }}
          />
          {!props.pageMode && (
            <span
              title={t('Store to Independent Conversation Page')}
              className="gpt-util-icon"
              onClick={() => {
                const newSession = {
                  ...session,
                  sessionName: new Date().toLocaleString(),
                  autoClean: false,
                  sessionId: uuidv4(),
                }
                setSession(newSession)
                createSession(newSession).then(() =>
                  Browser.runtime.sendMessage({
                    type: 'OPEN_URL',
                    data: {
                      url: Browser.runtime.getURL('IndependentPanel.html') + '?from=store',
                    },
                  }),
                )
              }}
            >
              <ArchiveIcon size={16} />
            </span>
          )}
          {conversationItemData.length > 0 && (
            <span
              title={t('Jump to bottom')}
              className="gpt-util-icon"
              onClick={() => {
                bodyRef.current.scrollTo({
                  top: bodyRef.current.scrollHeight,
                  behavior: 'smooth',
                })
              }}
            >
              <MoveToBottomIcon size={16} />
            </span>
          )}
          <span
            title={t('Save Conversation')}
            className="gpt-util-icon"
            onClick={() => {
              let output = ''
              session.conversationRecords.forEach((data) => {
                output += `${t('Question')}:\n\n${data.question}\n\n${t('Answer')}:\n\n${
                  data.answer
                }\n\n<hr/>\n\n`
              })
              const blob = new Blob([output], { type: 'text/plain;charset=utf-8' })
              FileSaver.saveAs(blob, 'conversation.md')
            }}
          >
            <DesktopDownloadIcon size={16} />
          </span>
        </span>
      </div>
      <hr />
      <div
        ref={bodyRef}
        className="markdown-body"
        style={
          props.notClampSize
            ? { flexGrow: 1 }
            : { maxHeight: windowSize[1] * 0.55 + 'px', resize: 'vertical' }
        }
      >
        {conversationItemData.map((data, idx) => (
          <div key={idx}>
            {data.type === 'question' && (
              <ConversationItem type="question" content={data.content} />
            )}
            {data.type === 'answer' && (
              <div>
                {/* 思考區塊 */}
                <ThinkingBlock thinkingData={data.thinkingData} />
                {/* 實際回答內容 - 優先顯示 actualContent，否則顯示 content（但都要排除載入狀態） */}
                {(() => {
                  // 檢查是否為載入狀態
                  const isLoading = data.content && data.content.includes('gpt-loading')

                  // 如果正在思考，不顯示任何 ConversationItem
                  if (data.thinkingData.isThinking) {
                    return null
                  }

                  // 如果是載入狀態且沒有思考內容，不顯示任何內容
                  if (isLoading && !data.thinkingData.hasReasoning) {
                    return null
                  }

                  // 優先使用 actualContent
                  if (data.thinkingData.actualContent && data.thinkingData.actualContent.trim()) {
                    return (
                      <ConversationItem
                        type="answer"
                        content={data.thinkingData.actualContent}
                        descName={session.aiName}
                        onRetry={retryFn}
                      />
                    )
                  }

                  // 如果沒有 actualContent，且沒有思考內容，且不是載入狀態，顯示傳統內容
                  if (
                    !data.thinkingData.hasReasoning &&
                    data.content &&
                    !isLoading &&
                    data.content.trim()
                  ) {
                    return (
                      <ConversationItem
                        type="answer"
                        content={data.content}
                        descName={session.aiName}
                        onRetry={retryFn}
                      />
                    )
                  }

                  // 其他情況不顯示任何內容
                  return null
                })()}
              </div>
            )}
            {data.type === 'error' && (
              <ConversationItem type="error" content={data.content} onRetry={retryFn} />
            )}
          </div>
        ))}
      </div>
      {props.waitForTrigger && !triggered ? (
        <p
          className="manual-btn"
          style={{ display: 'flex', justifyContent: 'center' }}
          onClick={() => {
            setConversationItemData([
              new ConversationItemData(
                'answer',
                `<p class="gpt-loading">${t(`Waiting for response...`)}</p>`,
              ),
            ])
            setTriggered(true)
            setIsReady(false)
          }}
        >
          <span className="icon-and-text">
            <SearchIcon size="small" /> {t('Ask ChatGPT')}
          </span>
        </p>
      ) : (
        <InputBox
          enabled={isReady}
          postMessage={postMessage}
          reverseResizeDir={props.pageMode}
          onSubmit={async (question) => {
            const newQuestion = new ConversationItemData('question', question)
            const newAnswer = new ConversationItemData(
              'answer',
              `<p class="gpt-loading">${t('Waiting for response...')}</p>`,
            )
            setConversationItemData([...conversationItemData, newQuestion, newAnswer])
            setIsReady(false)

            const newSession = { ...session, question, isRetry: false }
            setSession(newSession)
            try {
              await postMessage({ session: newSession })
            } catch (e) {
              updateAnswer(e, false, 'error')
            }
            bodyRef.current.scrollTo({
              top: bodyRef.current.scrollHeight,
              behavior: 'instant',
            })
          }}
        />
      )}
    </div>
  )
}

ConversationCard.propTypes = {
  session: PropTypes.object.isRequired,
  question: PropTypes.string,
  onUpdate: PropTypes.func,
  draggable: PropTypes.bool,
  closeable: PropTypes.bool,
  onClose: PropTypes.func,
  dockable: PropTypes.bool,
  onDock: PropTypes.func,
  notClampSize: PropTypes.bool,
  pageMode: PropTypes.bool,
  waitForTrigger: PropTypes.bool,
}

export default memo(ConversationCard)
