import React from 'react';

function getStatusLabel(status) {
  const labels = {
    Pending: 'Pending',
    Fetching: 'Fetching video info…',
    Processing: 'Downloading…',
    Complete: 'Complete',
    Failed: 'Failed',
  };
  return labels[status] || status;
}

function formatSpeed(speed) {
  if (!speed) return '';
  // yt-dlp reports speed in bytes/s, convert to human readable
  const num = parseFloat(speed);
  if (isNaN(num)) return speed;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)} MB/s`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)} KB/s`;
  return `${num.toFixed(0)} B/s`;
}

function formatEta(eta) {
  if (!eta || eta === 'N/A') return '';
  const num = parseInt(eta);
  if (isNaN(num)) return eta;
  if (num >= 3600) {
    const h = Math.floor(num / 3600);
    const m = Math.floor((num % 3600) / 60);
    return `${h}h ${m}m`;
  }
  if (num >= 60) {
    const m = Math.floor(num / 60);
    const s = num % 60;
    return `${m}m ${s}s`;
  }
  return `${num}s`;
}

export default function QueuePanel({ queue, onCancelAll, onCancelJob, onEditFile }) {
  return (
    <div className="queue-panel">
      <div className="queue-header">
        <h2>Download Queue ({queue.length})</h2>
        {queue.length > 0 && (
          <button
            className="btn btn-danger btn-small"
            onClick={onCancelAll}
          >
            Clear Queue
          </button>
        )}
      </div>

      <div className="queue-list">
        {queue.length === 0 ? (
          <div className="queue-empty">
            No downloads yet. Paste a YouTube URL above to get started.
          </div>
        ) : (
          queue.map((job) => (
            <div
              key={job.id}
              className={`download-item ${job.status.toLowerCase()}`}
            >
              <div className="download-info">
                {/* Title (or URL as fallback) */}
                <div className="download-title" title={job.title || job.url}>
                  {job.title || 'Untitled'}
                </div>
                {job.title && (
                  <div className="download-url" title={job.url}>
                    {job.url}
                  </div>
                )}
                <div className="download-status">
                  <span className={`status-badge ${job.status.toLowerCase()}`}>
                    {getStatusLabel(job.status)}
                  </span>
                  {(job.status === 'Fetching' || job.status === 'Processing') && (
                    <>
                      {job.progress > 0 && (
                        <span className="download-percentage">
                          {' '}· {Math.round(job.progress)}%
                        </span>
                      )}
                      {job.speed && (
                        <span className="download-speed">
                          {' '}· {formatSpeed(job.speed)}
                        </span>
                      )}
                      {job.eta && (
                        <span className="download-eta">
                          {' '}· ETA: {formatEta(job.eta)}
                        </span>
                      )}
                    </>
                  )}
                  {job.status === 'Failed' && job.error && (
                    <span className="download-error-text">
                      {job.error}
                    </span>
                  )}
                </div>
                {/* Progress bar with percentage overlay */}
                {(job.status === 'Fetching' || job.status === 'Processing') && (
                  <div className="download-progress-bar">
                    <div
                      className="download-progress-fill"
                      style={{ width: `${Math.max(job.progress, 2)}%` }}
                    >
                      <span className="progress-label">{Math.round(job.progress)}%</span>
                    </div>
                  </div>
                )}
                {job.status === 'Complete' && (
                  <div className="download-progress-bar">
                    <div className="download-progress-fill complete" style={{ width: '100%' }}>
                      <span className="progress-label">100%</span>
                    </div>
                  </div>
                )}
                {job.status === 'Failed' && (
                  <div className="download-progress-bar">
                    <div className="download-progress-fill failed" style={{ width: '100%' }}>
                      <span className="progress-label">Failed</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="download-actions">
                {(job.status === 'Pending' || job.status === 'Fetching' || job.status === 'Processing') && (
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => onCancelJob(job.id)}
                    title="Cancel"
                  >
                    ✕
                  </button>
                )}
                {job.status === 'Complete' && job.outputPath && (
                  <>
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => window.electronAPI.showInFolder(job.outputPath)}
                      title="Show in Folder"
                    >
                      📂
                    </button>
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => onEditFile(job.outputPath)}
                      title="Edit Metadata"
                    >
                      ✎
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
