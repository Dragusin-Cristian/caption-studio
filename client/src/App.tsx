import styled from 'styled-components';
import { useCallback, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { DropZone } from '@/components/DropZone';
import { Editor } from '@/components/Editor';
import { PreviewPanel } from '@/components/preview/PreviewPanel';
import { CaptionStylePanel } from '@/components/style/CaptionStylePanel';
import { SubtitlesPanel } from '@/components/subtitles/SubtitlesPanel';
import { useVideoUrl } from '@/hooks/useVideoUrl';
import { useVideoTime } from '@/hooks/useVideoTime';
import { useCues } from '@/hooks/useCues';
import { useTranscribeJob } from '@/hooks/useTranscribeJob';
import { burnVideo } from '@/api/burn';
import { buildSrt, buildVtt, parseSubs } from '@/lib/subtitles';
import { downloadText, baseName } from '@/lib/download';
import { DEFAULT_STYLE, DEFAULT_BURN_MODE, NEW_CUE_DURATION } from '@/config/defaults';
import { DEFAULT_MODEL, MODEL_OPTIONS } from '@/config/models';
import { NETWORK_ERROR_RE } from '@/config/api';
import type { BurnMode, CaptionStyle, Status } from '@/types';
import { getPostPrompt } from './lib/postPrompt';

const Wrap = styled.div`
  max-width: ${({ theme }) => theme.size.contentMaxWidth};
  margin: 0 auto;
  padding: 22px 20px 80px;
`;

const networkOrRaw = (err: unknown, when: string): string => {
  const m = String((err as { message?: string })?.message ?? err);
  if (NETWORK_ERROR_RE.test(m)) {
    return 'Can\'t reach the captions service. Check your internet connection and try again in a moment.';
  }
  return `${when}: ${m}`;
};

const isEnglishOnlyModel = (value: string): boolean =>
  MODEL_OPTIONS.find((m) => m.value === value)?.isEnglishOnly ?? value.endsWith('.en');

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<CaptionStyle>(DEFAULT_STYLE);
  const [status, setStatus] = useState<Status>({ kind: '', message: 'Ready.' });
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [language, setLanguage] = useState<string>('');
  const [burnMode, setBurnMode] = useState<BurnMode>(DEFAULT_BURN_MODE);
  const [burnBusy, setBurnBusy] = useState(false);

  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const videoUrl = useVideoUrl(file);
  const { currentTime, duration } = useVideoTime(video);
  const { cues, addCue, updateCue, deleteCue, replaceAll } = useCues();
  const { state: transcribe, jobId, start: startTranscribe } = useTranscribeJob();

  const activeCue = useMemo(() => {
    for (const q of cues) {
      if (currentTime >= q.start && currentTime < q.end) return q;
    }
    return null;
  }, [cues, currentTime]);

  const updateStyle = useCallback(
    (patch: Partial<CaptionStyle>) => setStyle((prev) => ({ ...prev, ...patch })),
    [],
  );

  const handlePickFile = useCallback((next: File) => {
    setFile(next);
    setStatus({ kind: '', message: 'Video loaded. Auto-transcribe, or add lines by hand.' });
  }, []);

  const handleAddLine = useCallback(() => {
    const t = video?.currentTime ?? 0;
    const maxEnd = video?.duration ?? 0;
    addCue(t, NEW_CUE_DURATION, maxEnd);
  }, [addCue, video]);

  const handleJump = useCallback((time: number) => {
    if (video) video.currentTime = time;
  }, [video]);

  const handleImport = useCallback(
    async (subFile: File) => {
      try {
        const parsed = parseSubs(await subFile.text());
        if (!parsed.length) {
          setStatus({ kind: 'err', message: 'No subtitle lines found in that file.' });
          return;
        }
        replaceAll(parsed);
        setStatus({
          kind: 'ok',
          message: `Imported ${parsed.length} lines from ${subFile.name}. Edit, style, then export or burn in.`,
        });
      } catch (err) {
        setStatus({
          kind: 'err',
          message: `Couldn't read that file: ${(err as Error)?.message ?? err}`,
        });
      }
    },
    [replaceAll],
  );

  const handleAutoTranscribe = useCallback(async () => {
    if (!file) {
      setStatus({ kind: 'err', message: 'Load a video first.' });
      return;
    }
    try {
      const lang = isEnglishOnlyModel(model) ? undefined : language.trim() || undefined;
      const result = await startTranscribe(file, model, lang);
      if (!result.cues?.length) {
        setStatus({ kind: 'err', message: 'No clear speech detected. You can add lines by hand.' });
        return;
      }
      replaceAll(result.cues);
      setStatus({
        kind: 'ok',
        message: `Done — ${result.cues.length} lines. Edit below, then export or burn in.`,
      });
    } catch (err) {
      setStatus({ kind: 'err', message: networkOrRaw(err, 'Transcription failed') });
    }
  }, [file, model, language, startTranscribe, replaceAll]);

  const linkedInPrompt = useMemo(() => {
    const script = cues
      .map((c) => c.text.trim())
      .filter(Boolean)
      .join(' ');
    if (!script) return '';
    return getPostPrompt(script);
  }, [cues]);

  const handleExportSrt = useCallback(() => {
    downloadText(`${baseName(file)}.srt`, buildSrt(cues), 'text/plain');
  }, [cues, file]);

  const handleExportVtt = useCallback(() => {
    downloadText(`${baseName(file)}.vtt`, buildVtt(cues), 'text/vtt');
  }, [cues, file]);

  const handleBurn = useCallback(async () => {
    if (!file || cues.length === 0) return;
    if (!jobId) {
      setStatus({
        kind: 'err',
        message: 'Auto-transcribe a video first — burn reuses the uploaded source.',
      });
      return;
    }
    setBurnBusy(true);
    setStatus({
      kind: 'work',
      message:
        burnMode === 'hard' ? 'Burning captions into the video…' : 'Muxing a subtitle track…',
    });
    try {
      const url = await burnVideo({
        jobId,
        srt: buildSrt(cues),
        mode: burnMode,
        style,
        videoWidth: video?.videoWidth || 1280,
        videoHeight: video?.videoHeight || 720,
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName(file)}-subtitled.mp4`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus({ kind: 'ok', message: 'Saved your subtitled video (.mp4).' });
    } catch (err) {
      setStatus({ kind: 'err', message: networkOrRaw(err, 'Burn-in failed') });
    } finally {
      setBurnBusy(false);
    }
  }, [file, cues, burnMode, style, video, jobId]);

  const transcribeStatus: Status = transcribe.running
    ? { kind: 'work', message: transcribe.status }
    : status;

  return (
    <Wrap>
      <Header onPickFile={handlePickFile} />
      {!file ? (
        <DropZone onFile={handlePickFile} />
      ) : (
        <Editor
          left={
            <>
              <PreviewPanel
                video={video}
                onVideoRef={setVideo}
                src={videoUrl}
                style={style}
                activeCue={activeCue}
                currentTime={currentTime}
                duration={duration}
              />
              <CaptionStylePanel value={style} onChange={updateStyle} />
            </>
          }
          right={
            <SubtitlesPanel
              cues={cues}
              activeCueId={activeCue?.id ?? null}
              videoCurrentTime={currentTime}
              model={model}
              onModelChange={setModel}
              language={language}
              onLanguageChange={setLanguage}
              onAutoTranscribe={handleAutoTranscribe}
              autoBusy={transcribe.running}
              onAddLine={handleAddLine}
              canAddLine={file != null}
              onImport={handleImport}
              burnMode={burnMode}
              burnBusy={burnBusy}
              linkedInPrompt={linkedInPrompt}
              onBurnModeChange={setBurnMode}
              onExportSrt={handleExportSrt}
              onExportVtt={handleExportVtt}
              onBurn={handleBurn}
              status={transcribeStatus}
              progress={transcribe.progress}
              onCueUpdate={updateCue}
              onCueDelete={deleteCue}
              onJump={handleJump}
            />
          }
        />
      )}
    </Wrap>
  );
}

