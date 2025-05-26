import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

  // 實時更新思考時間 - 優化計時器邏輯
  useEffect(() => {
    let interval = null
    if (thinkingData.isThinking) {
      // 使用後端傳來的時間作為基準，前端只做微調
      const baseTime = thinkingData.thinkingTime
      const startTime = Date.now()

      interval = setInterval(() => {
        // 基於後端時間 + 前端經過的時間
        const frontendElapsed = Date.now() - startTime
        setCurrentThinkingTime(baseTime + frontendElapsed)
      }, 100)
    } else {
      // 思考結束時使用後端的最終時間
      setCurrentThinkingTime(thinkingData.thinkingTime)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
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
        onClick={() => setCollapsed(!collapsed)}
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
      {!collapsed && (
        <div
          style={{
            padding: '12px',
            backgroundColor: 'rgb(52, 53, 65)', // 配合原 UI 背景
            fontSize: '16px', // 再增大字體
            lineHeight: '1.6',
            color: '#ffffff', // 改為白色
            maxHeight: '200px',
            overflowY: 'auto',
            borderTop: '1px solid rgb(86, 88, 105)',
          }}
        >
          <MarkdownRender>{thinkingData.reasoningContent}</MarkdownRender>
        </div>
      )}
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
      if (props.question && triggered)
        setConversationItemData([
          new ConversationItemData(
            'answer',
            `<p class="gpt-loading">${t(`Waiting for response...`)}</p>`,
          ),
        ])
    } else {
      const ret = []
      for (const record of session.conversationRecords) {
        ret.push(new ConversationItemData('question', record.question, true))
        ret.push(new ConversationItemData('answer', record.answer, true))
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
      const newSession = initSession({ ...session, question: props.question })
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
      const index = findLastIndex(copy, (v) => v.type === 'answer' || v.type === 'error')
      if (index === -1) {
        // 創建新的答案項目
        const newItem = new ConversationItemData(newType, value, done)
        return [...copy, newItem]
      }

      // 更新現有項目
      copy[index] = new ConversationItemData(
        newType,
        appended ? copy[index].content + value : value,
        done,
        copy[index].thinkingData, // 保持現有的思考數據
      )
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
      switch (msg.error) {
        case 'UNAUTHORIZED':
          updateAnswer(
            `${t('UNAUTHORIZED')}<br>${t('Please login at https://chatgpt.com first')}${
              isSafari() ? `<br>${t('Then open https://chatgpt.com/api/auth/session')}` : ''
            }<br>${t('And refresh this page or type you question again')}` +
              `<br><br>${t(
                'Consider creating an api key at https://platform.openai.com/account/api-keys',
              )}`,
            false,
            'error',
          )
          break
        case 'CLOUDFLARE':
          updateAnswer(
            `${t('OpenAI Security Check Required')}<br>${
              isSafari()
                ? t('Please open https://chatgpt.com/api/auth/session')
                : t('Please open https://chatgpt.com')
            }<br>${t('And refresh this page or type you question again')}` +
              `<br><br>${t(
                'Consider creating an api key at https://platform.openai.com/account/api-keys',
              )}`,
            false,
            'error',
          )
          break
        default: {
          let formattedError = msg.error
          if (typeof msg.error === 'string' && msg.error.trimStart().startsWith('{'))
            try {
              formattedError = JSON.stringify(JSON.parse(msg.error), null, 2)
            } catch (e) {
              /* empty */
            }

          let lastItem
          if (conversationItemData.length > 0)
            lastItem = conversationItemData[conversationItemData.length - 1]
          if (lastItem && (lastItem.content.includes('gpt-loading') || lastItem.type === 'error'))
            updateAnswer(t(formattedError), false, 'error')
          else
            setConversationItemData([
              ...conversationItemData,
              new ConversationItemData('error', t(formattedError)),
            ])
          break
        }
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

  const getRetryFn = (session) => async () => {
    updateAnswer(`<p class="gpt-loading">${t('Waiting for response...')}</p>`, false, 'answer')
    setIsReady(false)

    // 創建新的 session 副本以避免直接修改原始 session
    const newSession = { ...session, isRetry: true }

    // 簡化重試邏輯：直接移除最後一條對話記錄（如果存在）
    if (newSession.conversationRecords.length > 0) {
      newSession.conversationRecords = newSession.conversationRecords.slice(0, -1)
    }

    setSession(newSession)
    try {
      await postMessage({ stop: true })
      await postMessage({ session: newSession })
    } catch (e) {
      updateAnswer(e, false, 'error')
    }
  }

  const retryFn = useMemo(() => getRetryFn(session), [session])

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

      let lastItem
      if (conversationItemData.length > 0)
        lastItem = conversationItemData[conversationItemData.length - 1]
      if (lastItem && (lastItem.content.includes('gpt-loading') || lastItem.type === 'error'))
        updateAnswer(t(formattedError), false, 'error', true)
      else
        setConversationItemData([
          ...conversationItemData,
          new ConversationItemData('error', t(formattedError), true),
        ])
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
        const newItem = new ConversationItemData('answer', '', false, {
          reasoningContent: '',
          actualContent: '',
          thinkingTime: 0,
          isThinking: false,
          hasReasoning: false,
          ...newData,
        })
        return [...copy, newItem]
      }

      // 更新現有項目的思考數據
      copy[index].thinkingData = {
        ...copy[index].thinkingData,
        ...newData,
      }
      return copy
    })
  }

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
              if (config.autoRegenAfterSwitchModel && conversationItemData.length > 0)
                getRetryFn(newSession)()
              else setSession(newSession)
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
            {data.type === 'error' && <ConversationItem type="error" content={data.content} />}
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
