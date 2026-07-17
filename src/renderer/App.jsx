import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from './context/ThemeContext';
import UrlInput from './components/UrlInput';
import QueuePanel from './components/QueuePanel';
import MetadataEditor from './components/MetadataEditor';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [queue, setQueue] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load initial queue state
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getQueue().then(setQueue).catch(console.error);
    }
  }, []);

  // Listen for queue updates from main process
  useEffect(() => {
    if (!window.electronAPI) return;

    const cleanupQueue = window.electronAPI.onQueueUpdated((updatedQueue) => {
      setQueue(updatedQueue);
    });

    const cleanupProgress = window.electronAPI.onDownloadProgress((progress) => {
      setQueue((prev) =>
        prev.map((job) =>
          job.id === progress.id
            ? { ...job, progress: progress.progress, speed: progress.speed, eta: progress.eta }
            : job
        )
      );
    });

    const cleanupComplete = window.electronAPI.onDownloadComplete((result) => {
      showToast(`Download complete: ${result.outputPath}`, 'success');
    });

    const cleanupAllDone = window.electronAPI.onAllDownloadsComplete(() => {
      showToast('All downloads complete!', 'success');
    });

    return () => {
      cleanupQueue();
      cleanupProgress();
      cleanupComplete();
      cleanupAllDone();
    };
  }, [showToast]);

  const handleStartDownloads = async (urls) => {
    try {
      await window.electronAPI.startDownloads(urls);
      // Queue state is updated by the 'queue-updated' event from main process.
      // Do not setQueue here — it would race with the event and cause duplicates.
    } catch (err) {
      showToast(`Failed to start downloads: ${err.message}`, 'error');
    }
  };

  const handleCancelAll = async () => {
    try {
      await window.electronAPI.cancelDownloads();
    } catch (err) {
      showToast(`Failed to cancel: ${err.message}`, 'error');
    }
    // Immediately clear the UI. The queue-updated IPC event from the main process
    // will also fire with the empty queue, but this ensures instant feedback.
    setQueue([]);
  };

  const handleCancelJob = async (jobId) => {
    try {
      await window.electronAPI.cancelJob(jobId);
    } catch (err) {
      showToast(`Failed to cancel job: ${err.message}`, 'error');
    }
  };

  const handleOpenFile = async () => {
    try {
      const filePath = await window.electronAPI.openFileDialog();
      if (filePath) {
        setSelectedFile(filePath);
      }
    } catch (err) {
      showToast(`Failed to open file: ${err.message}`, 'error');
    }
  };

  const handleEditDownloadedFile = (filePath) => {
    setSelectedFile(filePath);
  };

  return (
    <div className="app-container">
      <header className="header">
        <span className="header-title">Stow</span>
        <div className="header-controls">
          <button className="btn btn-secondary btn-small" onClick={handleOpenFile}>
            Open File
          </button>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </header>

      <UrlInput onStartDownloads={handleStartDownloads} />

      <div className="main-content">
        <QueuePanel
          queue={queue}
          onCancelAll={handleCancelAll}
          onCancelJob={handleCancelJob}
          onEditFile={handleEditDownloadedFile}
        />
        <MetadataEditor
          filePath={selectedFile}
          onClose={() => setSelectedFile(null)}
          showToast={showToast}
        />
      </div>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}