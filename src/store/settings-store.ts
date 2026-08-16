import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

export type BotDifficulty = "easy" | "normal" | "hard";

export type InputScheme = "drag-anywhere" | "fixed-zone";

export type GameSettings = {
  masterVolume: number;
  muted: boolean;
  inputScheme: InputScheme;
  paddleSensitivity: number;
  botDifficulty: BotDifficulty;
  startingLives: number;
  shrinkStartMs: number;
  shrinkRate: number;
};

type SettingKey = keyof GameSettings;

type SettingsListener = (settings: GameSettings) => void;

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  muted: false,
  inputScheme: "drag-anywhere",
  paddleSensitivity: 1,
  botDifficulty: "normal",
  startingLives: 2,
  shrinkStartMs: 60_000,
  shrinkRate: 6,
};

export const BOT_DIFFICULTY_CONFIG: Record<
  BotDifficulty,
  {
    botMaxSpeed: number;
    botReactionDeadZone: number;
  }
> = {
  easy: {
    botMaxSpeed: 105,
    botReactionDeadZone: 22,
  },
  normal: {
    botMaxSpeed: 145,
    botReactionDeadZone: 12,
  },
  hard: {
    botMaxSpeed: 215,
    botReactionDeadZone: 4,
  },
};

const KEYS: Record<SettingKey, string> = {
  masterVolume: "audio.masterVolume",
  muted: "audio.muted",
  inputScheme: "controls.inputScheme",
  paddleSensitivity: "controls.paddleSensitivity",
  botDifficulty: "gameplay.botDifficulty",
  startingLives: "gameplay.startingLives",
  shrinkStartMs: "gameplay.shrinkStartMs",
  shrinkRate: "gameplay.shrinkRate",
};

let cachedSettings = DEFAULT_SETTINGS;

const settingsListeners = new Set<SettingsListener>();

const emitSettings = (settings: GameSettings) => {
  cachedSettings = settings;

  settingsListeners.forEach((listener) => listener(settings));
};

export const getCachedSettings = () => cachedSettings;

export const subscribeSettings = (listener: SettingsListener) => {
  settingsListeners.add(listener);

  return () => {
    settingsListeners.delete(listener);
  };
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const readNumber = async (
  key: SettingKey,
  min: number,
  max: number,
): Promise<number> => {
  const value = await AsyncStorage.getItem(KEYS[key]);

  if (value === null) {
    return DEFAULT_SETTINGS[key] as number;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return DEFAULT_SETTINGS[key] as number;
  }

  return clamp(parsed, min, max);
};

const readBoolean = async (key: SettingKey): Promise<boolean> => {
  const value = await AsyncStorage.getItem(KEYS[key]);

  if (value === null) {
    return DEFAULT_SETTINGS[key] as boolean;
  }

  return value === "true";
};

const readInputScheme = async (): Promise<InputScheme> => {
  const value = await AsyncStorage.getItem(KEYS.inputScheme);

  return value === "fixed-zone" || value === "drag-anywhere"
    ? value
    : DEFAULT_SETTINGS.inputScheme;
};

const readBotDifficulty = async (): Promise<BotDifficulty> => {
  const value = await AsyncStorage.getItem(KEYS.botDifficulty);

  return value === "easy" || value === "normal" || value === "hard"
    ? value
    : DEFAULT_SETTINGS.botDifficulty;
};

export const getSettings = async (): Promise<GameSettings> => {
  const [
    masterVolume,
    muted,
    inputScheme,
    paddleSensitivity,
    botDifficulty,
    startingLives,
    shrinkStartMs,
    shrinkRate,
  ] = await Promise.all([
    readNumber("masterVolume", 0, 1),
    readBoolean("muted"),
    readInputScheme(),
    readNumber("paddleSensitivity", 0.6, 1.6),
    readBotDifficulty(),
    readNumber("startingLives", 1, 5),
    readNumber("shrinkStartMs", 30_000, 120_000),
    readNumber("shrinkRate", 0, 12),
  ]);

  const settings = {
    masterVolume,
    muted,
    inputScheme,
    paddleSensitivity,
    botDifficulty,
    startingLives: Math.round(startingLives),
    shrinkStartMs: Math.round(shrinkStartMs),
    shrinkRate,
  };

  emitSettings(settings);

  return settings;
};

export const setSetting = async <K extends SettingKey>(
  key: K,
  value: GameSettings[K],
): Promise<void> => {
  await AsyncStorage.setItem(KEYS[key], String(value));
};

export const resetSettings = async (): Promise<void> => {
  await Promise.all(
    (Object.keys(DEFAULT_SETTINGS) as SettingKey[]).map((key) =>
      AsyncStorage.setItem(KEYS[key], String(DEFAULT_SETTINGS[key])),
    ),
  );
};

export const useSettings = () => {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const storedSettings = await getSettings();

        if (mounted) {
          setSettings(storedSettings);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  const updateSetting = useCallback(
    async <K extends SettingKey>(key: K, value: GameSettings[K]) => {
      const nextSettings = {
        ...cachedSettings,
        [key]: value,
      };

      setSettings(nextSettings);

      emitSettings(nextSettings);

      try {
        await setSetting(key, value);
      } catch (error) {
        console.error("Failed to save setting:", error);
      }
    },
    [],
  );

  const reset = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    emitSettings(DEFAULT_SETTINGS);

    try {
      await resetSettings();
    } catch (error) {
      console.error("Failed to reset settings:", error);
    }
  }, []);

  return useMemo(
    () => ({
      settings,
      updateSetting,
      reset,
      isLoading,
    }),
    [settings, updateSetting, reset, isLoading],
  );
};
