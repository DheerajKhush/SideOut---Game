import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import {
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import Animated, {
    Easing,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";
import { runOnJS } from "react-native-worklets";

import { ArenaPreview } from "@/render/arena-preview";
import BackgroundGrid from "@/render/backgroundGrid";

const LOCAL_COLOR = "#67FFD1";
const BOT_COLOR = "#FF4D8D";

const ENTRANCE_DURATION = 350;
const ENTRANCE_STAGGER = 125;
const EXIT_DURATION = 200;

const PLAY_ZOOM_DURATION = 500;

const easeOut = Easing.out(Easing.quad);

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();

  /*
   * ============================================================
   * HOME SECTION OPACITY
   * ============================================================
   *
   * These values ONLY affect opacity.
   *
   * ArenaPreview's simulation is completely independent and
   * continues running normally underneath the opacity animation.
   */
  const headingOpacity = useSharedValue(0);
  const arenaOpacity = useSharedValue(0);
  const actionsOpacity = useSharedValue(0);

  /*
   * ============================================================
   * PLAY TRANSITION
   * ============================================================
   *
   * These values belong to the ARENA PREVIEW itself.
   *
   * The preview grows from its current size into the game-sized
   * arena instead of replacing it with another animation.
   */
  const arenaScale = useSharedValue(1);
  const arenaTranslateX = useSharedValue(0);
  const arenaTranslateY = useSharedValue(0);

  /*
   * JS-side guard.
   *
   * This prevents rapid double taps from starting the zoom twice.
   */
  const isTransitioningRef = useRef(false);

  /*
   * We need this because the focus cleanup runs when Home loses
   * focus. During PLAY we don't want that cleanup to start another
   * opacity animation.
   */
  const isPlayingRef = useRef(false);

  /*
   * ============================================================
   * ENTRANCE
   * ============================================================
   */
  const animateEntrance = useCallback(() => {
    headingOpacity.value = withDelay(
      0,
      withTiming(1, {
        duration: ENTRANCE_DURATION,
        easing: easeOut,
      }),
    );

    arenaOpacity.value = withDelay(
      ENTRANCE_STAGGER,
      withTiming(1, {
        duration: ENTRANCE_DURATION,
        easing: easeOut,
      }),
    );

    actionsOpacity.value = withDelay(
      ENTRANCE_STAGGER * 2,
      withTiming(1, {
        duration: ENTRANCE_DURATION,
        easing: easeOut,
      }),
    );
  }, [headingOpacity, arenaOpacity, actionsOpacity]);

  /*
   * ============================================================
   * NORMAL HOME EXIT
   * ============================================================
   *
   * Used when navigating to Settings or when Home is otherwise
   * blurred/unmounted.
   */
  const animateExit = useCallback(() => {
    headingOpacity.value = withTiming(0, {
      duration: EXIT_DURATION,
      easing: easeOut,
    });

    arenaOpacity.value = withTiming(0, {
      duration: EXIT_DURATION,
      easing: easeOut,
    });

    actionsOpacity.value = withTiming(0, {
      duration: EXIT_DURATION,
      easing: easeOut,
    });
  }, [headingOpacity, arenaOpacity, actionsOpacity]);

  /*
   * ============================================================
   * FOCUS / BLUR
   * ============================================================
   */
  useFocusEffect(
    useCallback(() => {
      /*
       * Home has become active again.
       *
       * Reset all Home animation state so coming back from Settings
       * or Game produces the same entrance animation.
       */
      isTransitioningRef.current = false;
      isPlayingRef.current = false;

      headingOpacity.value = 0;
      arenaOpacity.value = 0;
      actionsOpacity.value = 0;

      arenaScale.value = 1;
      arenaTranslateX.value = 0;
      arenaTranslateY.value = 0;

      animateEntrance();

      return () => {
        /*
         * PLAY owns its own transition.
         *
         * Do NOT start the normal Home exit animation here because
         * the arena is currently growing into the Game screen.
         */
        if (isPlayingRef.current) {
          return;
        }

        animateExit();
      };
    }, [
      animateEntrance,
      animateExit,
      headingOpacity,
      arenaOpacity,
      actionsOpacity,
      arenaScale,
      arenaTranslateX,
      arenaTranslateY,
    ]),
  );

  /*
   * ============================================================
   * DIMENSIONS
   * ============================================================
   */
  const headingHeight = height * 0.23;
  const arenaHeight = height * 0.52;
  const actionsHeight = height * 0.25;

  /*
   * The preview remains square.
   */
  const arenaSize = Math.min(width - 32, arenaHeight - 16);

  /*
   * ============================================================
   * PLAY TRANSITION
   * ============================================================
   */
  const handlePlay = useCallback(() => {
    /*
     * Debounce rapid double taps.
     */
    if (isTransitioningRef.current) {
      return;
    }

    isTransitioningRef.current = true;
    isPlayingRef.current = true;

    /*
     * Cancel any entrance animations that may still be running.
     */
    headingOpacity.value = withTiming(0, {
      duration: EXIT_DURATION,
      easing: easeOut,
    });

    actionsOpacity.value = withTiming(0, {
      duration: EXIT_DURATION,
      easing: easeOut,
    });

    /*
     * Keep the arena visible.
     *
     * The arena itself is NOT faded out.
     * It becomes the transition element.
     */
    arenaOpacity.value = withTiming(1, {
      duration: 0,
    });

    /*
     * The preview is currently centered inside the arena section.
     *
     * Move its center to the center of the full screen while
     * simultaneously scaling it up.
     *
     * Current arena center:
     *
     *   headingHeight + arenaHeight / 2
     *
     * Desired center:
     *
     *   height / 2
     */
    const currentCenterY = headingHeight + arenaHeight / 2;
    const targetCenterY = height / 2;

    const translateY = targetCenterY - currentCenterY;

    /*
     * Scale enough for the arena to cover the entire screen.
     *
     * We use the larger ratio so there is no visible gap at
     * either the width or height boundary during the handoff.
     */
    const targetScale = Math.max(
      width / arenaSize,
      height / arenaSize,
    );

    arenaTranslateX.value = withTiming(0, {
      duration: PLAY_ZOOM_DURATION,
      easing: easeOut,
    });

    arenaTranslateY.value = withTiming(translateY, {
      duration: PLAY_ZOOM_DURATION,
      easing: easeOut,
    });

    arenaScale.value = withTiming(
      targetScale,
      {
        duration: PLAY_ZOOM_DURATION,
        easing: easeOut,
      },
      (finished) => {
        if (!finished) {
          return;
        }

        /*
         * IMPORTANT:
         *
         * Navigation happens ONLY after the visual zoom has
         * completed.
         *
         * Therefore the real Game screen cannot start its round
         * before the player has visually reached the game arena.
         */
        runOnJS(navigateToGame)();
      },
    );
  }, [
    width,
    height,
    arenaSize,
    headingHeight,
    arenaHeight,
    headingOpacity,
    actionsOpacity,
    arenaOpacity,
    arenaScale,
    arenaTranslateX,
    arenaTranslateY,
  ]);

  /*
   * Navigation must run on JS because the completion callback
   * of withTiming executes on the UI thread.
   */
  const navigateToGame = useCallback(() => {
    router.push("/game");
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* =================================================
            FULL HOME BACKGROUND
            ================================================= */}

        <BackgroundGrid width={width} height={height} />

        {/* =================================================
            SECTION 1 — HEADING
            ================================================= */}

        <Animated.View
          style={[
            styles.headingSection,
            {
              height: headingHeight,
              opacity: headingOpacity,
            },
          ]}
        >
          <Text style={styles.sideLogo}>SIDE</Text>

          <Text style={styles.outLogo}>OUT</Text>
        </Animated.View>

        {/* =================================================
            SECTION 2 — ARENA PREVIEW
            ================================================= */}

        <Animated.View
          style={[
            styles.arenaSection,
            {
              height: arenaHeight,
              opacity: arenaOpacity,
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.arenaPreviewContainer,
              {
                width: arenaSize,
                height: arenaSize,

                /*
                 * PLAY transition happens on this exact wrapper.
                 *
                 * ArenaPreview itself is NOT recreated and its
                 * simulation is not modified.
                 */
                transform: [
                  {
                    translateX: arenaTranslateX,
                  },
                  {
                    translateY: arenaTranslateY,
                  },
                  {
                    scale: arenaScale,
                  },
                ],
              },
            ]}
          >
            <ArenaPreview size={arenaSize} />
          </Animated.View>
        </Animated.View>

        {/* =================================================
            SECTION 3 — ACTIONS
            ================================================= */}

        <Animated.View
          style={[
            styles.actionsSection,
            {
              height: actionsHeight,
              opacity: actionsOpacity,
            },
          ]}
        >
          <Pressable
            disabled={isTransitioningRef.current}
            style={[styles.button, styles.playButton]}
            onPress={handlePlay}
          >
            <Text style={styles.playButtonText}>PLAY</Text>
          </Pressable>

          <Pressable
            disabled={isTransitioningRef.current}
            style={[styles.button, styles.secondaryButton]}
            onPress={() => router.push("/settings")}
          >
            <Text style={styles.secondaryButtonText}>SETTINGS</Text>
          </Pressable>

          <Pressable
            disabled={isTransitioningRef.current}
            style={[styles.button, styles.secondaryButton]}
          >
            <Text style={styles.secondaryButtonText}>HOW TO PLAY</Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  container: {
    flex: 1,
  },

  /* =====================================================
     HEADING
     =================================================== */

  headingSection: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  sideLogo: {
    color: LOCAL_COLOR,
    fontSize: 48,
    lineHeight: 45,
    fontWeight: "900",
    letterSpacing: 6,

    textShadowColor: "rgba(103,255,209,0.75)",
    textShadowOffset: {
      width: 0,
      height: 0,
    },
    textShadowRadius: 13,
  },

  outLogo: {
    color: BOT_COLOR,
    fontSize: 55,
    lineHeight: 53,
    fontWeight: "900",
    letterSpacing: 7,
    marginTop: -2,

    textShadowColor: "rgba(255,77,141,0.75)",
    textShadowOffset: {
      width: 0,
      height: 0,
    },
    textShadowRadius: 13,
  },

  /* =====================================================
     ARENA
     =================================================== */

  arenaSection: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    overflow: "hidden",
  },

  arenaPreviewContainer: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  /* =====================================================
     ACTIONS
     =================================================== */

  actionsSection: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 30,
    paddingTop: 8,
    gap: 8,
    backgroundColor: "transparent",
  },

  button: {
    width: "100%",
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  playButton: {
    backgroundColor: LOCAL_COLOR,
    borderWidth: 1,
    borderColor: "#A1FFE7",

    shadowColor: LOCAL_COLOR,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },

  playButtonText: {
    color: "#061014",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 4,
  },

  secondaryButton: {
    backgroundColor: "rgba(5,11,20,0.82)",
    borderWidth: 1,
    borderColor: "rgba(107,140,170,0.42)",
  },

  secondaryButtonText: {
    color: "#8CA5AE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.5,
  },
});