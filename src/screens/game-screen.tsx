import { Canvas, Circle } from "@shopify/react-native-skia";
import { View, StyleSheet, useWindowDimensions } from "react-native";

export default function GameScreen() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.container}>
      <Canvas style={{ flex: 1 }}>
        <Circle cx={width / 2} cy={height / 2} r={50} color="lightblue" />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
