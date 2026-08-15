import { Canvas, Line, Rect } from "@shopify/react-native-skia";

interface GameBackgroundProps {
  width: number;
  height: number;
}

export function GameBackground({ width, height }: GameBackgroundProps) {
  return (
    <Canvas
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
      }}
    >
      {/* Same outer background as GameRenderer */}
      <Rect x={0} y={0} width={width} height={height} color="#03070D" />

      {/* Same inner surface */}
      <Rect
        x={8}
        y={8}
        width={Math.max(0, width - 16)}
        height={Math.max(0, height - 16)}
        color="#050B14"
        opacity={0.75}
      />

      {/* Same technical grid */}
      <GroupGrid width={width} height={height} />
    </Canvas>
  );
}

function GroupGrid({ width, height }: GameBackgroundProps) {
  return (
    <>
      {Array.from({ length: 9 }).map((_, index) => {
        const x = (width / 8) * index;

        return (
          <Line
            key={`grid-v-${index}`}
            p1={{
              x,
              y: 0,
            }}
            p2={{
              x,
              y: height,
            }}
            color="#6B8CAA"
            strokeWidth={1}
            opacity={0.055}
          />
        );
      })}

      {Array.from({ length: 11 }).map((_, index) => {
        const y = (height / 10) * index;

        return (
          <Line
            key={`grid-h-${index}`}
            p1={{
              x: 0,
              y,
            }}
            p2={{
              x: width,
              y,
            }}
            color="#6B8CAA"
            strokeWidth={1}
            opacity={0.055}
          />
        );
      })}
    </>
  );
}
