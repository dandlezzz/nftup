const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const isDev = require('electron-is-dev')
const path = require('path')
const { filesFromPath } = require('files-from-path')
const { NFTStorage } = require('nft.storage')
const Store = require('electron-store')
const fs = require('fs')
const { AddressLookupTableInstruction } = require('@solana/web3.js')
const manifest = `${app.getPath('appData')}/fini_manifest.json`;
const logFile = `${app.getPath('appData')}/fini_log.txt`;

const endpoint = 'https://api.nft.storage'
const maxRetries = 10

const dataStore = {
  dirSet: {
    path: '',
    name: '',
    subdirectories: [],
  }
}

const getDirectorySize = async (dirPath) => {
  let totalBytes = 0;

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    totalBytes += stat.size;
  }

  return totalBytes;
};
function appendLog(message) {
  let date = new Date();
  let timestamp = date.toLocaleString();
  let logMessage = `[${timestamp}] ${message}`;
  fs.appendFile(logFile, logMessage + '\n', (err) => {
    if (err) throw err;
    console.log(`The message "${message}" was appended to the log.`);
  });
}

const getDirectories = source =>
  fs.readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)



function createWindow() {
  const store = new Store({ schema: { apiToken: { type: 'string' } } })

  const template = [
    { role: 'appMenu' },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    ...isDev ? [{ role: 'viewMenu' }] : [],
    {
      label: 'Tools',
      submenu: [{
        id: 'clear-api-token',
        label: 'Clear API Token',
        click: () => store.set('apiToken', ''),
        enabled: true
      }]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: () => shell.openExternal('https://nft.storage')
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  const mainWindow = new BrowserWindow({
    title: 'NFT UP',
    width: 1760,
    height: 840,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadURL(isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '..', 'build', 'index.html')}`)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  function updateManifest(sub, cid) {
    let data = {}

    if (fs.existsSync(manifest)) {
      const fileContent = fs.readFileSync(manifest);
      data = JSON.parse(fileContent);
    } else {
      fs.writeFileSync(manifest, "{}");
      const fileContent = fs.readFileSync(manifest);
      data = JSON.parse(fileContent);
    }
    data[dataStore.dirSet.name] = {
      ...data[dataStore.dirSet.name],
      ...{
        [sub.name]: cid
      }
    }

    appendLog(`adding to manifest: ${sub.name} - ${cid}`)
    fs.writeFileSync(manifest, JSON.stringify(data, null, 2));
    dataStore.manifestPath = manifest;

    sendUploadProgress(dataStore)
  } // mainWindow.webContents.openDevTools()

  ipcMain.handle('setApiToken', (_, token) => store.set('apiToken', token))
  ipcMain.handle('hasApiToken', () => Boolean(store.get('apiToken')))

  const sendUploadProgress = p => mainWindow.webContents.send('uploadProgress', p)
  const sendDirSetConfirmed = p => mainWindow.webContents.send('dirSetConfirmed', p)

  ipcMain.on('setDir', async (event, path, name) => {
    appendLog(`dir set: path - ${path}, name - ${name}`)
    dataStore.dirSet.path = path
    dataStore.dirSet.name = name
    const subdirectories = []
    await getDirectories(path).forEach(async (sub) => await subdirectories.push({
      name: sub,
      totalBytes: await getDirectorySize(path + "/" + sub),
      uploadedBytes: 0,
    }))
    dataStore.dirSet.subdirectories = subdirectories
    appendLog(`subdirs: ${JSON.stringify(dataStore.dirSet.subdirectories)}`)



    sendDirSetConfirmed(dataStore)
    processUploads()

  })

  async function updateProgress(sub) {
    const subI = dataStore.dirSet.subdirectories.findIndex(asubd => asubd.name == sub.name)
    dataStore.dirSet.subdirectories[subI] = sub

    sendUploadProgress(dataStore)
  }

  async function processUploads() {
    for (const sub of dataStore.dirSet.subdirectories) {
      await uploadDir(sub);
    }
  }

  function pathFromDir(dir) {
    return dataStore.dirSet.path + "/" + dir
  }

  async function uploadDir(sub) {
    appendLog(`beginning upload: ${sub.name}`)
    const token = store.get('apiToken')
    const fullDirPath = pathFromDir(sub.name)

    const dir = fs.readdirSync(fullDirPath)
    if (!token) {
      return sendUploadProgress({ error: 'missing API token' })
    }

    try {
      let totalBytes = 0
      const files = []
      try {
        for await (const file of filesFromPath(fullDirPath)) {
          files.push(file)
          totalBytes += file.size
        }
      } catch (err) {
        console.error(err)
        appendLog(`error: ${err.message}`)
        dataStore.error = err.message
        return sendUploadProgress(dataStore)
      }

      let cid, car
      try {
        ({ cid, car } = await NFTStorage.encodeBlob(files[0]))
      } catch (err) {
        console.error(err)
        appendLog(`error: ${err.message}`)
        dataStore.error = err.message
        return sendUploadProgress(dataStore)
      }

      try {
        let storedChunks = 0;
        let storedBytes = 0;
        await NFTStorage.storeCar({ endpoint, token }, car, {
          onStoredChunk(size) {
            storedChunks++
            storedBytes += size
            updateProgress({
              ...sub,
              uploadedBytes: storedBytes
            })
          },
          maxRetries
        })
        appendLog(`upload finished: ${sub.name}`)
        updateManifest(sub, cid.toString())
      } catch (err) {
        console.error(err)
        appendLog(`error: ${err.message}`)
        dataStore.error = err.message
        return sendUploadProgress(dataStore)
      } finally {
        appendLog(`closing blockstore`)
        if (car && car.blockstore && car.blockstore.close) {
          try {
            await car.blockstore.close()
          } catch (err) {
            appendLog(`failed to close blockstore: ${err.message}`)
            dataStore.error = err.message
            console.error('failed to close blockstore', err)
          }
        }
      }
    } finally {
      mainWindow.setProgressBar(-1)
    }
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  // if (process.platform !== 'darwin') app.quit()
  app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
