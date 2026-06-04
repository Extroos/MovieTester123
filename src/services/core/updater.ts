import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

interface VersionInfo {
  version: string;
  downloadUrl: string;
  releaseNotes?: string;
  forceUpdate?: boolean;
}

export const APP_VERSION = '0.1.15';
export const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/Extroos/CineMovie/main/version.json';

export async function checkForUpdates(): Promise<VersionInfo | null> {
  try {
    const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`);
    if (!response.ok) return null;

    const remoteData: VersionInfo = await response.json();
    
    if (isNewerVersion(APP_VERSION, remoteData.version)) {
      return remoteData;
    }
    
    return null;
  } catch (error) {
    console.error('Update check failed:', error);
    return null;
  }
}

function isNewerVersion(v1: string, v2: string): boolean {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    
    if (num2 > num1) return true;
    if (num1 > num2) return false;
  }
  
  return false;
}

export interface DownloadProgress {
  progress: number; // 0-100
  downloaded: number;
  total: number;
}

// Download APK and trigger installation
export async function downloadAndInstallUpdate(
  downloadUrl: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    // Web fallback - just open the URL
    window.open(downloadUrl, '_blank');
    return true;
  }

  try {
    const fileName = 'WatchMovie-update.apk';
    
    // Download the APK using fetch with progress tracking
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error('Download failed');
    
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let downloaded = 0;
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunks.push(value);
      downloaded += value.length;
      
      if (onProgress && total > 0) {
        onProgress({
          progress: Math.round((downloaded / total) * 100),
          downloaded,
          total,
        });
      }
    }
    
    // Combine chunks into single blob
    const blob = new Blob(chunks as any, { type: 'application/vnd.android.package-archive' });
    const base64 = await blobToBase64(blob);
    
    // Save to Downloads directory (external storage for Android)
    await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.External,
    });
    
    // Get the file URI
    const fileUri = await Filesystem.getUri({
      path: fileName,
      directory: Directory.External,
    });
    
    // Trigger Android install intent
    await installApk(fileUri.uri);
    
    return true;
  } catch (error) {
    console.error('Download/Install failed:', error);
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function installApk(fileUri: string): Promise<void> {
  // Use Capacitor App plugin to open the APK with Android's package installer
  try {
    const { App } = await import('@capacitor/app');
    
    // For Android, we need to use an intent to install
    // The FileOpener plugin or custom native code would be ideal here
    // Fallback: Use the Browser to open the file URI
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: fileUri });
  } catch (e) {
    // Last resort: Try direct intent via window.location
    // This works on some Android WebViews
    window.location.href = fileUri;
  }
}

// Simple method that opens download URL directly (works reliably)
export function openDownloadUrl(url: string): void {
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/browser').then(({ Browser }) => {
      Browser.open({ url });
    }).catch(() => {
      window.open(url, '_blank');
    });
  } else {
    window.open(url, '_blank');
  }
}

