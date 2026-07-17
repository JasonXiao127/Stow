const { ipcMain, shell, dialog } = require('electron');

function setupDownloadHandlers(downloadManager) {
  // Start downloads
  ipcMain.handle('start-downloads', (event, urls) => {
    const jobs = downloadManager.addJobs(urls);
    return jobs;
  });

  // Show file in system file manager (Explorer on Windows, Finder on macOS)
  ipcMain.handle('show-in-folder', async (event, filePath) => {
    const fs = require('fs');
    if (!filePath || !fs.existsSync(filePath)) {
      await dialog.showMessageBox({
        type: 'warning',
        title: 'File Not Found',
        message: 'The file could not be found.',
        detail: filePath
          ? `This file does not exist:\n${filePath}\n\nIt may have been moved, deleted, or the download may not have completed successfully.`
          : 'No file path was provided.',
        buttons: ['OK'],
      });
      return;
    }
    shell.showItemInFolder(filePath);
  });

  // Cancel all downloads
  ipcMain.handle('cancel-downloads', () => {
    downloadManager.cancelAll();
    return true;
  });

  // Cancel a specific job
  ipcMain.handle('cancel-job', (event, jobId) => {
    downloadManager.cancelJob(jobId);
    return true;
  });

  // Get current queue state
  ipcMain.handle('get-queue', () => {
    return downloadManager.getQueue();
  });

  // Forward events to the renderer
  const sendToRenderer = (channel, data) => {
    const win = require('electron').BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  };

  downloadManager.on('queue-updated', (queue) => {
    sendToRenderer('queue-updated', queue);
  });

  downloadManager.on('download-progress', (progress) => {
    sendToRenderer('download-progress', progress);
  });

  downloadManager.on('download-complete', (result) => {
    sendToRenderer('download-complete', result);
  });

  downloadManager.on('all-complete', () => {
    sendToRenderer('all-downloads-complete');
  });
}

module.exports = { setupDownloadHandlers };