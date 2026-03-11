import { useRef, useState } from 'react';

export const UploadDropzone = ({ file, onFileSelect, error }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      onFileSelect(droppedFile);
    }
  };

  const onBrowseClick = () => inputRef.current?.click();

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-6 text-center transition ${
          isDragging
            ? 'border-[color:var(--ui-accent-hover)] bg-[rgba(255,255,255,0.08)] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
            : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-soft)]'
        }`}
      >
        <p className="text-base font-semibold text-[color:var(--ui-text)]">Drag & drop secure file</p>
        <p className="ui-text-muted mt-1 text-sm">
          No plaintext is stored. File is encrypted before persistence.
        </p>
        <button
          type="button"
          onClick={onBrowseClick}
          className="ui-btn-primary mt-4"
        >
          Browse file
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => onFileSelect(event.target.files?.[0] || null)}
        />
      </div>

      {file ? (
        <p className="text-sm text-[color:var(--ui-text)]">
          Selected: <span className="font-semibold">{file.name}</span> ({Math.round(file.size / 1024)} KB)
        </p>
      ) : null}

      {error ? <p className="text-sm text-[color:var(--ui-text)]">{error}</p> : null}
    </div>
  );
};
