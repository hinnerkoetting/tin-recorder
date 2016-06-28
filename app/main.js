const electron = require('electron')
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
let mainWindow;

var debug;

function createWindow() {
  mainWindow = new BrowserWindow({ width: 800, height: 600 });
  mainWindow.loadURL(`file://${__dirname}/views/index.html`);

  if (debug) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}
app.on('ready', createWindow)

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow()
  }
})

function analyseParameter() {
  process.argv.forEach(arg => {
    if (arg == "--debug") {
      console.info("debug mode is active");
      debug = true;
    }
  });
}

analyseParameter();

process.on('uncaughtException', (err) => {
  console.log(`Caught exception: ${err}`);
  mainWindow.webContents.send('showError("uncaught error");');
});

var ipc = require('electron').ipcMain;

ipc.on('onError', () => mainWindow.webContents.openDevTools());

