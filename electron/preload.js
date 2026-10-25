// Safe bridge between the game page and the desktop (mods folder access only).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('friendlife', {
  desktop: true,
  listMods: () => ipcRenderer.invoke('mods:list'),
  readMod: (p) => ipcRenderer.invoke('mods:read', p),
  readSample: (name) => ipcRenderer.invoke('samples:read', name),
  openModsFolder: (sub) => ipcRenderer.invoke('mods:open', sub || ''),
  ttsRender: (jobs) => ipcRenderer.invoke('tts:render', jobs),
  ttsVoices: () => ipcRenderer.invoke('tts:voices'),
});
