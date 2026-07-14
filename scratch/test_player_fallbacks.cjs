/**
 * CineMovie Player Self-Healing Failover Simulation Test
 * 
 * This script simulates an Android user experiencing decoding or Web Audio API
 * CORS issues on a low-end/outdated device, and verifies the player's self-healing mechanisms:
 *   1. Disabling Web Audio booster on first playback error and retrying.
 *   2. Cascading automatically to the next ad-free server (vidsrc-pm, vidsrc-wtf-2, vidzee) if the error persists.
 *   3. Resetting Web Audio settings upon manual or automatic server changes.
 */

const assert = require('assert');

// Mock data and servers list matching the app config
const ALL_SERVERS = [
  { id: 'vidlink-pro', name: 'Vidlink Pro', isAdFree: true },
  { id: 'vidsrc-pm', name: 'VidSrc PM', isAdFree: true },
  { id: 'vidsrc-wtf-2', name: 'VidSrc Multi-Lang', isAdFree: true },
  { id: 'vidzee', name: 'Vidzee', isAdFree: true },
  { id: 'universal', name: 'Vidsrc.to (Universal)', isAdFree: false }
];

const SERVER_DISPLAY_NAMES = {
  'vidlink-pro': 'Vidlink Pro',
  'vidsrc-pm': 'VidSrc PM (.m3u8)',
  'vidsrc-wtf-2': 'VidSrc Multi-Lang',
  'vidzee': 'Vidzee',
  'universal': 'Universal Player (.m3u8)'
};

// Simulation State Class representing the Player's state machine
class PlayerSimulator {
  constructor() {
    // React state mocks
    this.selectedServer = 'vidlink-pro';
    this.iframeFallback = false;
    this.embedServer = null;
    this.serverError = null;
    this.playerToast = null;
    this.isPlaying = true;
    this.currentSrc = "http://localhost:8000/local-proxy?url=https%3A%2F%2Fcdn.com%2Fmovie.mp4";

    // React Ref mocks
    this.videoRef = {
      current: {
        currentTime: 42,
        error: { code: 3, message: 'Video stream could not be decoded.' },
        load: () => {
          this.log('🔄 videoRef.current.load() called! Reloading media source...');
          this.videoLoaded = true;
        },
        pause: () => {
          this.log('⏸️ videoRef.current.pause() called!');
        },
        removeAttribute: (attr) => {
          this.log(`🗑️ videoRef.current.removeAttribute('${attr}') called!`);
        }
      }
    };

    // Web Audio Mock Refs
    this.audioCtxRef = {
      current: {
        close: async () => {
          this.log('🔌 audioCtxRef: Closed AudioContext successfully.');
          return true;
        }
      }
    };
    this.audioSourceRef = { current: {} }; // simulated active Web Audio source
    this.gainNodeRef = { current: {} };
    this.audioBoosterDisabledForSession = { current: false };
    
    // Test flags
    this.videoLoaded = false;
    this.isOfflineMode = false;
    this.logs = [];
  }

  log(msg) {
    console.log(`[Simulator] ${msg}`);
    this.logs.push(msg);
  }

  async handleServerChange(serverId) {
    this.log(`➡️ Changing server to: ${serverId}`);
    this.selectedServer = serverId;
    this.iframeFallback = false;
    this.embedServer = null;
    this.serverError = null;
    this.currentSrc = "";

    // Reset Web Audio booster disabled flag for the new server
    this.audioBoosterDisabledForSession.current = false;
    this.log(`🧼 Reset audioBoosterDisabledForSession to false for new server: ${serverId}`);

    // Emulate teardown of video and AudioContext
    if (this.audioSourceRef.current) {
      if (this.audioCtxRef.current) {
        await this.audioCtxRef.current.close().catch(() => {});
        this.audioCtxRef.current = null;
      }
      this.audioSourceRef.current = null;
      this.gainNodeRef.current = null;
    }

    if (this.videoRef.current) {
      this.videoRef.current.pause();
      this.videoRef.current.removeAttribute('src');
      this.videoRef.current.load();
    }

    // Emulate new stream mounting and activating Web Audio booster
    this.audioSourceRef.current = {};
    this.audioCtxRef.current = {
      close: async () => {
        this.log('🔌 audioCtxRef: Closed AudioContext successfully.');
        return true;
      }
    };
  }

  // Emulates triggerAutoFailover in index.tsx
  triggerAutoFailover() {
    if (this.isOfflineMode) {
      this.playerToast = { message: 'Playback failed. You are currently offline.', isError: true };
      return;
    }
    
    const adFreeServers = ALL_SERVERS.filter(s => s.isAdFree);
    const currentIndex = adFreeServers.findIndex(s => s.id === this.selectedServer);
    
    if (currentIndex !== -1 && currentIndex < adFreeServers.length - 1) {
      const nextServer = adFreeServers[currentIndex + 1];
      this.playerToast = {
        message: `${SERVER_DISPLAY_NAMES[this.selectedServer] || this.selectedServer} failed. Switching to ${nextServer.name} automatically...`,
        isError: false
      };
      this.log(`🚨 Auto-failover triggered! Switching to next ad-free server: ${nextServer.id}`);
      this.handleServerChange(nextServer.id);
    } else {
      this.playerToast = {
        message: 'Stream failed to load. Please try another server.',
        isError: true
      };
      this.serverError = 'Stream failed to load. Please try again.';
      this.log(`❌ Reached end of ad-free cascade. Halting with error: ${this.serverError}`);
    }
  }

  // Emulates handleNativeError inside index.tsx
  handleNativeError() {
    const err = this.videoRef.current?.error;
    this.log(`⚠️ handleNativeError caught: Code ${err?.code} - ${err?.message}`);

    // 1. Web Audio API Booster Fallback Retry
    if (this.audioSourceRef.current && !this.audioBoosterDisabledForSession.current) {
      this.log('🛡️ Web Audio API booster is currently active. Disabling booster and retrying playback...');
      this.audioBoosterDisabledForSession.current = true;
      
      // Close active AudioContext
      if (this.audioCtxRef.current) {
        this.audioCtxRef.current.close().catch(() => {});
        this.audioCtxRef.current = null;
      }
      this.audioSourceRef.current = null;
      this.gainNodeRef.current = null;
      
      if (this.videoRef.current) {
        this.videoRef.current.load();
      }
      return; // Return early, retry initiated!
    }

    // 2. Official Iframe Fallback for ad-supported servers
    const isAdFree = ALL_SERVERS.some(s => s.id === this.selectedServer && s.isAdFree);
    const isNativePlatform = true; // Simulating Android native device
    if (isNativePlatform && !this.isOfflineMode && !isAdFree) {
      this.log('🔀 Ad-supported server failed, falling back to official iframe...');
      this.iframeFallback = true;
      return;
    }

    // 3. Fallback to another server
    const msg = `Native MP4 playback error: ${err?.message || 'Video stream could not be decoded.'} (Code ${err?.code || 'unknown'})`;
    this.serverError = msg;
    
    if (!this.isOfflineMode) {
      this.triggerAutoFailover();
    }
  }
}

async function runTests() {
  console.log('🧪 Starting CineMovie Self-Healing Player Simulation Tests...\n');

  // ==========================================
  // SCENARIO 1: Web Audio CORS / Loading block
  // ==========================================
  console.log('--- SCENARIO 1: Simulating Web Audio API CORS/Decoding Failure on budget device ---');
  const sim1 = new PlayerSimulator();
  
  // Verify initially selected server and active booster
  assert.strictEqual(sim1.selectedServer, 'vidlink-pro');
  assert.strictEqual(sim1.audioBoosterDisabledForSession.current, false);
  assert.ok(sim1.audioSourceRef.current);

  // Trigger error event
  sim1.handleNativeError();

  // Assertions for Web Audio bypass:
  // - Booster should be disabled
  // - Active sources cleaned up
  // - Video load() triggered for retry
  // - selectedServer remains vidlink-pro
  assert.strictEqual(sim1.audioBoosterDisabledForSession.current, true, 'Audio booster should be flagged disabled');
  assert.strictEqual(sim1.audioSourceRef.current, null, 'Active Audio source should be cleaned up');
  assert.ok(sim1.videoLoaded, 'video.load() should be called to reload video stream');
  assert.strictEqual(sim1.selectedServer, 'vidlink-pro', 'Should stay on current server for the first bypass try');
  console.log('✅ Scenario 1 Passed: Successfully bypassed AudioContext and triggered retry.\n');

  // ==========================================
  // SCENARIO 2: Persistent Codec failure / Auto-Failover Cascade
  // ==========================================
  console.log('--- SCENARIO 2: Simulating persistent HEVC Codec support error (Cascade Failover) ---');
  const sim2 = new PlayerSimulator();
  
  // First error: Bypasses Audio booster
  sim2.handleNativeError();
  assert.strictEqual(sim2.audioBoosterDisabledForSession.current, true);

  // Second error (retried stream also fails because the device lacks H.265/HEVC hardware decoding entirely)
  sim2.videoLoaded = false; // reset flag
  sim2.handleNativeError();

  // Assertions for failover to vidsrc-pm
  assert.strictEqual(sim2.selectedServer, 'vidsrc-pm', 'Should automatically failover to vidsrc-pm');
  assert.strictEqual(sim2.audioBoosterDisabledForSession.current, false, 'Should reset booster-disabled flag on server change');
  assert.ok(sim2.playerToast, 'Should display toast notifying user of server switch');
  assert.ok(sim2.playerToast.message.includes('Switching to VidSrc PM automatically'), 'Toast message should name next server');
  console.log('✅ Scenario 2 Part 1 Passed: Correctly failed over from Vidlink Pro to VidSrc PM.\n');

  // Simulate VidSrc PM failing too (e.g. mirror CDN blocked by ISP)
  console.log('--- SCENARIO 2 Part 2: Simulating subsequent fallback to next ad-free servers ---');
  sim2.handleNativeError(); // first retry on PM resets Web Audio
  sim2.handleNativeError(); // second PM error triggers next failover
  assert.strictEqual(sim2.selectedServer, 'vidsrc-wtf-2', 'Should failover to vidsrc-wtf-2');

  sim2.handleNativeError(); // wtf-2 retry Web Audio
  sim2.handleNativeError(); // wtf-2 error triggers next failover
  assert.strictEqual(sim2.selectedServer, 'vidzee', 'Should failover to vidzee');

  sim2.handleNativeError(); // vidzee retry Web Audio
  sim2.handleNativeError(); // vidzee error triggers final halt
  assert.strictEqual(sim2.selectedServer, 'vidzee', 'Should remain on final ad-free server');
  assert.ok(sim2.serverError.includes('Stream failed to load'), 'Should prompt user with error dialog');
  console.log('✅ Scenario 2 Part 2 Passed: Successfully verified entire ad-free fallback cascade.\n');

  console.log('🎉 All self-healing player simulation tests passed successfully!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
