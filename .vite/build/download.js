const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { getYtDlpPath, getFfmpegPath } = require('./binaries');

const QUEUE_FILE = path.join(app.getPath('userData'), 'queue-state.json');

class DownloadManager {
  constructor() {
    this.queue = [];
    this.currentJob = null;
    this.isProcessing = false;
    this.listeners = new Map();
    this._loadQueueState();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  _emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach((cb) => cb(data));
  }

  _loadQueueState() {
    try {
      if (fs.existsSync(QUEUE_FILE)) {
        const data = fs.readFileSync(QUEUE_FILE, 'utf-8');
        const savedQueue = JSON.parse(data);
        // Mark any incomplete jobs as Failed (app was closed mid-download)
        this.queue = savedQueue.map((job) => {
          if (job.status !== 'Complete' && job.status !== 'Failed') {
            return { ...job, status: 'Failed', error: 'App was closed during download' };
          }
          return job;
        });
        this._saveQueueState();
        this._emit('queue-updated', this._getSafeQueue());
      }
    } catch (err) {
      console.error('Failed to load queue state:', err.message);
      this.queue = [];
    }
  }

  _saveQueueState() {
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.queue, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save queue state:', err.message);
    }
  }

  addJobs(urls) {
    // Normalize and deduplicate against active queue jobs
    const normalizedUrls = urls.map((u) => u.trim());
    const activeUrls = new Set(
      this.queue
        .filter((j) => ['Pending', 'Fetching', 'Processing', 'Complete'].includes(j.status))
        .map((j) => j.url)
    );
    const uniqueUrls = normalizedUrls.filter((url) => !activeUrls.has(url));
    const skipped = normalizedUrls.length - uniqueUrls.length;

    const newJobs = uniqueUrls.map((url, index) => ({
      id: `job_${Date.now()}_${index}`,
      url: url,
      status: 'Pending',
      progress: 0,
      speed: '',
      eta: '',
      outputPath: '',
      error: '',
      title: '',
      cancelled: false,
    }));

    this.queue.push(...newJobs);
    this._saveQueueState();
    this._emit('queue-updated', this._getSafeQueue());

    if (!this.isProcessing && newJobs.length > 0) {
      this._processNext();
    }

    // Return safe copies for IPC (structured clone algorithm cannot serialize ChildProcess objects)
    return { jobs: newJobs.map((job) => this._getSafeJob(job)), skipped };
  }

  cancelAll() {
    if (this.currentJob) {
      try {
        this.currentJob.process.kill();
      } catch (e) {
        // Process may already have exited
      }
      this.currentJob.cancelled = true;
      this.currentJob = null;
    }

    this.queue = [];
    this.isProcessing = false;
    this._saveQueueState();
    this._emit('queue-updated', this._getSafeQueue());
  }

  cancelJob(jobId) {
    const jobIndex = this.queue.findIndex((j) => j.id === jobId);
    if (jobIndex === -1) return;

    const job = this.queue[jobIndex];
    if (this.currentJob && this.currentJob.id === jobId) {
      try {
        this.currentJob.process.kill();
      } catch (e) {
        // Process may already have exited
      }
      job.cancelled = true;
      this.currentJob = null;
      this.isProcessing = false;
    }

    job.status = 'Failed';
    job.error = 'Cancelled by user';
    this._saveQueueState();
    this._emit('queue-updated', this._getSafeQueue());

    if (!this.isProcessing) {
      this._processNext();
    }
  }

  _getSafeJob(job) {
    // Return a plain object with only serializable properties for IPC
    const { process, cancelled, ...safe } = job;
    return safe;
  }

  _getSafeQueue() {
    // When returning the queue, check if any "Complete" job's file still exists
    let changed = false;
    const synced = this.queue.map((job) => {
      if (job.status === 'Complete' && job.outputPath) {
        if (!fs.existsSync(job.outputPath)) {
          changed = true;
          return { ...job, status: 'Failed', error: 'File was deleted or moved' };
        }
      }
      return job;
    });
    if (changed) {
      this.queue = synced;
      this._saveQueueState();
    }
    return synced.map((job) => this._getSafeJob(job));
  }

  _processNext() {
    if (this.isProcessing) return;

    const nextJob = this.queue.find((j) => j.status === 'Pending');
    if (!nextJob) {
      this._emit('all-complete');
      return;
    }

    // Do not re-process a cancelled job
    if (nextJob.cancelled) return;

    this.isProcessing = true;
    this.currentJob = nextJob;
    this._startDownload(nextJob);
  }

  /**
   * Normalize a file path for Windows: trailing dots and spaces are not allowed
   * in filenames on Windows, so yt-dlp's --print filename can report a path
   * that differs from what the OS actually writes.
   */
  _normalizeWindowsPath(filePath) {
    if (process.platform !== 'win32') return filePath;
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    // Remove trailing dots and spaces from the base name
    const normalizedBase = base.replace(/[. ]+$/, '');
    if (normalizedBase === base) return filePath;
    return path.join(dir, normalizedBase + ext);
  }

  _startDownload(job) {
    job.status = 'Fetching';
    job.startedAt = Date.now();
    this._emit('queue-updated', this._getSafeQueue());

    const ytDlpPath = getYtDlpPath();
    const outputTemplate = path.join(
      app.getPath('downloads'),
      '%(title)s.%(ext)s'
    );

    // Get the directory containing ffmpeg so we can add it to PATH.
    // Using --ffmpeg-location is unreliable on Windows; adding the bin directory
    // to the PATH environment variable is more reliable — yt-dlp searches PATH.
    const ffmpegDir = path.dirname(getFfmpegPath());

    const args = [
      job.url,
      '--js-runtimes', 'node',
      '--force-overwrites',
      '-f', 'bestaudio',
      '-x',
      '--audio-format', 'opus',
      '--embed-thumbnail',
      '--embed-metadata',
      '-o', outputTemplate,
      '--no-playlist',
      '--progress',
      '--progress-template',
      'download:[%(progress.percent)s|%(progress.speed)s|%(progress.eta)s]',
    ];

    const childProc = spawn(ytDlpPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        PATH: `${ffmpegDir};${process.env.PATH}`,
      },
    });

    job.process = childProc;
    let stdoutBuffer = '';

    childProc.stdout.on('data', (data) => {
      // Buffer incoming data and split into complete lines
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      stdoutBuffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Parse progress
        if (line.startsWith('download:[')) {
          const match = line.match(/\[([^|]+)\|([^|]*)\|([^\]]*)\]/);
          if (match) {
            job.progress = parseFloat(match[1]) || 0;
            job.speed = match[2] || '';
            job.eta = match[3] || '';
            this._emit('download-progress', {
              id: job.id,
              progress: job.progress,
              speed: job.speed,
              eta: job.eta,
            });
          }
        }
      }
    });

    childProc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line && !line.startsWith('[')) {
        job.error = line;
      }
    });

    childProc.on('close', (code) => {
      // If the job was already cancelled (by cancelJob/cancelAll), skip processing
      // because the cancellation handler already restarted the queue.
      if (job.cancelled) {
        this._saveQueueState();
        this._emit('queue-updated', this._getSafeQueue());
        return;
      }

      if (code === 0) {
        // Scan Downloads for the most recently modified audio file. yt-dlp's --print
        // flags are unreliable for getting the final path after audio extraction,
        // so we find the file directly. Since downloads run one at a time (isProcessing
        // serializes them), this is safe — we'll pick up whatever file was just created.
        const downloadsDir = app.getPath('downloads');
        const foundPath = this._findNewestAudioFile(downloadsDir, job);

        if (foundPath) {
          job.outputPath = foundPath;
          job.title = path.basename(foundPath, path.extname(foundPath));
          job.status = 'Complete';
          job.progress = 100;
          this._emit('download-complete', {
            id: job.id,
            outputPath: job.outputPath,
          });
        } else {
          job.status = 'Failed';
          job.error = 'Download completed but no audio file was found in Downloads';
        }
      } else if (job.status !== 'Failed') {
        job.status = 'Failed';
        job.error = job.error || `Process exited with code ${code}`;
      }

      this._saveQueueState();
      this._emit('queue-updated', this._getSafeQueue());

      this.isProcessing = false;
      this.currentJob = null;
      this._processNext();
    });

    childProc.on('error', (err) => {
      job.status = 'Failed';
      job.error = err.message;
      this._saveQueueState();
      this._emit('queue-updated', this._getSafeQueue());
      this.isProcessing = false;
      this.currentJob = null;
      this._processNext();
    });
  }

  /**
   * Scan a directory for the most recently modified audio file (.opus or .ogg).
   * Uses the job's startedAt timestamp as the cutoff (with a 30s grace window)
   * to avoid picking up old unrelated files.
   */
  _findNewestAudioFile(dir, job) {
    try {
      const cutoff = job && job.startedAt ? job.startedAt - 5_000 : Date.now() - 60_000;
      const files = fs.readdirSync(dir);
      const extensions = ['.opus', '.ogg'];
      let newestPath = null;
      let newestMtime = 0;

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!extensions.includes(ext)) continue;
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile() && stat.mtimeMs >= cutoff && stat.mtimeMs > newestMtime) {
            newestPath = fullPath;
            newestMtime = stat.mtimeMs;
          }
        } catch {
          // File may be in use/locked — skip it
        }
      }

      return newestPath;
    } catch {
      return null;
    }
  }

  /**
   * Scan all Complete jobs and verify their output files still exist.
   * Marks missing files as Failed. Returns true if any status changed.
   */
  syncFileStatuses() {
    let changed = false;
    for (const job of this.queue) {
      if (job.status === 'Complete' && job.outputPath) {
        if (!fs.existsSync(job.outputPath)) {
          job.status = 'Failed';
          job.error = 'File was deleted or moved';
          changed = true;
        }
      }
    }
    if (changed) {
      this._saveQueueState();
      this._emit('queue-updated', this._getSafeQueue());
    }
    return changed;
  }

  getQueue() {
    return this._getSafeQueue();
  }
}

module.exports = DownloadManager;