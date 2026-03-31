// @ts-check

(function () {
const BUTTON_HOST_ID = "markdown-copy-yt-link-host"
const BUTTON_ID = "markdown-copy-yt-link-button"
const TEMPLATE_STORAGE_KEY = "markdownTemplate"
const SUCCESS_MS = 1400
const TARGET_SELECTOR = "#above-the-fold #menu #top-level-buttons-computed"
const BUTTON_LABEL = getMessage("copyMarkdown", "Copy markdown")
const BUTTON_ARIA_LABEL = getMessage("copyMarkdownAriaLabel", "Copy markdown")
const COPY_ICON_PATH = "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 18H8V7h11v16z"
const SUCCESS_ICON_PATH = "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"

function getDefaultTemplate() {
  const channelLabel = getMessage("templateLabelChannel", "channel")
  const publishedLabel = getMessage("templateLabelPublished", "published")
  const thumbnailLabel = getMessage("templateLabelThumbnail", "thumbnail")
  return `[{{title}}]({{url}})
- ${channelLabel}: {{channel|uppercase}}
- ${publishedLabel}: {{publishedAt|YYYY-MMMM|uppercase}}
- ${thumbnailLabel}: {{thumbnail}}`
}

/**
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function getMessage(key, fallback) {
  const message = chrome.i18n.getMessage(key)
  return message || fallback
}

/**
 * @typedef {Object} VideoData
 * @property {string} title
 * @property {string} url
 * @property {string} channel
 * @property {string} thumbnail
 * @property {string} publishedAt
 */

let successResetTimeoutId = /** @type {number | undefined} */ (undefined)
let observer = /** @type {MutationObserver | null} */ (null)
let lastUrl = window.location.href

function init() {
  injectButton()
  startObservers()
}

function startObservers() {
  if (observer) {
    observer.disconnect()
  }

  observer = new MutationObserver(() => {
    const currentUrl = window.location.href
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl
      injectButton()
      return
    }

    if (!document.getElementById(BUTTON_HOST_ID)) {
      injectButton()
    }
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

function injectButton() {
  const container = document.querySelector(TARGET_SELECTOR)
  if (!(container instanceof HTMLElement)) {
    return
  }

  const existingHost = document.getElementById(BUTTON_HOST_ID)
  if (existingHost) {
    if (existingHost.parentElement !== container) {
      existingHost.remove()
    } else {
      return
    }
  }

  const button = createStyledButton(container)
  const host = document.createElement("yt-button-view-model")
  host.id = BUTTON_HOST_ID
  host.className = "ytd-menu-renderer"
  host.appendChild(button)

  const children = Array.from(container.children)
  const secondElement = children[1]
  if (secondElement) {
    container.insertBefore(host, secondElement)
  } else {
    container.appendChild(host)
  }
}

/**
 * @param {HTMLElement} container
 */
function createStyledButton(container) {
  const referenceButton = findReferenceShareButton(container)
  const buttonViewModel = document.createElement("button-view-model")
  buttonViewModel.className = "ytSpecButtonViewModelHost style-scope ytd-menu-renderer"

  const button = document.createElement("button")
  button.id = BUTTON_ID
  button.type = "button"
  button.ariaLabel = BUTTON_ARIA_LABEL
  button.ariaDisabled = "false"
  button.className = referenceButton?.className ??
    "yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--enable-backdrop-filter-experiment"

  button.classList.remove("yt-spec-button-shape-next--icon-leading")
  button.title = ""

  const textContent = document.createElement("div")
  textContent.className = "yt-spec-button-shape-next__button-text-content"
  setButtonIconContent(textContent, COPY_ICON_PATH, BUTTON_LABEL)
  button.appendChild(textContent)

  const touchFeedback = document.createElement("yt-touch-feedback-shape")
  touchFeedback.className = "yt-spec-touch-feedback-shape yt-spec-touch-feedback-shape--touch-response"
  touchFeedback.setAttribute("aria-hidden", "true")
  touchFeedback.innerHTML = `
    <div class="yt-spec-touch-feedback-shape__stroke"></div>
    <div class="yt-spec-touch-feedback-shape__fill"></div>
  `
  button.appendChild(touchFeedback)

  button.addEventListener("click", () => {
    void onCopyClick(button)
  })

  buttonViewModel.appendChild(button)
  return buttonViewModel
}

/**
 * @param {HTMLElement} container
 * @returns {HTMLButtonElement | null}
 */
function findReferenceShareButton(container) {
  /** @type {HTMLButtonElement[]} */
  const buttons = Array.from(container.querySelectorAll("button.yt-spec-button-shape-next"))
  for (const candidate of buttons) {
    if (candidate.id === BUTTON_ID) {
      continue
    }

    const text = candidate.querySelector(".yt-spec-button-shape-next__button-text-content")?.textContent?.trim() ?? ""
    if (text.length > 0) {
      return candidate
    }
  }

  return null
}

/**
 * @param {HTMLButtonElement} button
 */
async function onCopyClick(button) {
  const videoData = extractVideoData()
  const template = await getTemplate()
  const output = renderTemplate(template, videoData)
  const copied = await copyToClipboard(output)
  if (copied) {
    showSuccess(button)
  }
}

/**
 * @returns {VideoData}
 */
function extractVideoData() {
  const normalizedUrl = normalizeWatchUrl(window.location.href)

  return {
    title: readMetaTag("meta[property='og:title']") ?? readText("#title h1 yt-formatted-string") ?? document.title.replace(/\s*-\s*YouTube\s*$/i, ""),
    url: normalizedUrl,
    channel: readText("#owner #channel-name a") ?? readText("ytd-channel-name a") ?? "",
    thumbnail: readMetaTag("meta[property='og:image']") ?? "",
    publishedAt: readPublishedAtIso(),
  }
}

/**
 * @param {string} selector
 * @returns {string | null}
 */
function readMetaTag(selector) {
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLMetaElement)) {
    return null
  }

  const content = element.content.trim()
  return content.length > 0 ? content : null
}

/**
 * @param {string} selector
 * @returns {string | null}
 */
function readText(selector) {
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLElement)) {
    return null
  }

  const text = element.textContent?.trim() ?? ""
  return text.length > 0 ? text : null
}

/**
 * @returns {string}
 */
function readPublishedAtIso() {
  const metaDate = document.querySelector("meta[itemprop='datePublished']")
  if (metaDate instanceof HTMLMetaElement && metaDate.content.trim()) {
    return toIsoDate(metaDate.content.trim())
  }

  const ldJsonNodes = Array.from(document.querySelectorAll("script[type='application/ld+json']"))
  for (const node of ldJsonNodes) {
    const raw = node.textContent?.trim()
    if (!raw) {
      continue
    }

    try {
      const parsed = JSON.parse(raw)
      const value = extractDateFromJsonLd(parsed)
      if (value) {
        return toIsoDate(value)
      }
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  }

  return ""
}

/**
 * @param {unknown} data
 * @returns {string}
 */
function extractDateFromJsonLd(data) {
  if (Array.isArray(data)) {
    for (const item of data) {
      const value = extractDateFromJsonLd(item)
      if (value) {
        return value
      }
    }
    return ""
  }

  if (!data || typeof data !== "object") {
    return ""
  }

  const record = /** @type {Record<string, unknown>} */ (data)
  const uploadDate = record.uploadDate
  if (typeof uploadDate === "string" && uploadDate.trim()) {
    return uploadDate.trim()
  }

  const datePublished = record.datePublished
  if (typeof datePublished === "string" && datePublished.trim()) {
    return datePublished.trim()
  }

  const graph = record["@graph"]
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const value = extractDateFromJsonLd(item)
      if (value) {
        return value
      }
    }
  }

  return ""
}

/**
 * @param {string} value
 * @returns {string}
 */
function toIsoDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * @param {string} url
 * @returns {string}
 */
function normalizeWatchUrl(url) {
  try {
    const parsed = new URL(url)
    const videoId = parsed.searchParams.get("v")
    if (!videoId) {
      return url
    }
    return `https://www.youtube.com/watch?v=${videoId}`
  } catch {
    return url
  }
}

/**
 * @returns {Promise<string>}
 */
async function getTemplate() {
  const stored = await chrome.storage.sync.get(TEMPLATE_STORAGE_KEY)
  const maybeTemplate = stored[TEMPLATE_STORAGE_KEY]
  if (typeof maybeTemplate === "string" && maybeTemplate.trim().length > 0) {
    return maybeTemplate
  }

  return getDefaultTemplate()
}

/**
 * @param {string} template
 * @param {VideoData} videoData
 * @returns {string}
 */
function renderTemplate(template, videoData) {
  return template.replace(/{{\s*([^{}]+)\s*}}/g, (_full, inner) => {
    const raw = String(inner)
    const parts = raw.split("|")
    /** @type {string[]} */
    const tokens = []
    for (const part of parts) {
      const token = part.trim()
      if (token) {
        tokens.push(token)
      }
    }
    if (tokens.length === 0) {
      return ""
    }

    const field = tokens[0] ?? ""
    let value = resolveField(videoData, field)
    for (let index = 1; index < tokens.length; index += 1) {
      const formatter = tokens[index]
      if (!formatter) {
        continue
      }
      value = applyFormatter(field, value, formatter)
    }

    return value
  })
}

/**
 * @param {VideoData} videoData
 * @param {string} field
 * @returns {string}
 */
function resolveField(videoData, field) {
  switch (field) {
    case "title":
      return videoData.title
    case "url":
      return videoData.url
    case "channel":
      return videoData.channel
    case "thumbnail":
      return videoData.thumbnail
    case "publishedAt":
      return videoData.publishedAt
    default:
      return ""
  }
}

/**
 * @param {string} field
 * @param {string} value
 * @param {string} formatter
 * @returns {string}
 */
function applyFormatter(field, value, formatter) {
  if (!value) {
    return ""
  }

  if (formatter === "clip-extra") {
    return clipExtra(value)
  }

  if (formatter === "ignore-parentheses") {
    return ignoreParentheses(value)
  }

  if (formatter === "uppercase") {
    return value.toUpperCase()
  }

  if (formatter === "lowercase") {
    return value.toLowerCase()
  }

  if (field === "publishedAt") {
    return formatDate(value, formatter) ?? value
  }

  return value
}

/**
 * @param {string} value
 * @returns {string}
 */
function clipExtra(value) {
  const match = /[.;!?|]/.exec(value)
  if (!match || match.index === undefined) {
    return value
  }

  return value.slice(0, match.index).trim()
}

/**
 * @param {string} value
 * @returns {string}
 */
function ignoreParentheses(value) {
  return value.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim()
}

/**
 * @param {string} isoDate
 * @param {string} pattern
 * @returns {string | null}
 */
function formatDate(isoDate, pattern) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  /** @type {Intl.DateTimeFormatOptions} */
  const options = pattern.split("-").reduce((acc, part) => {
    /** @type {Record<string, Intl.DateTimeFormatOptions>} */
    const options = {
      "YYYY": { year: "numeric" },
      "YY": { year: "2-digit" },
      "MM": { month: "numeric" },  
      "DD": { day: "numeric" },
      "MMMM": { month: "long" },
      "MMM": { month: "short" },
      "M": { month: "numeric" },
      "D": { day: "numeric" },
      "d": { day: "numeric" },
      "h": { hour: "numeric" },
      "H": { hour: "numeric" },
      "m": { minute: "numeric" },
      "s": { second: "numeric" },
    }
    
    const option = options[part]
    
    if (option) {
      acc = { ...acc, ...option }
    }

    return acc
  }, {})

  const formatter = new Intl.DateTimeFormat(navigator.language, options)

  return formatter.format(date)
}

/**
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return fallbackCopy(text)
  }
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function fallbackCopy(text) {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.top = "-9999px"
  textarea.style.left = "-9999px"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  let copied = false
  try {
    copied = document.execCommand("copy")
  } catch {
    copied = false
  } finally {
    textarea.remove()
  }

  return copied
}

/**
 * @param {HTMLButtonElement} button
 */
function showSuccess(button) {
  const content = button.querySelector(".yt-spec-button-shape-next__button-text-content")
  if (!(content instanceof HTMLElement)) {
    return
  }

  if (successResetTimeoutId !== undefined) {
    window.clearTimeout(successResetTimeoutId)
  }

  setButtonIconContent(content, SUCCESS_ICON_PATH, BUTTON_LABEL)

  successResetTimeoutId = window.setTimeout(() => {
    const activeButton = document.getElementById(BUTTON_ID)
    if (activeButton instanceof HTMLButtonElement) {
      const activeContent = activeButton.querySelector(".yt-spec-button-shape-next__button-text-content")
      if (activeContent instanceof HTMLElement) {
        setButtonIconContent(activeContent, COPY_ICON_PATH, BUTTON_LABEL)
      }
    }
    successResetTimeoutId = undefined
  }, SUCCESS_MS)
}

/**
 * @param {HTMLElement} content
 * @param {string} iconPath
 * @param {string} accessibleText
 */
function setButtonIconContent(content, iconPath, accessibleText) {
  content.innerHTML = `
    <span aria-hidden="true" style="display:inline-flex;vertical-align:middle;">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="${iconPath}"></path>
      </svg>
    </span>
    <span style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0, 0, 0, 0);white-space:nowrap;border:0;">
      ${accessibleText}
    </span>
  `
}

init()
})()
