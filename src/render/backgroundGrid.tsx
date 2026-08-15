import {
    BACKGROUND_INNER,
    BACKGROUND_OUTER,
    GRID_COLOR,
} from "@/constants/game-colors";
import { Canvas, Line, Rect } from "@shopify/react-native-skia";
import { StyleSheet } from "react-native";

function BackgroundGrid({ width, height }: { width: number; height: number }) {
  return (
    <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill]}>
      {/* Same outer background as GameRenderer */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        color={BACKGROUND_OUTER}
      />

      {/* Same inner surface as GameRenderer */}
      <Rect
        x={8}
        y={8}
        width={Math.max(0, width - 16)}
        height={Math.max(0, height - 16)}
        color={BACKGROUND_INNER}
        opacity={0.75}
      />

      {/* Vertical technical grid */}
      {Array.from({
        length: 9,
      }).map((_, index) => {
        const x = (width / 8) * index;

        return (
          <Line
            key={`home-grid-v-${index}`}
            p1={{
              x,
              y: 0,
            }}
            p2={{
              x,
              y: height,
            }}
            color={GRID_COLOR}
            strokeWidth={1}
            opacity={0.055}
          />
        );
      })}

      {/* Horizontal technical grid */}
      {Array.from({
        length: 11,
      }).map((_, index) => {
        const y = (height / 10) * index;

        return (
          <Line
            key={`home-grid-h-${index}`}
            p1={{
              x: 0,
              y,
            }}
            p2={{
              x: width,
              y,
            }}
            color={GRID_COLOR}
            strokeWidth={1}
            opacity={0.055}
          />
        );
      })}
    </Canvas>
  );
}

export default BackgroundGrid;
