import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
    Pressable,
    SafeAreaView,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";

type SettingRowProps = {
  label: string;
  description?: string;
  children: React.ReactNode;
};

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>

        {description ? (
          <Text style={styles.settingDescription}>{description}</Text>
        ) : null}
      </View>

      {children}
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.sectionTitleContainer}>
      <View style={styles.sectionAccent} />

      <Text style={styles.sectionTitle}>{children}</Text>
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
        false: "#182631",
        true: "#1B7782",
      }}
      thumbColor={value ? "#53F2FF" : "#60717B"}
      ios_backgroundColor="#182631"
    />
  );
}

function Stepper({
  value,
  onDecrease,
  onIncrease,
}: {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onDecrease} style={styles.stepperButton}>
        <Text style={styles.stepperText}>−</Text>
      </Pressable>

      <Text style={styles.stepperValue}>{value}</Text>

      <Pressable onPress={onIncrease} style={styles.stepperButton}>
        <Text style={styles.stepperText}>+</Text>
      </Pressable>
    </View>
  );
}

function DifficultySelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const values = ["EASY", "NORMAL", "HARD"];

  return (
    <View style={styles.difficultyContainer}>
      {values.map((item) => {
        const selected = item === value;

        return (
          <Pressable
            key={item}
            onPress={() => onChange(item)}
            style={[
              styles.difficultyOption,
              selected && styles.difficultySelected,
            ]}
          >
            {selected && (
              <LinearGradient
                colors={["rgba(55,237,255,0.22)", "rgba(55,237,255,0.04)"]}
                style={StyleSheet.absoluteFill}
              />
            )}

            <Text
              style={[
                styles.difficultyText,
                selected && styles.difficultyTextSelected,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const [sound, setSound] = useState(true);
  const [vibration, setVibration] = useState(true);
  const [particles, setParticles] = useState(true);
  const [difficulty, setDifficulty] = useState("NORMAL");
  const [lives, setLives] = useState(2);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#050A13", "#03050B", "#020308"]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.backgroundGlow} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>

        <View>
          <Text style={styles.headerEyebrow}>SYSTEM</Text>

          <Text style={styles.headerTitle}>SETTINGS</Text>
        </View>
      </View>

      <View style={styles.content}>
        <SectionTitle>AUDIO & FEEDBACK</SectionTitle>

        <SettingRow label="SOUND" description="Game sound effects">
          <Toggle value={sound} onChange={setSound} />
        </SettingRow>

        <SettingRow label="VIBRATION" description="Haptic collision feedback">
          <Toggle value={vibration} onChange={setVibration} />
        </SettingRow>

        <SectionTitle>GAMEPLAY</SectionTitle>

        <SettingRow label="DIFFICULTY" description="Controls game intensity">
          <DifficultySelector value={difficulty} onChange={setDifficulty} />
        </SettingRow>

        <SettingRow label="STARTING LIVES" description="Lives per player">
          <Stepper
            value={lives}
            onDecrease={() => setLives((current) => Math.max(1, current - 1))}
            onIncrease={() => setLives((current) => Math.min(5, current + 1))}
          />
        </SettingRow>

        <SectionTitle>VISUALS</SectionTitle>

        <SettingRow label="PARTICLES" description="Ambient arena effects">
          <Toggle value={particles} onChange={setParticles} />
        </SettingRow>

        <View style={styles.futureCard}>
          <View style={styles.futureDot} />

          <View style={{ flex: 1 }}>
            <Text style={styles.futureTitle}>MORE SETTINGS COMING</Text>

            <Text style={styles.futureText}>
              Arena themes, control customization and game modes will be added
              later.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>SIDEOUT SYSTEM CONFIGURATION</Text>

        <Text style={styles.footerVersion}>BUILD 0.1.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#03050B",
  },

  backgroundGlow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -120,
    right: -100,
    backgroundColor: "rgba(45,232,255,0.035)",
  },

  header: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(103,136,151,0.25)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,17,25,0.7)",
  },

  backArrow: {
    color: "#70DCE7",
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "300",
    marginTop: -3,
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
    flex: 1,
    paddingHorizontal: 22,
  },

  sectionTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 8,
  },

  sectionAccent: {
    width: 3,
    height: 12,
    backgroundColor: "#3DEFFF",
    marginRight: 8,
  },

  sectionTitle: {
    color: "#597582",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },

  settingRow: {
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(65,89,101,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  settingText: {
    flex: 1,
  },

  settingLabel: {
    color: "#D5E5E9",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  settingDescription: {
    color: "#4E6571",
    fontSize: 9,
    marginTop: 4,
  },

  difficultyContainer: {
    width: 170,
    height: 34,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "rgba(75,105,119,0.22)",
    borderRadius: 8,
    overflow: "hidden",
  },

  difficultyOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  difficultySelected: {
    borderColor: "#35E9FA",
    borderWidth: 1,
  },

  difficultyText: {
    color: "#526873",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  difficultyTextSelected: {
    color: "#B9F9FF",
  },

  stepper: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(75,105,119,0.22)",
    borderRadius: 8,
    overflow: "hidden",
  },

  stepperButton: {
    width: 36,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,22,30,0.7)",
  },

  stepperText: {
    color: "#52EAF8",
    fontSize: 20,
    fontWeight: "300",
  },

  stepperValue: {
    width: 32,
    textAlign: "center",
    color: "#D9F8FC",
    fontSize: 12,
    fontWeight: "800",
  },

  futureCard: {
    marginTop: 30,
    padding: 15,
    borderWidth: 1,
    borderColor: "rgba(72,105,119,0.15)",
    borderRadius: 10,
    backgroundColor: "rgba(10,18,27,0.5)",
    flexDirection: "row",
    gap: 12,
  },

  futureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
    backgroundColor: "#FF42A7",
    shadowColor: "#FF42A7",
    shadowOpacity: 1,
    shadowRadius: 8,
  },

  futureTitle: {
    color: "#607986",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  futureText: {
    color: "#3F555F",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 5,
  },

  footer: {
    paddingHorizontal: 22,
    paddingBottom: 18,
    alignItems: "center",
  },

  footerText: {
    color: "#283E48",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  footerVersion: {
    color: "#1D2C34",
    fontSize: 7,
    marginTop: 4,
  },
});
