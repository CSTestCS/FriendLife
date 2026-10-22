// Electron shell for FriendLife: opens the game window and exposes the
// "mods" folder (next to the .exe) so players can drop in VRM characters,
// outfits, textures and animations without using the import dialog.
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const MOD_TYPES = { characters: 'character', outfits: 'outfit', textures: 'texture', animations: 'animation' };
const EXTS = { character: ['.vrm'], outfit: ['.vrm'], texture: ['.png', '.jpg', '.jpeg', '.webp'], animation: ['.vrma', '.fbx', '.json'] };

function modsRoots() {
  // Portable exe: next to the .exe the user launched. Otherwise next to the app / user data.
  const roots = [];
  if (process.env.PORTABLE_EXECUTABLE_DIR) roots.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'mods'));
  else if (app.isPackaged) roots.push(path.join(path.dirname(process.execPath), 'mods'));
  else roots.push(path.join(__dirname, '..', 'mods'));
  roots.push(path.join(app.getPath('userData'), 'mods'));
  return roots;
}

function ensureModFolders() {
  const root = modsRoots()[0];
  try {
    for (const folder of Object.keys(MOD_TYPES)) fs.mkdirSync(path.join(root, folder), { recursive: true });
    const readme = path.join(root, 'README.txt');
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(readme, [
        'FriendLife mods folder',
        '======================',
        'Drop files here and press "Rescan" in the Library (or restart the game):',
        '  characters/   .vrm   VRoid / VRM avatars that can become residents',
        '  outfits/      .vrm   VRoid models whose clothes get fitted onto residents',
        '  textures/     .png .jpg .webp   textures for the Wardrobe and island surfaces',
        '  animations/   .vrma .fbx .json   VRM Animations, Mixamo FBX animations, or FriendLife JSON keyframe animations',
        '',
      ].join('\r\n'));
    }
  } catch (err) {
    console.warn('Could not create mods folder', err);
  }
  return root;
}

function listMods() {
  const out = [];
  const seen = new Set();
  for (const root of modsRoots()) {
    for (const [folder, type] of Object.entries(MOD_TYPES)) {
      const dir = path.join(root, folder);
      let files = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if (!EXTS[type].includes(ext)) continue;
        const full = path.join(dir, f);
        const key = `${type}/${f}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const st = fs.statSync(full);
          out.push({ type, file: f, path: full, size: st.size, mtime: st.mtimeMs });
        } catch { /* ignore */ }
      }
    }
  }
  return out;
}

function isInsideMods(p) {
  const resolved = path.resolve(p);
  return modsRoots().some((root) => resolved.startsWith(path.resolve(root) + path.sep));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'FriendLife',
    backgroundColor: '#8fd3ff',
    icon: path.join(__dirname, '..', 'dist', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ensureModFolders();
  ipcMain.handle('mods:list', () => listMods());
  ipcMain.handle('mods:read', (_e, p) => {
    if (!isInsideMods(p)) throw new Error('Refusing to read outside the mods folder');
    return fs.readFileSync(p);
  });
  ipcMain.handle('samples:read', (_e, name) => {
    const dir = path.join(__dirname, '..', 'dist', 'samples');
    if (!fs.readdirSync(dir).includes(name)) throw new Error('Unknown sample');
    return fs.readFileSync(path.join(dir, name));
  });
  ipcMain.handle('mods:open', (_e, sub) => {
    const root = ensureModFolders();
    const folder = Object.keys(MOD_TYPES).includes(sub) ? path.join(root, sub) : root;
    return shell.openPath(folder);
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
