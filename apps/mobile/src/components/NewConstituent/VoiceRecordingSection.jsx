import React from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { Mic, Square, Play, Pause, RotateCcw } from "lucide-react-native";

export function VoiceRecordingSection({
  colors,
  recorderState,
  recordingUri,
  isTranscribing,
  isPlaying,
  scaleAnim,
  waveformAnims,
  onStartRecording,
  onStopRecording,
  onTogglePlayback,
  onReRecord,
}) {
  return (
    <>
      <Text
        style={{
          fontSize: 14,
          fontFamily: "Poppins_500Medium",
          color: colors.text,
          marginBottom: 12,
        }}
      >
        Voice Recording
      </Text>
      <View
        style={{
          backgroundColor: colors.cardBackground,
          borderWidth: 1,
          borderColor: colors.outline,
          borderRadius: 16,
          padding: 24,
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        {/* Recording Button */}
        {!recordingUri && (
          <>
            <TouchableOpacity
              onPress={
                recorderState.isRecording ? onStopRecording : onStartRecording
              }
              disabled={isTranscribing}
              activeOpacity={0.8}
            >
              <Animated.View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: recorderState.isRecording
                    ? colors.error
                    : colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [{ scale: scaleAnim }],
                }}
              >
                {recorderState.isRecording ? (
                  <Square
                    size={32}
                    color={colors.background}
                    fill={colors.background}
                  />
                ) : (
                  <Mic size={32} color={colors.background} />
                )}
              </Animated.View>
            </TouchableOpacity>

            {/* Waveform Visualization */}
            {recorderState.isRecording && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 20,
                  height: 40,
                }}
              >
                {waveformAnims.map((anim, index) => (
                  <Animated.View
                    key={index}
                    style={{
                      width: 4,
                      backgroundColor: colors.error,
                      borderRadius: 2,
                      opacity: 0.8,
                      transform: [
                        {
                          scaleY: anim,
                        },
                      ],
                      height: 40,
                    }}
                  />
                ))}
              </View>
            )}

            <Text
              style={{
                fontSize: 15,
                fontFamily: "Poppins_500Medium",
                color: colors.text,
                marginTop: 16,
              }}
            >
              {recorderState.isRecording
                ? "Tap to stop recording"
                : isTranscribing
                  ? "Transcribing and extracting fields..."
                  : "Tap to start recording"}
            </Text>
          </>
        )}

        {/* Playback Controls */}
        {recordingUri && !recorderState.isRecording && (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                marginBottom: 20,
              }}
            >
              <TouchableOpacity
                onPress={onTogglePlayback}
                activeOpacity={0.8}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isPlaying ? (
                  <Pause
                    size={28}
                    color={colors.background}
                    fill={colors.background}
                  />
                ) : (
                  <Play
                    size={28}
                    color={colors.background}
                    fill={colors.background}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onReRecord}
                activeOpacity={0.8}
                style={{
                  paddingHorizontal: 20,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.fieldFill,
                  borderWidth: 1,
                  borderColor: colors.outline,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <RotateCcw size={18} color={colors.text} />
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Poppins_500Medium",
                    color: colors.text,
                  }}
                >
                  Re-record
                </Text>
              </TouchableOpacity>
            </View>

            <Text
              style={{
                fontSize: 13,
                fontFamily: "Poppins_400Regular",
                color: colors.textSecondary,
              }}
            >
              {isPlaying ? "Playing..." : "Tap play to review"}
            </Text>
          </>
        )}
      </View>
    </>
  );
}
