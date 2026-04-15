import type { SfxEventKind } from '../core/game/types';

const AUDIO_BASE_PATH = './audio/';
const THEME_VOLUME = 0.3;
const THEME_DUCK_SCALE = 0.6;
const THEME_DUCK_MS = 420;
const SOUND_STORAGE_KEY = 'mb:sound-enabled';

export const SFX_VOLUME_SCALE = 0.22;
const SFX_MAX_INSTANCES = 3;
const SFX_INTENSITY_STEP = 0.12;
const SFX_INTENSITY_CAP = 1.2;
const SFX_JITTER_MAX_MS = 14;

const SFX_CONFIG: Record<SfxEventKind, { path: string; volume: number }> = {
  KNIGHT_HIT_KNIGHT: { path: 'sfx/knight-knight.mp3', volume: 0.35 },
  KNIGHT_HIT_ARCHER: { path: 'sfx/knight-archer.mp3', volume: 0.5 },
  KNIGHT_HIT_MAGE: { path: 'sfx/knight-mage.mp3', volume: 0.5 },
  GOBLIN_SPAWN: { path: 'sfx/goblin-spawn.mp3', volume: 0.45 },
  VICTORY: { path: 'sfx/victory.mp4', volume: 0.55 },
};

const loadSoundPreference = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(SOUND_STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
};

const persistSoundPreference = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage failures
  }
};

let soundEnabled = loadSoundPreference();
let matchActive = false;
let themeAudio: HTMLAudioElement | null = null;
let themeDuckTimeoutId: number | null = null;
let sfxContext: AudioContext | null = null;
let sfxMasterGain: GainNode | null = null;
let sfxCompressor: DynamicsCompressorNode | null = null;
const sfxBuffers = new Map<string, AudioBuffer>();
const sfxBufferLoads = new Map<string, Promise<AudioBuffer>>();

export const getAudioUrl = (relativePath: string): string =>
  new URL(`${AUDIO_BASE_PATH}${relativePath}`, window.location.href).toString();

const getSfxContext = (): AudioContext | null => {
  if (sfxContext) return sfxContext;
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const Ctx = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctx) return null;
  sfxContext = new Ctx();
  sfxMasterGain = sfxContext.createGain();
  sfxMasterGain.gain.value = SFX_VOLUME_SCALE;
  sfxCompressor = sfxContext.createDynamicsCompressor();
  sfxCompressor.threshold.value = -18;
  sfxCompressor.knee.value = 18;
  sfxCompressor.ratio.value = 4;
  sfxCompressor.attack.value = 0.003;
  sfxCompressor.release.value = 0.22;
  sfxMasterGain.connect(sfxCompressor);
  sfxCompressor.connect(sfxContext.destination);
  return sfxContext;
};

const resumeSfxContext = (): void => {
  const ctx = getSfxContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
};

const preloadSfxBuffers = (): void => {
  if (typeof window === 'undefined') return;
  if (!soundEnabled) return;
  for (const config of Object.values(SFX_CONFIG)) {
    const url = getAudioUrl(config.path);
    void loadSfxBuffer(url).catch(() => undefined);
  }
};

const loadSfxBuffer = (url: string): Promise<AudioBuffer> => {
  if (sfxBuffers.has(url)) {
    return Promise.resolve(sfxBuffers.get(url) as AudioBuffer);
  }
  const pending = sfxBufferLoads.get(url);
  if (pending) return pending;
  const ctx = getSfxContext();
  if (!ctx) return Promise.reject(new Error('AudioContext not available'));
  const task = fetch(url)
    .then(response => response.arrayBuffer())
    .then(buffer => ctx.decodeAudioData(buffer))
    .then(decoded => {
      sfxBuffers.set(url, decoded);
      sfxBufferLoads.delete(url);
      return decoded;
    })
    .catch(error => {
      sfxBufferLoads.delete(url);
      throw error;
    });
  sfxBufferLoads.set(url, task);
  return task;
};

const getSfxMix = (count: number): { instances: number; gainScale: number } => {
  const safeCount = Math.max(1, count);
  const instances = Math.min(safeCount, SFX_MAX_INSTANCES);
  const intensity = Math.min(SFX_INTENSITY_CAP, 1 + Math.log2(safeCount) * SFX_INTENSITY_STEP);
  const gainScale = intensity / Math.sqrt(instances);
  return { instances, gainScale };
};

const playSfxWithHtmlAudio = (url: string, volume: number, instances: number): void => {
  for (let i = 0; i < instances; i++) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = volume * SFX_VOLUME_SCALE;
    void audio.play().catch(() => undefined);
  }
};

export const playSfx = (kind: SfxEventKind, count: number, volumeScale = 1): void => {
  if (!soundEnabled || count <= 0) return;
  const config = SFX_CONFIG[kind];
  if (!config) return;
  duckTheme();
  const url = getAudioUrl(config.path);
  const mix = getSfxMix(count);
  const perInstanceVolume = config.volume * volumeScale * mix.gainScale;
  const ctx = getSfxContext();
  if (!ctx || !sfxMasterGain || !sfxCompressor) {
    playSfxWithHtmlAudio(url, perInstanceVolume, mix.instances);
    return;
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
  const buffer = sfxBuffers.get(url);
  if (!buffer) {
    void loadSfxBuffer(url).catch(() => undefined);
    playSfxWithHtmlAudio(url, perInstanceVolume, mix.instances);
    return;
  }
  for (let i = 0; i < mix.instances; i++) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = perInstanceVolume;
    source.connect(gain);
    gain.connect(sfxMasterGain);
    const jitter = Math.random() * SFX_JITTER_MAX_MS;
    source.start(ctx.currentTime + jitter / 1000);
  }
};

const ensureThemeAudio = (): HTMLAudioElement => {
  if (!themeAudio) {
    const audio = new Audio(getAudioUrl('music/main-theme.mp3'));
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = THEME_VOLUME;
    themeAudio = audio;
  }
  return themeAudio;
};

const stopTheme = (): void => {
  if (!themeAudio) return;
  if (themeDuckTimeoutId !== null) {
    window.clearTimeout(themeDuckTimeoutId);
    themeDuckTimeoutId = null;
  }
  themeAudio.pause();
  themeAudio.currentTime = 0;
  themeAudio.volume = THEME_VOLUME;
};

const duckTheme = (): void => {
  if (!themeAudio || themeAudio.paused) return;
  themeAudio.volume = THEME_VOLUME * THEME_DUCK_SCALE;
  if (themeDuckTimeoutId !== null) {
    window.clearTimeout(themeDuckTimeoutId);
  }
  themeDuckTimeoutId = window.setTimeout(() => {
    if (themeAudio) {
      themeAudio.volume = THEME_VOLUME;
    }
    themeDuckTimeoutId = null;
  }, THEME_DUCK_MS);
};

const syncThemePlayback = (): void => {
  if (!soundEnabled || !matchActive) {
    stopTheme();
    return;
  }
  const audio = ensureThemeAudio();
  audio.volume = THEME_VOLUME;
  if (audio.paused) {
    void audio.play().catch(() => undefined);
  }
};

const setSoundEnabled = (enabled: boolean): void => {
  if (soundEnabled === enabled) return;
  soundEnabled = enabled;
  persistSoundPreference(enabled);
  syncThemePlayback();
  if (enabled) {
    resumeSfxContext();
    preloadSfxBuffers();
  }
};

export const toggleSound = (): boolean => {
  setSoundEnabled(!soundEnabled);
  return soundEnabled;
};

export const getSoundEnabled = (): boolean => soundEnabled;

export const setMatchActive = (active: boolean): void => {
  if (matchActive === active) return;
  matchActive = active;
  syncThemePlayback();
  if (active && soundEnabled) {
    resumeSfxContext();
  }
};
