#!/usr/bin/env python3
"""Create a soft, exactly timed ambient score for the Sonderr-v1 launch film."""
import sys
import wave

import numpy as np


def main():
    output = sys.argv[1]
    seconds = max(1, int(float(sys.argv[2])))
    rate = 48_000
    beats = [0, 7, 14, 22, 30, 38, 46, 54, 62, 70, 78]
    chords = [
        (110, 164.81, 220, 329.63), (82.41, 123.47, 164.81, 246.94),
        (98, 146.83, 196, 293.66), (73.42, 110, 146.83, 220),
        (110, 164.81, 220, 329.63), (82.41, 123.47, 164.81, 246.94),
        (98, 146.83, 196, 293.66), (110, 164.81, 220, 329.63),
        (73.42, 110, 146.83, 220), (98, 146.83, 196, 293.66),
        (110, 164.81, 220, 329.63),
    ]
    chord_array = np.asarray(chords)
    beat_array = np.asarray(beats)
    with wave.open(output, "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        for start in range(0, seconds * rate, rate):
            count = min(rate, seconds * rate - start)
            t = (start + np.arange(count, dtype=np.float64)) / rate
            index = np.clip(np.searchsorted(beat_array, t, side="right") - 1, 0, len(beats) - 1)
            previous = np.maximum(0, index - 1)
            blend = np.clip((t - beat_array[index]) / 0.65, 0, 1)
            blend = blend * blend * (3 - 2 * blend)
            pad = np.zeros(count)
            for note in range(4):
                current = np.sin(2 * np.pi * chord_array[index, note] * t + note * 0.31)
                prior = np.sin(2 * np.pi * chord_array[previous, note] * t + note * 0.31)
                pad += (prior * (1 - blend) + current * blend) * (0.035 / (1 + note * 0.22))
            pulse = 0.012 * np.sin(2 * np.pi * 55 * t) + 0.006 * np.sin(2 * np.pi * 110 * t)
            swell = 0.72 + 0.28 * np.sin(2 * np.pi * t / 22) ** 2
            envelope = np.minimum(1, t / 3) * np.minimum(1, np.maximum(0, (seconds - t) / 4))
            mono = np.clip((pad + pulse) * swell * envelope, -0.8, 0.8)
            stereo = np.column_stack((mono * 0.985, mono))
            audio.writeframes((stereo * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    main()
