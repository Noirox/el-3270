import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

import { Subscription } from 'rxjs';
import { Tn3270 } from 'tn3270';

/**
 * Electron event dispatcher
 */
const { BrowserWindow, app, dialog, ipcMain } = require('electron');
const isDev = process.env['DEV_MODE'] === '1';

let theConnection: Subscription;
let theWindow = null;
let theTn3270: Tn3270;

app.on('ready', () => {
  require('electron-capture');
  theWindow = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: true,
    webPreferences: {
      // NOTE: we remove /dist in dev mode
      preload: (isDev? __dirname.substring(0, __dirname.length - 5) :  __dirname) + '/node_modules/electron-capture/src/preload.js'
    }
  });
  if (isDev) {
    require('devtron').install();
    const { default: installExtension } = require('electron-devtools-installer');
    // https://chrome.google.com/webstore/detail/redux-devtools/
    //   lmhkpmbekcpmknklioeibfkpmmfibljd
    installExtension('lmhkpmbekcpmknklioeibfkpmmfibljd')
      .then((name) => console.log(`Added Extension:  ${name}`))
      .catch((err) => console.log('An error occurred: ', err));
    // https://chrome.google.com/webstore/detail/local-storage-explorer/
    //   hglfomidogadbhelcfomenpieffpfaeb?hl=en
    installExtension('hglfomidogadbhelcfomenpieffpfaeb')
      .then((name) => console.log(`Added Extension:  ${name}`))
      .catch((err) => console.log('An error occurred: ', err));
    theWindow.loadURL(url.format({
      hostname: 'localhost',
      pathname: path.join(),
      port: 4200,
      protocol: 'http:',
      query: {isDev: true},
      slashes: true
    }));
    theWindow.webContents.openDevTools();
  }
  else {
    theWindow.loadURL(url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true
    }));
  }
  theWindow.setMenu(null);
  // event handlers
  theWindow.on('blur', () => {
    theWindow.webContents.send('focused', false);
  });
  theWindow.on('close', () => {
    if (theConnection)
      theConnection.unsubscribe();
    theConnection = null;
  });
  theWindow.on('focus', () => {
    theWindow.webContents.send('focused', true);
  });
  const sendBounds = () =>
    theWindow.webContents.send('bounds', theWindow.getBounds());
  theWindow.on('move', sendBounds);
  theWindow.on('resize', sendBounds);
});

app.on('window-all-closed', () => {
  if (theConnection)
    theConnection.unsubscribe();
  app.quit();
});

ipcMain.on('connect', (event: any,
                       host: string,
                       port: number,
                       model: string) => {
  theTn3270 = new Tn3270(host, port, model);
  let sequence = 0;
  theConnection = theTn3270.stream$.subscribe({
    next: (data: Buffer) => {
      // YES -- I know this is crap
      if (sequence++ === 0)
        theWindow.webContents.send('connected');
      const view = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++)
        view[i] = data[i];
      theWindow.webContents.send('data', view);
    },
    error: (error: Error) => theWindow.webContents.send('error', error.message),
    complete: () => theWindow.webContents.send('disconnected')
  });
});

ipcMain.on('disconnect', () => {
  if (theConnection) {
    theWindow.webContents.send('disconnected');
    theConnection.unsubscribe();
    theConnection = null;
  }
});

ipcMain.on('print', (event: any) => {
  dialog.showSaveDialog(theWindow, {
    filters: [
      {name: 'PNG Files', extensions: ['png']},
    ],
    title: 'Save EL-3270 Screen Image'
  }, filename => {
    if (filename) {
      theWindow['captureFullPage']((imageStream) => {
        imageStream.pipe(fs.createWriteStream(filename));
      });
    }
  });
});

ipcMain.on('write', (event: any,
                     data: Uint8Array) => {
  theTn3270.write(data);
});
