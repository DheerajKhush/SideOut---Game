
import { BACKGROUND_OUTER } from "@/constants/game-colors";
import { Stack } from "expo-router";
import { StyleSheet, View } from 'react-native';
export default function RootLayout() {
  return (
    <View style={styles.root}>
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        animationDuration: 3000,
        contentStyle: {
          backgroundColor: "#03050B",
        },
      }}
    />
    </View>
  );
}

  const styles = StyleSheet.create({
    root : {
      backgroundColor: BACKGROUND_OUTER,
      flex: 1
      }
  });