import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioSource,
} from "expo-audio";

import {
  getCachedSettings,
  subscribeSettings,
  type GameSettings,
} from "@/store/settings-store";

type SfxGroup =
  | "paddleHit"
  | "ballMiss"
  | "wallShatter"
  | "roundWin"
  | "roundLoss";

type PlayerPool = {
  players: AudioPlayer[];
  nextIndex: number;
};

const SFX_SOURCES = {
  paddleHit: [
    require("../../assets/sound/sfx/zap1.mp3"),
    require("../../assets/sound/sfx/impactMetal_medium_000.mp3"),
  ],
  ballMiss: [
    require("../../assets/sound/sfx/lowDown.mp3"),
    require("../../assets/sound/sfx/lowRandom.mp3"),
  ],
  wallShatter: [require("../../assets/sound/sfx/spaceTrash1.mp3")],
  roundWin: [require("../../assets/sound/sfx/powerUp9.mp3")],
  roundLoss: [require("../../assets/sound/sfx/phaserDown1.mp3")],
} satisfies Record<SfxGroup, AudioSource[]>;

const POOL_SIZE = 4;
const MAX_HITS_PER_FRAME = 4;

let initialized = false;
let activeVolume = 0;
let lastSourceByGroup: Partial<Record<SfxGroup, number>> = {};

const pools = new Map<AudioSource, PlayerPool>();

const getEffectiveVolume = (settings: GameSettings) =>
  settings.muted ? 0 : settings.masterVolume;

const applyVolume = (volume: number) => {
  activeVolume = volume;

  pools.forEach((pool) => {
    pool.players.forEach((player) => {
      player.volume = volume;
      player.muted = volume <= 0;
    });
  });
};

const createPool = (source: AudioSource): PlayerPool => {
  const players = Array.from({ length: POOL_SIZE }, () => {
    const player = createAudioPlayer(source, {
      downloadFirst: true,
      keepAudioSessionActive: true,
      updateInterval: 1000,
    });

    player.volume = activeVolume;
    player.muted = activeVolume <= 0;

    return player;
  });

  return {
    players,
    nextIndex: 0,
  };
};

const getPool = (source: AudioSource) => {
  const existing = pools.get(source);

  if (existing) {
    return existing;
  }

  const pool = createPool(source);

  pools.set(source, pool);

  return pool;
};

const pickSource = (group: SfxGroup) => {
  const sources = SFX_SOURCES[group];

  if (sources.length === 1) {
    return sources[0];
  }

  let index = Math.floor(Math.random() * sources.length);
  const lastIndex = lastSourceByGroup[group];

  if (index === lastIndex) {
    index = (index + 1) % sources.length;
  }

  lastSourceByGroup[group] = index;

  return sources[index];
};

const playGroup = (group: SfxGroup) => {
  if (!initialized || activeVolume <= 0) {
    return;
  }

  const source = pickSource(group);
  const pool = getPool(source);
  const player = pool.players[pool.nextIndex];

  pool.nextIndex = (pool.nextIndex + 1) % pool.players.length;

  player.volume = activeVolume;
  player.muted = false;

  player.seekTo(0).finally(() => {
    player.play();
  });
};

export const initSfx = () => {
  if (initialized) {
    return;
  }

  initialized = true;

  setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: "mixWithOthers",
  }).catch((error) => {
    console.error("Failed to configure SFX audio mode:", error);
  });

  applyVolume(getEffectiveVolume(getCachedSettings()));

  Object.values(SFX_SOURCES).forEach((sources) => {
    sources.forEach((source) => {
      getPool(source);
    });
  });

  subscribeSettings((settings) => {
    applyVolume(getEffectiveVolume(settings));
  });
};

export const playPaddleHitSfx = (count = 1) => {
  const hitCount = Math.min(Math.max(1, count), MAX_HITS_PER_FRAME);

  for (let i = 0; i < hitCount; i++) {
    playGroup("paddleHit");
  }
};

export const playBallMissSfx = () => {
  playGroup("ballMiss");
};

export const playWallShatterSfx = () => {
  playGroup("wallShatter");
};

export const playRoundWinSfx = () => {
  playGroup("roundWin");
};

export const playRoundLossSfx = () => {
  playGroup("roundLoss");
};
