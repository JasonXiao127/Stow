const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { writeMetadata } = require('../metadata');

function setupMetadataHandlers() {
  // Open file dialog for audio files
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'm4a', 'opus', 'ogg', 'flac', 'wav', 'webm'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Open image dialog for thumbnail replacement
  ipcMain.handle('open-image-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Read metadata from a file
  ipcMain.handle('read-metadata', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const musicMetadata = require('music-metadata');
      const metadata = await musicMetadata.parseFile(filePath);

      const tags = {
        title: metadata.common.title || '',
        artist: metadata.common.artist || '',
        album: metadata.common.album || '',
        track: metadata.common.track?.no ? String(metadata.common.track.no) : '',
        genre: metadata.common.genre?.[0] || '',
        year: metadata.common.year ? String(metadata.common.year) : '',
      };

      // Extract cover art as base64
      let coverArt = null;
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const picture = metadata.common.picture[0];
        // Normalize format to a valid MIME type for use in a data URI
        let format = picture.format;
        if (!format || !format.includes('/')) {
          if (format === 'jpg' || format === 'jpeg' || format === 'image/jpg') {
            format = 'image/jpeg';
          } else if (format === 'png') {
            format = 'image/png';
          } else if (format === 'webp') {
            format = 'image/webp';
          } else if (format === 'bmp') {
            format = 'image/bmp';
          } else if (format === 'gif') {
            format = 'image/gif';
          } else {
            format = 'image/jpeg'; // safe fallback
          }
        }
        coverArt = {
          data: Buffer.from(picture.data).toString('base64'),
          format: format,
          type: picture.type,
        };
      }

      return { tags, coverArt };
    } catch (err) {
      throw new Error(`Failed to read metadata: ${err.message}`);
    }
  });

  // Write metadata to a file
  ipcMain.handle('write-metadata', async (event, filePath, tags, newThumbnailPath) => {
    try {
      const result = await writeMetadata(filePath, tags, newThumbnailPath || null);
      return { success: true, filePath: result };
    } catch (err) {
      throw new Error(`Failed to write metadata: ${err.message}`);
    }
  });
}

module.exports = { setupMetadataHandlers };