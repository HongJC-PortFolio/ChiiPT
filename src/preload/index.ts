import { contextBridge, ipcRenderer } from 'electron';
import type { AppCommand, DesktopBridge } from '../renderer/shared/types/index.ts';

const api: DesktopBridge = {
  setInteractive: interactive => ipcRenderer.send('overlay:interactive', interactive),
  showMenu: () => ipcRenderer.send('overlay:menu'),
  publish: snapshot => ipcRenderer.send('app:snapshot', snapshot),
  onCommand: listener => {
    const handler = (_event: Electron.IpcRendererEvent, command: AppCommand) => listener(command);
    ipcRenderer.on('app:command', handler);
    return () => ipcRenderer.removeListener('app:command', handler);
  }
};
contextBridge.exposeInMainWorld('chiipt', api);
