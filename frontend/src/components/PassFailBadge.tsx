import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  withSpring,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

interface PassFailBadgeProps {
  result: 'pass' | 'fail';
}

/**
 * A large, visually prominent pass/fail badge displayed at the top of the feedback section.
 * - On "pass": green badge with sparkle/scale celebratory animation (2-3 seconds)
 * - On "fail": red badge with pulse animation and motivational message
 */
export function PassFailBadge({ result }: PassFailBadgeProps) {
  const isPass = result === 'pass';

  // Shared values for animations
  const badgeScale = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);
  const sparkleOpacity = useSharedValue(0);
  const sparkleScale = useSharedValue(0.5);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    // Badge entrance animation
    badgeOpacity.value = withTiming(1, { duration: 300 });
    badgeScale.value = withSpring(1, { damping: 8, stiffness: 120 });

    if (isPass) {
      // Celebratory sparkle animation lasting ~2.5 seconds
      sparkleOpacity.value = withDelay(
        300,
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(1, { duration: 1700 }),
          withTiming(0, { duration: 400 }),
        ),
      );
      sparkleScale.value = withDelay(
        300,
        withSequence(
          withTiming(1.2, { duration: 600, easing: Easing.out(Easing.back(2)) }),
          withTiming(0.9, { duration: 400 }),
          withTiming(1.1, { duration: 500 }),
          withTiming(1, { duration: 500 }),
        ),
      );
    } else {
      // Encouraging pulse animation (~1.5 seconds, repeats 3 times)
      pulseScale.value = withDelay(
        300,
        withRepeat(
          withSequence(
            withTiming(1.05, { duration: 250, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.97, { duration: 250, easing: Easing.inOut(Easing.ease) }),
          ),
          3,
          true,
        ),
      );
    }

    return () => {
      cancelAnimation(badgeScale);
      cancelAnimation(badgeOpacity);
      cancelAnimation(sparkleOpacity);
      cancelAnimation(sparkleScale);
      cancelAnimation(pulseScale);
    };
  }, [isPass]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
    opacity: badgeOpacity.value,
  }));

  const sparkleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sparkleOpacity.value,
    transform: [{ scale: sparkleScale.value }],
  }));

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.badge,
          isPass ? styles.passBadge : styles.failBadge,
          badgeAnimatedStyle,
          !isPass ? pulseAnimatedStyle : undefined,
        ]}
      >
        <Text style={styles.badgeEmoji}>{isPass ? '🎉' : '💪'}</Text>
        <Text style={[styles.badgeText, isPass ? styles.passText : styles.failText]}>
          {isPass ? 'PASS' : 'KEEP GOING'}
        </Text>
        {!isPass && (
          <Text style={styles.motivationalText}>You're improving!</Text>
        )}
      </Animated.View>

      {/* Sparkle particles for pass result */}
      {isPass && (
        <Animated.View style={[styles.sparkleContainer, sparkleAnimatedStyle]}>
          <Text style={[styles.sparkle, styles.sparkleTopLeft]}>✨</Text>
          <Text style={[styles.sparkle, styles.sparkleTopRight]}>⭐</Text>
          <Text style={[styles.sparkle, styles.sparkleBottomLeft]}>🌟</Text>
          <Text style={[styles.sparkle, styles.sparkleBottomRight]}>✨</Text>
          <Text style={[styles.sparkle, styles.sparkleTop]}>🎊</Text>
          <Text style={[styles.sparkle, styles.sparkleBottom]}>⭐</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  badge: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  passBadge: {
    backgroundColor: '#dcfce7',
    borderWidth: 2,
    borderColor: '#16a34a',
  },
  failBadge: {
    backgroundColor: '#fee2e2',
    borderWidth: 2,
    borderColor: '#dc2626',
  },
  badgeEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
  passText: {
    color: '#16a34a',
  },
  failText: {
    color: '#dc2626',
  },
  motivationalText: {
    marginTop: 4,
    fontSize: 14,
    color: '#991b1b',
    fontWeight: '500',
  },
  sparkleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  sparkle: {
    position: 'absolute',
    fontSize: 20,
  },
  sparkleTopLeft: {
    top: -8,
    left: 20,
  },
  sparkleTopRight: {
    top: -8,
    right: 20,
  },
  sparkleBottomLeft: {
    bottom: -8,
    left: 30,
  },
  sparkleBottomRight: {
    bottom: -8,
    right: 30,
  },
  sparkleTop: {
    top: -12,
    left: '50%',
  },
  sparkleBottom: {
    bottom: -12,
    right: '50%',
  },
});
