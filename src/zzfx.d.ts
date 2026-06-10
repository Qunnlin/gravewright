declare module 'zzfx' {
  /** Play a ZzFX sound from a parameter array. Returns the audio node. */
  export function zzfx(...parameters: (number | undefined)[]): AudioBufferSourceNode;
  export const ZZFX: {
    volume: number;
    sampleRate: number;
    play(...parameters: (number | undefined)[]): AudioBufferSourceNode;
  };
}
