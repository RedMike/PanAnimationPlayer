import { toRgba } from "./palette";
import { PanFile } from "./pan";
import { Engine, RegisterInput } from "./sim";

const TICK_MS = 1000 / 18.2;

export interface ExportOptions {
  from: number;
  to: number;
  scale: number;
}

export interface ExportJob {
  done: Promise<Blob | null>;
  cancel: () => void;
}

export function webmMimeType(): string | null {
  if (typeof MediaRecorder === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) return null;
  for (const type of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export function frameDelayMs(pan: PanFile): number {
  return Math.max(pan.frameDelay, 1) * TICK_MS;
}

export function exportWebm(pan: PanFile, inputs: Map<number, RegisterInput>, options: ExportOptions, onProgress: (frame: number) => void): ExportJob {
  const mimeType = webmMimeType();
  if (!mimeType) throw new Error("WebM recording is not supported by this browser");
  const engine = new Engine(pan);
  const advance = () => {
    engine.applyRegisters(inputs, engine.currentFrame + 1);
    return engine.runFrame();
  };
  while (engine.currentFrame < options.from - 1 && !engine.ended) advance();

  const source = document.createElement("canvas");
  source.width = pan.width;
  source.height = pan.height;
  const sctx = source.getContext("2d") as CanvasRenderingContext2D;
  const image = sctx.createImageData(pan.width, pan.height);
  const output = document.createElement("canvas");
  output.width = pan.width * options.scale;
  output.height = pan.height * options.scale;
  const octx = output.getContext("2d") as CanvasRenderingContext2D;
  octx.imageSmoothingEnabled = false;

  const stream = output.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let timer = 0;
  let cancelled = false;
  const delay = frameDelayMs(pan);
  const done = new Promise<Blob | null>((resolve) => {
    recorder.onstop = () => {
      track.stop();
      resolve(cancelled ? null : new Blob(chunks, { type: mimeType }));
    };
    const drawCurrent = () => {
      toRgba(engine.frame, engine.palette, image.data, false);
      sctx.putImageData(image, 0, 0);
      octx.drawImage(source, 0, 0, output.width, output.height);
      track.requestFrame();
      onProgress(engine.currentFrame);
    };
    const start = performance.now();
    let index = 0;
    const tick = () => {
      if (cancelled) return;
      if (engine.currentFrame < options.from) advance();
      else if (engine.currentFrame >= options.to || engine.ended) {
        timer = window.setTimeout(() => recorder.stop(), delay);
        return;
      } else advance();
      drawCurrent();
      index++;
      timer = window.setTimeout(tick, Math.max(0, start + index * delay - performance.now()));
    };
    recorder.start();
    tick();
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      clearTimeout(timer);
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
}
