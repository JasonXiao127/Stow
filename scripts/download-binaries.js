const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLATFORM = process.platform;
const BIN_DIR = path.join(__dirname, '..', 'bin', PLATFORM === 'win32' ? 'win32' : PLATFORM === 'darwin' ? 'darwin' : 'linux');

const BINARIES = {
  'yt-dlp': {
    win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
    linux: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
  },
  'ffmpeg': {
    win32: {
      url: 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip',
      extract: 'ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe',
    },
    darwin: {
      url: 'https://evermeet.cx/ffmpeg/ffmpeg-7.1.zip',
      extract: 'ffmpeg',
    },
    linux: {
      url: 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz',
      extract: 'ffmpeg-master-latest-linux64-gpl/bin/ffmpeg',
    },
  },
};

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(destPath, () => {});
      reject(err);
    });
  });
}

function extractZip(zipPath, extractDir, fileInZip) {
  console.log(`Extracting ${zipPath}...`);
  if (process.platform === 'win32') {
    // Use PowerShell to extract
    const cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`;
    execSync(cmd, { stdio: 'inherit' });
  } else {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
  }
}

async function downloadBinaries() {
  console.log(`Platform: ${PLATFORM}`);
  console.log(`Binary directory: ${BIN_DIR}`);

  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  // Download yt-dlp
  const ytDlpUrl = BINARIES['yt-dlp'][PLATFORM];
  if (!ytDlpUrl) {
    console.error(`Unsupported platform: ${PLATFORM}`);
    process.exit(1);
  }

  const ytDlpExt = PLATFORM === 'win32' ? '.exe' : '';
  const ytDlpPath = path.join(BIN_DIR, `yt-dlp${ytDlpExt}`);

  if (!fs.existsSync(ytDlpPath)) {
    await downloadFile(ytDlpUrl, ytDlpPath);
    if (PLATFORM !== 'win32') {
      fs.chmodSync(ytDlpPath, 0o755);
    }
    console.log(`yt-dlp downloaded to ${ytDlpPath}`);
  } else {
    console.log('yt-dlp already exists, skipping.');
  }

  // Download FFmpeg
  const ffmpegConfig = BINARIES['ffmpeg'][PLATFORM];
  const ffmpegPath = path.join(BIN_DIR, PLATFORM === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

  if (!fs.existsSync(ffmpegPath)) {
    const zipPath = path.join(BIN_DIR, 'ffmpeg.zip');
    await downloadFile(ffmpegConfig.url, zipPath);

    // Extract
    const extractDir = path.join(BIN_DIR, 'ffmpeg-extract');
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    if (PLATFORM === 'win32') {
      extractZip(zipPath, extractDir, null);
    } else {
      // For macOS/Linux, use system unzip/tar
      if (zipPath.endsWith('.zip')) {
        execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'inherit' });
      } else if (zipPath.endsWith('.tar.xz')) {
        execSync(`tar -xf "${zipPath}" -C "${extractDir}"`, { stdio: 'inherit' });
      }
    }

    // Move ffmpeg binary
    const extractedFfmpeg = path.join(extractDir, ffmpegConfig.extract);
    if (fs.existsSync(extractedFfmpeg)) {
      fs.copyFileSync(extractedFfmpeg, ffmpegPath);
      if (PLATFORM !== 'win32') {
        fs.chmodSync(ffmpegPath, 0o755);
      }
      console.log(`FFmpeg downloaded to ${ffmpegPath}`);
    } else {
      console.error(`Could not find ffmpeg in extracted files at ${extractedFfmpeg}`);
    }

    // Cleanup
    fs.unlinkSync(zipPath);
    fs.rmSync(extractDir, { recursive: true, force: true });
  } else {
    console.log('FFmpeg already exists, skipping.');
  }

  console.log('All binaries downloaded successfully!');
}

downloadBinaries().catch((err) => {
  console.error('Failed to download binaries:', err.message);
  process.exit(1);
});