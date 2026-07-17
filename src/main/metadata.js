const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getFfmpegPath } = require('./binaries');

/**
 * Sanitize a string for use in FFmpeg command arguments.
 * Removes or escapes characters that could be used for command injection.
 */
function sanitizeTagValue(value) {
  if (typeof value !== 'string') return '';
  // Remove null bytes and control characters
  return value.replace(/[\x00-\x1f\x7f]/g, '').trim();
}

/**
 * Read metadata from an audio file using music-metadata (called from renderer via IPC).
 * This is a thin wrapper - the actual reading happens in the renderer's preload bridge.
 */

/**
 * Write metadata tags to an audio file using FFmpeg.
 * Uses atomic write: writes to a temp file first, then replaces the original.
 * 
 * @param {string} filePath - Path to the audio file
 * @param {object} tags - Metadata tags { title, artist, album, track, genre, year }
 * @param {string|null} newThumbnailPath - Path to a new thumbnail image, or null to keep existing
 * @returns {Promise<string>} - The path to the updated file
 */
function writeMetadata(filePath, tags, newThumbnailPath = null) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    const ffmpegPath = getFfmpegPath();
    const ext = path.extname(filePath);
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, ext);
    const tempPath = path.join(dir, `${baseName}_temp${ext}`);

    // FFmpeg argument ordering:
    //   ffmpeg [global] -i input0 [-i input1] [output_options] output
    // All -metadata options are output options and must come AFTER all -i inputs.
    const args = ['-y', '-i', filePath];

    // Add second input (thumbnail image) BEFORE output options
    if (newThumbnailPath) {
      if (!fs.existsSync(newThumbnailPath)) {
        return reject(new Error(`Thumbnail file not found: ${newThumbnailPath}`));
      }
      args.push('-i', newThumbnailPath);
    }

    // Output options: metadata tags (must be after all -i inputs)
    const metadataMap = {
      title: 'title',
      artist: 'artist',
      album: 'album',
      track: 'track',
      genre: 'genre',
      year: 'date',
    };

    for (const [key, ffmpegKey] of Object.entries(metadataMap)) {
      const value = sanitizeTagValue(tags[key]);
      if (value) {
        args.push('-metadata', `${ffmpegKey}=${value}`);
      }
    }

    // Output options: stream mapping and codec
    if (newThumbnailPath) {
      args.push('-map', '0:a');                     // keep audio streams from input 0
      args.push('-map', '1:v');                     // map video (cover art) from input 1
      args.push('-c:a', 'copy');                    // copy audio without re-encoding
      args.push('-c:v', 'mjpeg');                   // transcode cover to MJPEG (required by MP3 container)
      args.push('-q:v', '2');                       // high quality JPEG (1-31, lower is better)
      args.push('-disposition:v:0', 'attached_pic'); // mark the mapped video as attached picture
    } else {
      args.push('-map', '0');                       // keep all streams from input 0
      args.push('-c', 'copy');
    }

    args.push(tempPath);

    const childProc = spawn(ffmpegPath, args, {
      windowsHide: true,
    });

    let stderr = '';

    childProc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    childProc.on('close', (code) => {
      if (code === 0) {
        // Atomic replace: rename temp to original (overwrites original on all platforms)
        try {
          // On Windows, renameSync overwrites an existing file atomically.
          // Using unlink+rename would leave no file if rename failed after unlink.
          fs.renameSync(tempPath, filePath);
          resolve(filePath);
        } catch (err) {
          // Clean up temp file on failure
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
          reject(new Error(`Failed to replace original file: ${err.message}`));
        }
      } else {
        // Clean up temp file on failure
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    childProc.on('error', (err) => {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

module.exports = { writeMetadata, sanitizeTagValue };