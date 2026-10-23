import { useState } from 'react';
import type { RecordingChapter } from '../client';
import { Icon } from '../ui';
import { timecode } from './media';

export function ChapterEditor({
  chapters,
  onChange,
  currentTime,
  durationSeconds,
  onSeek,
  disabled,
}: {
  chapters: RecordingChapter[];
  onChange: (chapters: RecordingChapter[]) => void;
  currentTime: number;
  durationSeconds: number;
  onSeek: (time: number) => void;
  disabled: boolean;
}) {
  const [label, setLabel] = useState('');
  return (
    <section className="panel chapter-panel">
      <div className="panel-heading">
        <div>
          <h2>Key moments</h2>
          <p>Help reviewers jump directly to the relevant behavior.</p>
        </div>
        <span className="quiet-badge">{chapters.length} / 50</span>
      </div>
      <form
        className="chapter-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!label.trim() || chapters.length >= 50) return;
          onChange(
            [
              ...chapters,
              {
                label: label.trim(),
                atSeconds: Math.min(
                  durationSeconds,
                  Math.round(Math.max(0, currentTime) * 1000) / 1000,
                ),
              },
            ].sort((a, b) => a.atSeconds - b.atSeconds),
          );
          setLabel('');
        }}
      >
        <div>
          <label htmlFor="chapter-label">Chapter label</label>
          <input
            id="chapter-label"
            value={label}
            maxLength={120}
            placeholder="e.g. Address selected successfully"
            disabled={disabled || chapters.length >= 50}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <button
          className="secondary"
          disabled={disabled || !label.trim() || chapters.length >= 50}
        >
          <Icon name="plus" size={15} />
          Add chapter
        </button>
        <span className="chapter-at">at {timecode(currentTime)}</span>
      </form>
      {chapters.length ? (
        <ol className="chapter-list">
          {chapters.map((chapter, index) => (
            <li key={`${index}-${chapter.atSeconds}`}>
              <button
                className="chapter-seek"
                aria-label={`Seek to ${chapter.label}`}
                onClick={() => onSeek(chapter.atSeconds)}
                disabled={disabled}
              >
                <span className="chapter-index">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <strong>{chapter.label}</strong>
                <time>{timecode(chapter.atSeconds)}</time>
                <Icon name="play" size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={`Remove chapter ${chapter.label}`}
                disabled={disabled}
                onClick={() => onChange(chapters.filter((_, i) => i !== index))}
              >
                <Icon name="close" size={15} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="chapter-empty">
          Pause at a meaningful moment, then add a short label. Chapters
          describe your walkthrough; they are not test assertions.
        </p>
      )}
    </section>
  );
}
