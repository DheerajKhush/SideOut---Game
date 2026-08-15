import GameScreen from "@/screens/game-screen";
import { StyleSheet } from "react-native";

export default function Index() {
  return <GameScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
