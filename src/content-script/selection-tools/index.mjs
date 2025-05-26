import {
  CardHeading,
  CardList,
  EmojiSmile,
  Palette,
  QuestionCircle,
  Translate,
  Braces,
  Globe,
  ChatText,
} from 'react-bootstrap-icons'
import { getPreferredLanguage } from '../../config/language.mjs'

const createGenPrompt =
  ({
    message = '',
    isTranslation = false,
    targetLanguage = '',
    enableBidirectional = false,
    includeLanguagePrefix = false,
  }) =>
  async (selection) => {
    let preferredLanguage = targetLanguage

    if (!preferredLanguage) {
      preferredLanguage = await getPreferredLanguage()
    }

    // Always replace ${preferredLanguage} placeholder first
    let fullMessage = message.replace(/\$\{preferredLanguage\}/g, preferredLanguage)

    // If it's a translation task and the message wasn't a custom one containing the placeholder,
    // use the standard translation prompt.
    if (isTranslation && !message.includes('${preferredLanguage}')) {
      fullMessage = `Translate the following into ${preferredLanguage} and only show me the translated content`
    }

    if (enableBidirectional) {
      fullMessage += `. If it is already in ${preferredLanguage}, translate it into English and only show me the translated content`
    }
    const prefix = includeLanguagePrefix ? `Reply in ${preferredLanguage}.` : ''
    return `${prefix}${fullMessage}:\n'''\n${selection}\n'''`
  }

export const config = {
  explain: {
    icon: <ChatText />,
    label: 'Explain',
    genPrompt: createGenPrompt({
      message: 'Explain the following',
      includeLanguagePrefix: true,
    }),
  },
  translate: {
    icon: <Translate />,
    label: 'Translate',
    genPrompt: createGenPrompt({
      isTranslation: true,
    }),
  },
  translateToEn: {
    icon: <Globe />,
    label: 'Translate (To English)',
    genPrompt: createGenPrompt({
      isTranslation: true,
      targetLanguage: 'English',
    }),
  },
  translateToZh: {
    icon: <Globe />,
    label: 'Translate (To Chinese)',
    genPrompt: createGenPrompt({
      isTranslation: true,
      targetLanguage: 'Chinese',
    }),
  },
  translateBidi: {
    icon: <Globe />,
    label: 'Translate (Bidirectional)',
    genPrompt: createGenPrompt({
      isTranslation: true,
      enableBidirectional: true,
    }),
  },
  summary: {
    icon: <CardHeading />,
    label: 'Summary',
    genPrompt: createGenPrompt({
      message: 'Summarize the following as concisely as possible',
      includeLanguagePrefix: true,
    }),
  },
  polish: {
    icon: <Palette />,
    label: 'Polish',
    genPrompt: createGenPrompt({
      message:
        'As an expert editor, first polish the provided text for native-speaker clarity, conciseness, and coherence, maintaining its original language.\nThen, explain the polished text in ${preferredLanguage}. If the original input text is not in ${preferredLanguage}, this explanation must include a translation of the polished text into ${preferredLanguage}.\nReturn only the polished text, followed by the explanation.',
    }),
  },
  sentiment: {
    icon: <EmojiSmile />,
    label: 'Sentiment Analysis',
    genPrompt: createGenPrompt({
      message:
        'Analyze the sentiments expressed in the following content and make a brief summary of the sentiments',
      includeLanguagePrefix: true,
    }),
  },
  divide: {
    icon: <CardList />,
    label: 'Divide Paragraphs',
    genPrompt: createGenPrompt({
      message:
        'As an expert editor, first divide the provided text into paragraphs that are easy to read and understand, maintaining its original language.\nThen, explain the restructured text in ${preferredLanguage}. If the original input text is not in ${preferredLanguage}, this explanation must include a translation of the restructured text into ${preferredLanguage}.\nReturn only the restructured text, followed by the explanation.',
    }),
  },
  code: {
    icon: <Braces />,
    label: 'Code Explain',
    genPrompt: createGenPrompt({
      message: 'Explain the following code',
      includeLanguagePrefix: true,
    }),
  },
  ask: {
    icon: <QuestionCircle />,
    label: 'Ask',
    genPrompt: createGenPrompt({
      message: 'Analyze the following content and express your opinion, or give your answer',
      includeLanguagePrefix: true,
    }),
  },
}
