import { BrowserWindow, ipcMain, screen } from 'electron'

export function setupIpc(win: BrowserWindow): void {
  ipcMain.handle('screen:getCursorPos', () => {
    return screen.getCursorScreenPoint()
  })

  ipcMain.handle('window:getPosition', () => {
    return win.getPosition()
  })
}
