// @ts-check

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage()
})
