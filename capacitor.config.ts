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
      '*.vidlink.pro',
      '*.vidsrc.cc',
      '*.vsembed.cc',
      '*.2embed.cc',
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
