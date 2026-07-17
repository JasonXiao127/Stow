import React, { useState, useEffect, useCallback } from 'react';

const EMPTY_TAGS = {
  title: '',
  artist: '',
  album: '',
  track: '',
  genre: '',
  year: '',
};

export default function MetadataEditor({ filePath, onClose, showToast }) {
  const [tags, setTags] = useState(EMPTY_TAGS);
  const [coverArt, setCoverArt] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadMetadata = useCallback(async (path) => {
    if (!path) return;

    setIsLoading(true);
    try {
      const result = await window.electronAPI.readMetadata(path);
      setTags(result.tags || EMPTY_TAGS);
      setCoverArt(result.coverArt || null);
    } catch (err) {
      showToast(`Failed to read metadata: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadMetadata(filePath);
  }, [filePath, loadMetadata]);

  const handleChange = (field) => (e) => {
    setTags((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    if (!filePath) return;

    setIsSaving(true);
    try {
      await window.electronAPI.writeMetadata(filePath, tags, null);
      showToast('Metadata saved successfully!', 'success');
    } catch (err) {
      showToast(`Failed to save metadata: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeThumbnail = async () => {
    try {
      const imagePath = await window.electronAPI.openImageDialog();
      if (imagePath) {
        setIsSaving(true);
        await window.electronAPI.writeMetadata(filePath, tags, imagePath);
        // Reload metadata to show new thumbnail
        await loadMetadata(filePath);
        showToast('Thumbnail updated successfully!', 'success');
      }
    } catch (err) {
      showToast(`Failed to update thumbnail: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // No file selected
  if (!filePath) {
    return (
      <div className="metadata-panel">
        <div className="metadata-header">
          <h2>Metadata Editor</h2>
        </div>
        <div className="metadata-content">
          <div className="metadata-empty">
            <div>No file selected</div>
            <div className="sub">
              Click "Open File" to edit metadata of an existing audio file, or
              download a video first and click the edit button.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="metadata-panel">
        <div className="metadata-header">
          <h2>Metadata Editor</h2>
          <button className="btn btn-secondary btn-small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="metadata-content">
          <div className="metadata-empty">
            <div>Loading metadata...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="metadata-panel">
      <div className="metadata-header">
        <h2>Metadata Editor</h2>
        <button className="btn btn-secondary btn-small" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="metadata-content">
        {/* File Path */}
        <div className="file-selector">
          <div className="file-path" title={filePath}>
            {filePath}
          </div>
        </div>

        {/* Thumbnail */}
        <div className="thumbnail-container">
          {coverArt ? (
            <img
              className="thumbnail-image"
              src={`data:${coverArt.format};base64,${coverArt.data}`}
              alt="Cover Art"
            />
          ) : (
            <div className="thumbnail-placeholder">No Cover Art</div>
          )}
          <button
            className="btn btn-secondary btn-small"
            onClick={handleChangeThumbnail}
            disabled={isSaving}
          >
            Change Thumbnail
          </button>
        </div>

        {/* Metadata Form */}
        <div className="metadata-form">
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              className="form-input"
              type="text"
              value={tags.title}
              onChange={handleChange('title')}
              placeholder="Song Title"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Artist</label>
            <input
              className="form-input"
              type="text"
              value={tags.artist}
              onChange={handleChange('artist')}
              placeholder="Artist Name"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Album</label>
            <input
              className="form-input"
              type="text"
              value={tags.album}
              onChange={handleChange('album')}
              placeholder="Album Name"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Track</label>
            <input
              className="form-input"
              type="text"
              value={tags.track}
              onChange={handleChange('track')}
              placeholder="Track Number"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Genre</label>
            <input
              className="form-input"
              type="text"
              value={tags.genre}
              onChange={handleChange('genre')}
              placeholder="Genre"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Year</label>
            <input
              className="form-input"
              type="text"
              value={tags.year}
              onChange={handleChange('year')}
              placeholder="Year"
            />
          </div>

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Metadata'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}