// Content scripts must never receive access to stored provider credentials.
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'read-selection', title: 'Read selection out loud', contexts: ['selection'] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'read-selection' || !tab?.id) return;
  // Open synchronously from the user gesture. Storage bridges a panel startup race.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
  chrome.storage.session.set({ pendingRead: {
    id: crypto.randomUUID(), title: tab.title || 'Selected text', text: info.selectionText,
    url: info.pageUrl || '', index: 0, bookmarks: [],
  } }).catch(console.error);
});
