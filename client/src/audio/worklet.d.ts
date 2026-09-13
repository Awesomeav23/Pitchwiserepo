/**
 * AudioWorkletGlobalScope declarations. TypeScript's DOM lib does not describe
 * the worklet execution context, which has no window and no DOM.
 */
declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown });
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  ctor: new (options?: { processorOptions?: unknown }) => AudioWorkletProcessor,
): void;
