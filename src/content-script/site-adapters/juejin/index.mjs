import { cropText } from '../../../utils'

export default {
  inputQuery: async () => {
    try {
      const title = document.querySelector(
        '#juejin > div.view-container > main > div > div.main-area.article-area > article > h1',
      )?.textContent
      const description = document.querySelector(
        '#juejin > div.view-container > main > div > div.main-area.article-area > article > div.article-content',
      )?.textContent
      if (title && description) {
        const author = document.querySelector(
          '#juejin > div.view-container > main > div > div.main-area.article-area > article > div.author-info-block > div > div.author-name > a > span.name',
        )?.textContent
        const comments = document.querySelectorAll(
          'div.content-box > div.comment-main > div.content',
        )
        let comment = ''
        for (let i = 1; i <= comments.length && i <= 4; i++) {
          comment += `answer${i}: ${comment[i - 1].textContent}|`
        }
        return await cropText(
          `You are an expert content analyst and summarizer. ` +
            `Please analyze the following Juejin article and its comments. Provide a summary of the article (including author), your opinion on it, and a summary of the comments.\n` +
            `Article Title: "${title}"\n` +
            `Author: "${author}"\n` +
            `Content:\n"${description}"\n\n` +
            `Selected comments:\n${comment}`,
        )
      }
    } catch (e) {
      console.log(e)
    }
  },
}
