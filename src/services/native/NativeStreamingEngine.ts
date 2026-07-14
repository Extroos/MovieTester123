import { registerPlugin } from '@capacitor/core';

let instance: any;
try {
  instance = registerPlugin<any>('NativeStreamingEngine');
} catch (e) {
  // Gracefully handle duplicate registration in HMR/development environments
  const globalCapacitor = (window as any).Capacitor;
  instance = globalCapacitor?.Plugins?.NativeStreamingEngine || {};
}

export const NativeStreamingEngine = instance;
