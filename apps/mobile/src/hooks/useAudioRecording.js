import { useState, useRef } from "react";
import { Alert, Animated } from "react-native";
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from "expo-audio";
import * as Haptics from "expo-haptics";

export function useAudioRecording() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const scaleAnim = useState(new Animated.Value(1))[0];

  // Waveform animation
  const waveformAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3)),
  ).current;

  const animateWaveform = () => {
    const animations = waveformAnims.map((anim, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: 200 + index * 50,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 200 + index * 50,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    Animated.parallel(animations).start();
  };

  const stopWaveform = () => {
    waveformAnims.forEach((anim) => {
      anim.stopAnimation();
      anim.setValue(0.3);
    });
  };

  const startRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please enable microphone access to record audio.",
        );
        return false;
      }

      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      animateWaveform();

      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ).start();

      return true;
    } catch (err) {
      console.error("Failed to start recording", err);
      Alert.alert("Error", "Failed to start recording");
      return false;
    }
  };

  const stopRecording = async () => {
    if (!recorderState.isRecording) return null;

    try {
      stopWaveform();
      scaleAnim.stopAnimation();
      scaleAnim.setValue(1);

      await recorder.stop();
      const uri = recorder.uri;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      return uri;
    } catch (err) {
      console.error("Failed to stop recording", err);
      Alert.alert("Error", "Failed to stop recording");
      return null;
    }
  };

  return {
    recorderState,
    scaleAnim,
    waveformAnims,
    startRecording,
    stopRecording,
  };
}
