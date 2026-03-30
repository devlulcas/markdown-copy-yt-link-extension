// @ts-check

(function () {
const TEMPLATE_STORAGE_KEY = "markdownTemplate"

/**
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function getMessage(key, fallback) {
  const message = chrome.i18n.getMessage(key)
  return message || fallback
}

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
 * @param {string} message
 */
function setStatus(message) {
  const status = document.getElementById("status")
  if (!(status instanceof HTMLElement)) {
    return
  }

  status.textContent = message
}

/**
 * @returns {HTMLTextAreaElement}
 */
function getTemplateInput() {
  const input = document.getElementById("template")
  if (!(input instanceof HTMLTextAreaElement)) {
    throw new Error("Template input not found")
  }
  return input
}

async function loadTemplate() {
  const input = getTemplateInput()
  const stored = await chrome.storage.sync.get(TEMPLATE_STORAGE_KEY)
  const maybeTemplate = stored[TEMPLATE_STORAGE_KEY]
  const defaultTemplate = getDefaultTemplate()
  input.value = typeof maybeTemplate === "string" && maybeTemplate.trim() ? maybeTemplate : defaultTemplate
}

async function saveTemplate() {
  const input = getTemplateInput()
  await chrome.storage.sync.set({
    [TEMPLATE_STORAGE_KEY]: input.value.trim() || getDefaultTemplate(),
  })
  setStatus(getMessage("saved", "Saved"))
  window.setTimeout(() => {
    setStatus("")
  }, 1600)
}

async function resetTemplate() {
  const input = getTemplateInput()
  const defaultTemplate = getDefaultTemplate()
  input.value = defaultTemplate
  await chrome.storage.sync.set({
    [TEMPLATE_STORAGE_KEY]: defaultTemplate,
  })
  setStatus(getMessage("defaultRestored", "Default restored"))
  window.setTimeout(() => {
    setStatus("")
  }, 1600)
}

function localizePage() {
  document.title = getMessage("optionsTitle", "Markdown Copy YT Link")
  setText("heading", getMessage("optionsTitle", "Markdown Copy YT Link"))
  setText("description", getMessage("configureTheMarkdownTemplate", "Configure the markdown template used by the YouTube copy button."))
  setText("template-label", getMessage("templateLabel", "Template"))
  setText("save", getMessage("save", "Save"))
  setText("reset", getMessage("resetDefault", "Reset default"))
  setText("variables-line", getMessage("variablesLine", "Variables:"))
  setText("formatters-line", getMessage("formattersLine", "Formatters:"))
  setText("date-patterns-line", getMessage("datePatternsLine", "Date patterns for publishedAt:"))
  setText("date-example-line", getMessage("dateExampleLine", "Example:"))
  setText("extra-example-line", getMessage("extraFormattersExampleLine", "Examples:"))
}

/**
 * @param {string} id
 * @param {string} value
 */
function setText(id, value) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) {
    return
  }
  element.textContent = value
}

function attachEvents() {
  const saveButton = document.getElementById("save")
  const resetButton = document.getElementById("reset")
  if (!(saveButton instanceof HTMLButtonElement) || !(resetButton instanceof HTMLButtonElement)) {
    throw new Error("Options buttons not found")
  }

  saveButton.addEventListener("click", () => {
    void saveTemplate()
  })
  resetButton.addEventListener("click", () => {
    void resetTemplate()
  })
}

function init() {
  localizePage()
  attachEvents()
  void loadTemplate()
}

init()
})()
