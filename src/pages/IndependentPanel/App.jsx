import {
  createSession,
  resetSessions,
  getSessions,
  updateSession,
  getSession,
  deleteSession,
} from '../../services/local-session.mjs'
import { useEffect, useRef, useState } from 'react'
import './styles.scss'
import { useConfig } from '../../hooks/use-config.mjs'
import { useTranslation } from 'react-i18next'
import ConfirmButton from '../../components/ConfirmButton'
import ConversationCard from '../../components/ConversationCard'
import DeleteButton from '../../components/DeleteButton'
import { openUrl } from '../../utils/index.mjs'
import Browser from 'webextension-polyfill'
import FileSaver from 'file-saver'

function App() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(true)
  const config = useConfig(null, false)
  const [sessions, setSessions] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [currentSession, setCurrentSession] = useState(null)
  const [renderContent, setRenderContent] = useState(false)
  const currentPort = useRef(null)
  const latestSession = useRef(null) // 用於追踪最新的 session 狀態

  const setSessionIdSafe = async (newSessionId) => {
    // 在切換對話前，先保存當前對話狀態（使用最新的 session）
    const sessionToSave = latestSession.current || currentSession
    if (sessionToSave && sessionId && sessionId !== newSessionId) {
      try {
        await updateSession(sessionToSave)
        console.log('Saved current session before switching:', sessionId)
      } catch (e) {
        console.error('Failed to save current session:', e)
      }
    }

    if (currentPort.current) {
      try {
        currentPort.current.postMessage({ stop: true })
        currentPort.current.disconnect()
      } catch (e) {
        /* empty */
      }
      currentPort.current = null
    }

    const { session, currentSessions } = await getSession(newSessionId)
    if (session) {
      setSessionId(newSessionId)
      // 立即更新 sessions 狀態以保持同步
      setSessions(currentSessions)
    } else if (currentSessions.length > 0) {
      setSessionId(currentSessions[0].sessionId)
      setSessions(currentSessions)
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = config.themeMode
  }, [config.themeMode])

  useEffect(() => {
    // eslint-disable-next-line
    ;(async () => {
      const urlFrom = new URLSearchParams(window.location.search).get('from')
      const sessions = await getSessions()
      if (
        urlFrom !== 'store' &&
        sessions[0].conversationRecords &&
        sessions[0].conversationRecords.length > 0
      ) {
        await createNewChat()
      } else {
        setSessions(sessions)
        await setSessionIdSafe(sessions[0].sessionId)
      }
    })()
  }, [])

  useEffect(() => {
    if ('sessions' in config && config['sessions']) setSessions(config['sessions'])
  }, [config])

  useEffect(() => {
    // eslint-disable-next-line
    ;(async () => {
      if (sessions.length > 0) {
        const { session } = await getSession(sessionId)
        if (session) {
          // 調試日誌
          console.log('[IndependentPanel] Loading session:', {
            sessionId: session.sessionId,
            recordsCount: session.conversationRecords?.length || 0,
            hasThinkingData: session.conversationRecords?.some((r) => r.thinkingData?.hasReasoning),
          })

          setCurrentSession(session)
          latestSession.current = session // 同步更新引用
          setRenderContent(false)
          setTimeout(() => {
            setRenderContent(true)
          })
        }
      }
    })()
  }, [sessionId])

  const toggleSidebar = () => {
    setCollapsed(!collapsed)
  }

  const createNewChat = async () => {
    const { session, currentSessions } = await createSession()
    setSessions(currentSessions)
    await setSessionIdSafe(session.sessionId)
  }

  const exportConversations = async () => {
    const sessions = await getSessions()
    const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'text/json;charset=utf-8' })
    FileSaver.saveAs(blob, 'conversations.json')
  }

  const clearConversations = async () => {
    const sessions = await resetSessions()
    setSessions(sessions)
    await setSessionIdSafe(sessions[0].sessionId)
  }

  return (
    <div className="IndependentPanel">
      <div className="chat-container">
        <div className={`chat-sidebar ${collapsed ? 'collapsed' : ''}`}>
          <div className="chat-sidebar-button-group">
            <button className="normal-button" onClick={toggleSidebar}>
              {collapsed ? t('Pin') : t('Unpin')}
            </button>
            <button className="normal-button" onClick={createNewChat}>
              {t('New Chat')}
            </button>
            <button className="normal-button" onClick={exportConversations}>
              {t('Export')}
            </button>
          </div>
          <hr />
          <div className="chat-list">
            {sessions.map(
              (
                session,
                index, // TODO editable session name
              ) => (
                <button
                  key={index}
                  className={`normal-button ${sessionId === session.sessionId ? 'active' : ''}`}
                  style="display: flex; align-items: center; justify-content: space-between;"
                  onClick={() => {
                    setSessionIdSafe(session.sessionId)
                  }}
                >
                  {session.sessionName}
                  <span className="gpt-util-group">
                    <DeleteButton
                      size={14}
                      text={t('Delete Conversation')}
                      onConfirm={() =>
                        deleteSession(session.sessionId).then((sessions) => {
                          setSessions(sessions)
                          setSessionIdSafe(sessions[0].sessionId)
                        })
                      }
                    />
                  </span>
                </button>
              ),
            )}
          </div>
          <hr />
          <div className="chat-sidebar-button-group">
            <ConfirmButton text={t('Clear conversations')} onConfirm={clearConversations} />
            <button
              className="normal-button"
              onClick={() => {
                openUrl(Browser.runtime.getURL('popup.html'))
              }}
            >
              {t('Settings')}
            </button>
          </div>
        </div>
        <div className="chat-content">
          {renderContent && currentSession && currentSession.conversationRecords && (
            <div className="chatgptbox-container" style="height:100%;">
              <ConversationCard
                session={currentSession}
                notClampSize={true}
                pageMode={true}
                onUpdate={(port, session, cData) => {
                  currentPort.current = port

                  // 更新當前 session 狀態
                  if (session) {
                    setCurrentSession(session)
                    latestSession.current = session // 同時更新引用
                  }

                  // 儲存邏輯優化：保存在回答完成、有實際內容更新，或思考內容更新時，或發生錯誤時
                  if (cData.length > 0) {
                    const lastItem = cData[cData.length - 1]
                    const isAnswer = lastItem.type === 'answer'
                    const isError = lastItem.type === 'error'
                    const hasContent =
                      isAnswer && lastItem.content && !lastItem.content.includes('gpt-loading')
                    const hasReasoning =
                      isAnswer && lastItem.thinkingData && lastItem.thinkingData.hasReasoning
                    const isDone = lastItem.done
                    // 當符合條件（完成、實際內容、思考數據或錯誤）時保存
                    if (isDone || hasContent || hasReasoning || isError) {
                      updateSession(session)
                        .then(() => {
                          console.log('Session updated:', session.sessionId)
                          // 重新獲取最新的 sessions 列表
                          getSessions().then(setSessions)
                        })
                        .catch((e) => {
                          console.error('Failed to update session:', e)
                        })
                    }
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
