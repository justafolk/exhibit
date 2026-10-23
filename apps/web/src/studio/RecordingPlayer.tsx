import { useRef, useState, type RefObject } from 'react';
import type { RecordingPresentation } from '../client';
import { Icon } from '../ui';
import { timecode, type LocalMedia } from './media';

export function RecordingPlayer({
  media,
  presentation,
  onPresentation,
  videoRef,
  currentTime,
  onTime,
  disabled,
}: {
  media: LocalMedia;
  presentation: RecordingPresentation;
  onPresentation: (value: RecordingPresentation) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  currentTime: number;
  onTime: (seconds: number) => void;
  disabled: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playError, setPlayError] = useState('');
  const [ready, setReady] = useState(false);
  const discovering = useRef(false);
  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    setPlayError('');
    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch {
      setPlayError(
        'This browser could not play the video. Try importing another WebM or MP4 export.',
      );
    }
  }
  return (
    <section className="panel player-panel">
      <div className="panel-heading">
        <div className="player-source">
          <Icon name="video" size={17} />
          <span>{media.fileName}</span>
        </div>
        <span className="quiet-badge">Local video · unverified</span>
      </div>
      <div className={`studio-stage frame-${presentation.frame}`}>
        <div
          className={`studio-video-window zoom-${Math.round(presentation.zoom * 100)}`}
        >
          <video
            ref={videoRef}
            src={media.url}
            playsInline
            muted={muted}
            preload="auto"
            aria-label="Recording preview"
            onLoadedMetadata={() => {
              setReady(true);
              const video = videoRef.current;
              if (!video) return;
              video.playbackRate = presentation.playbackRate;
              if (!Number.isFinite(video.duration)) {
                discovering.current = true;
                video.currentTime = media.durationSeconds + 1;
              }
            }}
            onSeeked={() => {
              const video = videoRef.current;
              if (discovering.current && video) {
                discovering.current = false;
                video.currentTime = 0;
              }
            }}
            onTimeUpdate={(event) => {
              if (!discovering.current)
                onTime(
                  Math.min(
                    media.durationSeconds,
                    event.currentTarget.currentTime,
                  ),
                );
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() =>
              setPlayError(
                'Playback failed. The original file and its checksum are unchanged.',
              )
            }
          />
        </div>
        <div className="stage-caption">
          <span>Exhibit recording</span>
          <span>Presentation only</span>
        </div>
      </div>
      <div className="player-transport">
        <button
          className="icon-button transport-play"
          aria-label={playing ? 'Pause recording' : 'Play recording'}
          disabled={!ready || disabled}
          onClick={() => void togglePlayback()}
        >
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <output className="transport-time" aria-label="Current playback time">
          {timecode(currentTime)}
        </output>
        <input
          className="playback-scrubber"
          type="range"
          aria-label="Playback position"
          min={0}
          max={media.durationSeconds}
          step={0.01}
          value={currentTime}
          disabled={!ready || disabled}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (videoRef.current) videoRef.current.currentTime = value;
            onTime(value);
          }}
        />
        <span className="transport-time">
          {timecode(media.durationSeconds)}
        </span>
        <button
          className="icon-button"
          aria-label={muted ? 'Unmute recording' : 'Mute recording'}
          onClick={() => setMuted((value) => !value)}
          disabled={disabled}
        >
          <Icon name={muted ? 'muted' : 'volume'} size={17} />
        </button>
      </div>
      {playError && (
        <p role="alert" className="player-error">
          {playError}
        </p>
      )}
      <fieldset className="presentation-controls" disabled={disabled}>
        <div>
          <label htmlFor="frame-style">Frame style</label>
          <select
            id="frame-style"
            value={presentation.frame}
            onChange={(event) =>
              onPresentation({
                ...presentation,
                frame: event.target.value as RecordingPresentation['frame'],
              })
            }
          >
            <option value="paper">Paper</option>
            <option value="mist">Mist</option>
            <option value="slate">Slate</option>
          </select>
        </div>
        <div>
          <label htmlFor="focus-zoom">Focus zoom</label>
          <div className="focus-zoom-control">
            <input
              id="focus-zoom"
              type="range"
              min={1}
              max={2}
              step={0.25}
              value={presentation.zoom}
              onChange={(event) =>
                onPresentation({
                  ...presentation,
                  zoom: Number(event.target.value),
                })
              }
            />
            <output>{presentation.zoom}×</output>
          </div>
        </div>
        <div>
          <label htmlFor="playback-speed">Playback speed</label>
          <select
            id="playback-speed"
            value={presentation.playbackRate}
            onChange={(event) => {
              const playbackRate = Number(event.target.value);
              if (videoRef.current)
                videoRef.current.playbackRate = playbackRate;
              onPresentation({ ...presentation, playbackRate });
            }}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
              <option value={speed} key={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <div className="panel-foot">
        <Icon name="shield" size={14} />
        Framing, focus, and speed change playback only. The original bytes stay
        intact.
      </div>
    </section>
  );
}
