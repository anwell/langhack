import AsyncStorage from '@react-native-async-storage/async-storage';

const ACHIEVEMENTS_KEY = '@langhack/achievements';

/**
 * Milestone IDs recognized by the achievement system.
 */
export type MilestoneId =
  | 'first-session'
  | 'streak-3'
  | 'streak-5'
  | 'perfect-score'
  | 'ten-sessions';

/**
 * A single earned achievement badge.
 */
export interface AchievementRecord {
  id: MilestoneId;
  label: string;
  icon: string;
  earned_at: string; // ISO 8601
  session_id: string;
}

/**
 * Persistent state for achievement tracking.
 */
export interface AchievementState {
  total_sessions: number;
  current_streak: number;
  last_session_date: string | null; // ISO 8601
  earned_badges: AchievementRecord[];
}

const DEFAULT_STATE: AchievementState = {
  total_sessions: 0,
  current_streak: 0,
  last_session_date: null,
  earned_badges: [],
};

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

/**
 * Load the current achievement state from AsyncStorage.
 * Returns the default empty state if nothing is persisted yet.
 */
export async function loadAchievementState(): Promise<AchievementState> {
  const raw = await AsyncStorage.getItem(ACHIEVEMENTS_KEY);
  if (!raw) return { ...DEFAULT_STATE, earned_badges: [] };
  return JSON.parse(raw) as AchievementState;
}

/**
 * Evaluate which new milestones have been achieved given the current session score
 * and the (already-updated) achievement state.
 *
 * The state passed in should reflect the UPDATED totals (total_sessions incremented,
 * streak already computed for this session).
 */
export function evaluateAchievements(
  sessionScore: number,
  state: AchievementState
): AchievementRecord[] {
  const newBadges: AchievementRecord[] = [];
  const now = new Date().toISOString();

  function hasEarned(id: MilestoneId): boolean {
    return state.earned_badges.some((badge) => badge.id === id);
  }

  // First session — total_sessions will be 1 after increment
  if (state.total_sessions === 1 && !hasEarned('first-session')) {
    newBadges.push({
      id: 'first-session',
      label: 'First Steps!',
      icon: '🎯',
      earned_at: now,
      session_id: '',
    });
  }

  // Streak milestones
  if (state.current_streak >= 3 && !hasEarned('streak-3')) {
    newBadges.push({
      id: 'streak-3',
      label: 'On a Roll!',
      icon: '🔥',
      earned_at: now,
      session_id: '',
    });
  }

  if (state.current_streak >= 5 && !hasEarned('streak-5')) {
    newBadges.push({
      id: 'streak-5',
      label: 'Unstoppable!',
      icon: '⚡',
      earned_at: now,
      session_id: '',
    });
  }

  // Perfect score
  if (sessionScore === 100 && !hasEarned('perfect-score')) {
    newBadges.push({
      id: 'perfect-score',
      label: 'Perfect!',
      icon: '💯',
      earned_at: now,
      session_id: '',
    });
  }

  // Ten sessions
  if (state.total_sessions >= 10 && !hasEarned('ten-sessions')) {
    newBadges.push({
      id: 'ten-sessions',
      label: 'Dedicated!',
      icon: '🏆',
      earned_at: now,
      session_id: '',
    });
  }

  return newBadges;
}

/**
 * Update the achievement state after a completed session:
 * 1. Increment total_sessions
 * 2. Update streak (reset to 1 if gap > 48h, otherwise increment)
 * 3. Evaluate milestones
 * 4. Persist updated state
 *
 * Returns the list of newly earned badges (empty if none).
 */
export async function updateAchievementState(
  sessionScore: number
): Promise<AchievementRecord[]> {
  const state = await loadAchievementState();
  const now = new Date();

  // Update streak
  if (state.last_session_date) {
    const lastDate = new Date(state.last_session_date);
    const gap = now.getTime() - lastDate.getTime();
    if (gap > FORTY_EIGHT_HOURS_MS) {
      state.current_streak = 1;
    } else {
      state.current_streak += 1;
    }
  } else {
    // First ever session
    state.current_streak = 1;
  }

  // Increment total sessions
  state.total_sessions += 1;

  // Update last session date
  state.last_session_date = now.toISOString();

  // Evaluate milestones
  const newBadges = evaluateAchievements(sessionScore, state);

  // Append new badges
  state.earned_badges = [...state.earned_badges, ...newBadges];

  // Persist
  await AsyncStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(state));

  return newBadges;
}
