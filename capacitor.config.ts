import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cinemovie.app',
  appName: 'Cinemovie',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      '*.vidsrc.to',
      '*.vidsrc.me',
      '*.vidsrc.cc',
      '*.vsembed.cc',
      '*.superembed.cc'
    ]
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
