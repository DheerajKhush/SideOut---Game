import { BACKGROUND_OUTER, PLAYER_SLOT_COLORS } from "@/constants/game-colors";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface RoundResultsProps {
    standings: number[];
    localPlayerId: number;
    onReplay: () => void;
    onHome: () => void;
}

const LOCAL_COLOR = "#67FFD1";

export const RoundResults = ({
    standings,
    localPlayerId,
    onReplay,
    onHome,
}: RoundResultsProps) => {
    const winner = standings[0];

    const isWinner = winner === localPlayerId;

    return (
        <View style={resultsStyles.container}>
            <View style={resultsStyles.content}>
                <Text style={resultsStyles.eyebrow}>
                    ROUND COMPLETE
                </Text>

                <Text style={resultsStyles.title}>
                    {isWinner ? "VICTORY" : "DEFEAT"}
                </Text>

                <Text style={resultsStyles.subtitle}>
                    FINAL STANDINGS
                </Text>

                <View style={resultsStyles.standings}>
                    {standings.map((playerId, index) => {
                        const isLocal = playerId === localPlayerId;

                        return (
                            <View
                                key={playerId}
                                style={[
                                    resultsStyles.row,
                                    index === 0 && resultsStyles.winnerRow,
                                    isLocal && resultsStyles.localRow,
                                ]}
                            >
                                <Text style={resultsStyles.rank}>
                                    {String(index + 1).padStart(2, "0")}
                                </Text>

                                <View style={resultsStyles.playerInfo}>
                                    <View
                                        style={[
                                            resultsStyles.playerDot,
                                            {
                                                backgroundColor:
                                                    PLAYER_SLOT_COLORS[
                                                    playerId %
                                                    PLAYER_SLOT_COLORS.length
                                                    ],
                                            },
                                        ]}
                                    />

                                    <Text style={resultsStyles.playerName}>
                                        {isLocal
                                            ? "YOU"
                                            : `BOT ${playerId + 1}`}
                                    </Text>
                                </View>

                                <Text style={resultsStyles.result}>
                                    {index === 0
                                        ? "WINNER"
                                        : `ELIMINATED ${index}`}
                                </Text>
                            </View>
                        );
                    })}
                </View>

                <View style={resultsStyles.actions}>
                    {/* Same primary action styling as Home → PLAY */}
                    <Pressable
                        style={[resultsStyles.button, resultsStyles.playButton]}
                        onPress={onReplay}
                    >
                        <Text style={resultsStyles.playButtonText}>
                            REPLAY
                        </Text>
                    </Pressable>

                    {/* Same secondary action styling as Home → SETTINGS */}
                    <Pressable
                        style={[
                            resultsStyles.button,
                            resultsStyles.secondaryButton,
                        ]}
                        onPress={onHome}
                    >
                        <Text style={resultsStyles.secondaryButtonText}>
                            HOME
                        </Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
};

const resultsStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: BACKGROUND_OUTER,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
    },

    content: {
        width: "100%",
        maxWidth: 520,
        alignItems: "center",
    },

    eyebrow: {
        color: "#607985",
        fontSize: 10,
        fontWeight: "900",
        letterSpacing: 3,
        marginBottom: 8,
    },

    title: {
        color: "#D7F9FF",
        fontSize: 34,
        fontWeight: "900",
        letterSpacing: 5,
        marginBottom: 6,
    },

    subtitle: {
        color: LOCAL_COLOR,
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 2,
        marginBottom: 24,
    },

    standings: {
        width: "100%",
        gap: 6,
        marginBottom: 28,
    },

    row: {
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: "#1B2B3D",
        backgroundColor: "#0B1420",
    },

    winnerRow: {
        borderColor: LOCAL_COLOR,
        backgroundColor: "#102A24",
    },

    localRow: {
        borderColor: "#29475A",
    },

    rank: {
        width: 34,
        color: "#607985",
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 1,
    },

    playerInfo: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
    },

    playerDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },

    playerName: {
        color: "#D7E9EE",
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1,
    },

    result: {
        color: "#607985",
        fontSize: 8,
        fontWeight: "800",
        letterSpacing: 1,
    },

    /*
     * ============================================================
     * ACTIONS
     * Same visual system as Home screen
     * ============================================================
     */

    actions: {
        width: "100%",
        gap: 8,
        paddingHorizontal: 10,
    },

    button: {
        width: "100%",
        height: 44,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },

    /*
     * Same as Home → PLAY
     */
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

    /*
     * Same as Home → SETTINGS / HOW TO PLAY
     */
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