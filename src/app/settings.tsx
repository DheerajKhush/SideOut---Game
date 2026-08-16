import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import {
  type BotDifficulty,
  type InputScheme,
  useSettings,
} from "@/store/settings-store";

const CYAN = "#53F2FF";
const PINK = "#FF4D9D";

type SectionCardProps = {
  title: string;
  accent: typeof CYAN | typeof PINK;
  children: React.ReactNode;
};

type SettingRowProps = {
  label: string;
  value?: string;
  children: React.ReactNode;
};

function SectionCard({ title, accent, children }: SectionCardProps) {
  return (
    <View style={[styles.sectionCard, { borderColor: `${accent}55` }]}>
      <View style={styles.sectionHeader}>
        <View
          style={[
            styles.sectionAccent,
            {
              backgroundColor: accent,
              shadowColor: accent,
            },
          ]}
        />

        <Text style={[styles.sectionTitle, { color: accent }]}>{title}</Text>
      </View>

      {children}
    </View>
  );
}

function SettingRow({ label, value, children }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>

        {value ? <Text style={styles.settingValue}>{value}</Text> : null}
      </View>

      <View style={styles.settingControl}>{children}</View>
    </View>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{
        false: "#172531",
        true: "#1B7782",
      }}
      thumbColor={value ? CYAN : "#60717B"}
      ios_backgroundColor="#172531"
    />
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly {
    label: string;
    value: T;
  }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentedControl}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segmentedOption, selected && styles.segmentedActive]}
          >
            <Text
              style={[
                styles.segmentedText,
                selected && styles.segmentedTextActive,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        style={styles.stepperButton}
      >
        <Text style={styles.stepperText}>-</Text>
      </Pressable>

      <Text style={styles.stepperValue}>{value}</Text>

      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        style={styles.stepperButton}
      >
        <Text style={styles.stepperText}>+</Text>
      </Pressable>
    </View>
  );
}

function GlowSlider({
  value,
  min,
  max,
  step,
  accent,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  accent: typeof CYAN | typeof PINK;
  onChange: (value: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(1);
  const startValue = useRef(value);

  const clamp = (next: number) => Math.max(min, Math.min(max, next));

  const snap = (next: number) => {
    const snapped = Math.round(next / step) * step;

    return Number(clamp(snapped).toFixed(3));
  };

  const updateFromPosition = (x: number) => {
    const percent = Math.max(0, Math.min(1, x / trackWidth));

    onChange(snap(min + percent * (max - min)));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        startValue.current = value;
        updateFromPosition(event.nativeEvent.locationX);
      },
      onPanResponderMove: (_, gesture) => {
        const valuePerPixel = (max - min) / trackWidth;

        onChange(snap(startValue.current + gesture.dx * valuePerPixel));
      },
    }),
  ).current;

  const percent = max === min ? 0 : (value - min) / (max - min);
  const fillWidth = Math.max(0, Math.min(1, percent)) * trackWidth;

  return (
    <View
      style={styles.sliderHitArea}
      {...panResponder.panHandlers}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      <View style={styles.sliderTrack}>
        <View
          style={[
            styles.sliderFill,
            {
              width: fillWidth,
              backgroundColor: accent,
              shadowColor: accent,
            },
          ]}
        />

        <View
          style={[
            styles.sliderThumb,
            {
              left: fillWidth,
              borderColor: accent,
              shadowColor: accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

const difficultyOptions = [
  {
    label: "Easy",
    value: "easy",
  },
  {
    label: "Normal",
    value: "normal",
  },
  {
    label: "Hard",
    value: "hard",
  },
] as const;

const inputOptions = [
  {
    label: "Drag",
    value: "drag-anywhere",
  },
  {
    label: "Fixed",
    value: "fixed-zone",
  },
] as const;

export default function SettingsScreen() {
  const { settings, updateSetting, reset } = useSettings();

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#050A13", "#03050B", "#020308"]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backArrow}>{"<"}</Text>
        </Pressable>

        <View>
          <Text style={styles.headerEyebrow}>SYSTEM</Text>

          <Text style={styles.headerTitle}>SETTINGS</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <SectionCard title="AUDIO" accent={CYAN}>
          <SettingRow
            label="MASTER VOLUME"
            value={`${Math.round(settings.masterVolume * 100)}%`}
          >
            <GlowSlider
              value={settings.masterVolume}
              min={0}
              max={1}
              step={0.05}
              accent={CYAN}
              onChange={(value) => updateSetting("masterVolume", value)}
            />
          </SettingRow>

          <SettingRow label="MUTE" value={settings.muted ? "ON" : "OFF"}>
            <Toggle
              value={settings.muted}
              onChange={(value) => updateSetting("muted", value)}
            />
          </SettingRow>
        </SectionCard>

        <SectionCard title="CONTROLS" accent={PINK}>
          <SettingRow
            label="INPUT SCHEME"
            value={
              settings.inputScheme === "drag-anywhere"
                ? "DRAG ANYWHERE"
                : "FIXED ZONE"
            }
          >
            <SegmentedControl<InputScheme>
              options={inputOptions}
              value={settings.inputScheme}
              onChange={(value) => updateSetting("inputScheme", value)}
            />
          </SettingRow>

          <SettingRow
            label="PADDLE SENSITIVITY"
            value={`${settings.paddleSensitivity.toFixed(1)}x`}
          >
            <GlowSlider
              value={settings.paddleSensitivity}
              min={0.6}
              max={1.6}
              step={0.1}
              accent={PINK}
              onChange={(value) => updateSetting("paddleSensitivity", value)}
            />
          </SettingRow>
        </SectionCard>

        <SectionCard title="GAMEPLAY" accent={CYAN}>
          <SettingRow label="BOT DIFFICULTY">
            <SegmentedControl<BotDifficulty>
              options={difficultyOptions}
              value={settings.botDifficulty}
              onChange={(value) => updateSetting("botDifficulty", value)}
            />
          </SettingRow>

          <SettingRow label="STARTING LIVES" value="PER WALL">
            <Stepper
              value={settings.startingLives}
              min={1}
              max={5}
              onChange={(value) => updateSetting("startingLives", value)}
            />
          </SettingRow>

          <SettingRow
            label="SHRINK START"
            value={`${Math.round(settings.shrinkStartMs / 1000)}s`}
          >
            <GlowSlider
              value={settings.shrinkStartMs}
              min={30_000}
              max={120_000}
              step={15_000}
              accent={CYAN}
              onChange={(value) => updateSetting("shrinkStartMs", value)}
            />
          </SettingRow>

          <SettingRow
            label="SHRINK RATE"
            value={`${settings.shrinkRate.toFixed(0)} PX/S`}
          >
            <GlowSlider
              value={settings.shrinkRate}
              min={0}
              max={12}
              step={1}
              accent={CYAN}
              onChange={(value) => updateSetting("shrinkRate", value)}
            />
          </SettingRow>
        </SectionCard>

        <Pressable onPress={reset} style={styles.resetButton}>
          <Text style={styles.resetText}>RESET TO DEFAULTS</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#03050B",
  },

  header: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(103,136,151,0.25)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,17,25,0.7)",
  },

  backArrow: {
    color: CYAN,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "700",
  },

  headerEyebrow: {
    color: "#3E6876",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 3,
  },

  headerTitle: {
    color: "#E6FBFF",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 4,
    marginTop: 2,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 14,
  },

  sectionCard: {
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "rgba(7,15,25,0.76)",
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 5,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 4,
  },

  sectionAccent: {
    width: 5,
    height: 16,
    borderRadius: 3,
    shadowOpacity: 0.85,
    shadowRadius: 9,
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.2,
  },

  settingRow: {
    minHeight: 68,
    borderTopWidth: 1,
    borderTopColor: "rgba(88,117,132,0.14)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  settingText: {
    flex: 1,
    minWidth: 112,
  },

  settingLabel: {
    color: "#D7E9EE",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  settingValue: {
    color: "#607985",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 5,
  },

  settingControl: {
    width: 174,
    alignItems: "flex-end",
  },

  sliderHitArea: {
    width: "100%",
    height: 36,
    justifyContent: "center",
  },

  sliderTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#1B2B37",
  },

  sliderFill: {
    height: 3,
    borderRadius: 2,
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },

  sliderThumb: {
    position: "absolute",
    top: -8,
    width: 19,
    height: 19,
    marginLeft: -9.5,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: "#07131D",
    shadowOpacity: 1,
    shadowRadius: 11,
  },

  segmentedControl: {
    width: "100%",
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(86,118,132,0.28)",
    backgroundColor: "rgba(6,13,21,0.72)",
    flexDirection: "row",
    padding: 3,
    gap: 3,
  },

  segmentedOption: {
    flex: 1,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },

  segmentedActive: {
    borderColor: CYAN,
    backgroundColor: "rgba(64,231,255,0.09)",
  },

  segmentedText: {
    color: "#617783",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0,
  },

  segmentedTextActive: {
    color: "#C8FAFF",
  },

  stepper: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(83,242,255,0.28)",
    borderRadius: 8,
    overflow: "hidden",
  },

  stepperButton: {
    width: 40,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,22,30,0.7)",
  },

  stepperText: {
    color: CYAN,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "500",
  },

  stepperValue: {
    width: 38,
    textAlign: "center",
    color: "#D9F8FC",
    fontSize: 13,
    fontWeight: "900",
  },

  resetButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  resetText: {
    color: "#6E8792",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
});
