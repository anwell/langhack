import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AchievementState,
  evaluateAchievements,
  loadAchievementState,
  updateAchievementState,
} from './AchievementService';

// AsyncStorage is auto-mocked by the __mocks__ setup in react-native projects
// If not, we mock it manually:
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const ACHIEVEMENTS_KEY = '@langhack/achievements';

describe('AchievementService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadAchievementState', () => {
    it('returns default state when nothing is stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      const state = await loadAchievementState();
      expect(state).toEqual({
        total_sessions: 0,
        current_streak: 0,
        last_session_date: null,
        earned_badges: [],
      });
    });

    it('parses stored state correctly', async () => {
      const stored: AchievementState = {
        total_sessions: 5,
        current_streak: 3,
        last_session_date: '2024-01-15T10:00:00.000Z',
        earned_badges: [
          { id: 'first-session', label: 'First Steps!', icon: '🎯', earned_at: '2024-01-01T00:00:00.000Z', session_id: '' },
        ],
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(stored));
      const state = await loadAchievementState();
      expect(state).toEqual(stored);
    });
  });

  describe('evaluateAchievements', () => {
    it('awards first-session on total_sessions === 1', () => {
      const state: AchievementState = {
        total_sessions: 1,
        current_streak: 1,
        last_session_date: new Date().toISOString(),
        earned_badges: [],
      };
      const badges = evaluateAchievements(75, state);
      expect(badges).toHaveLength(1);
      expect(badges[0].id).toBe('first-session');
    });

    it('does not award first-session if already earned', () => {
      const state: AchievementState = {
        total_sessions: 1,
        current_streak: 1,
        last_session_date: new Date().toISOString(),
        earned_badges: [
          { id: 'first-session', label: 'First Steps!', icon: '🎯', earned_at: '2024-01-01T00:00:00.000Z', session_id: '' },
        ],
      };
      const badges = evaluateAchievements(75, state);
      expect(badges.find((b) => b.id === 'first-session')).toBeUndefined();
    });

    it('awards streak-3 when current_streak >= 3', () => {
      const state: AchievementState = {
        total_sessions: 3,
        current_streak: 3,
        last_session_date: new Date().toISOString(),
        earned_badges: [],
      };
      const badges = evaluateAchievements(70, state);
      expect(badges.find((b) => b.id === 'streak-3')).toBeDefined();
    });

    it('awards streak-5 when current_streak >= 5', () => {
      const state: AchievementState = {
        total_sessions: 5,
        current_streak: 5,
        last_session_date: new Date().toISOString(),
        earned_badges: [
          { id: 'streak-3', label: 'On a Roll!', icon: '🔥', earned_at: '2024-01-01T00:00:00.000Z', session_id: '' },
        ],
      };
      const badges = evaluateAchievements(70, state);
      expect(badges.find((b) => b.id === 'streak-5')).toBeDefined();
    });

    it('awards perfect-score when sessionScore === 100', () => {
      const state: AchievementState = {
        total_sessions: 2,
        current_streak: 2,
        last_session_date: new Date().toISOString(),
        earned_badges: [],
      };
      const badges = evaluateAchievements(100, state);
      expect(badges.find((b) => b.id === 'perfect-score')).toBeDefined();
    });

    it('does not award perfect-score for score < 100', () => {
      const state: AchievementState = {
        total_sessions: 2,
        current_streak: 2,
        last_session_date: new Date().toISOString(),
        earned_badges: [],
      };
      const badges = evaluateAchievements(99, state);
      expect(badges.find((b) => b.id === 'perfect-score')).toBeUndefined();
    });

    it('awards ten-sessions when total_sessions >= 10', () => {
      const state: AchievementState = {
        total_sessions: 10,
        current_streak: 2,
        last_session_date: new Date().toISOString(),
        earned_badges: [],
      };
      const badges = evaluateAchievements(60, state);
      expect(badges.find((b) => b.id === 'ten-sessions')).toBeDefined();
    });

    it('does not award ten-sessions when total_sessions < 10', () => {
      const state: AchievementState = {
        total_sessions: 9,
        current_streak: 2,
        last_session_date: new Date().toISOString(),
        earned_badges: [],
      };
      const badges = evaluateAchievements(60, state);
      expect(badges.find((b) => b.id === 'ten-sessions')).toBeUndefined();
    });

    it('never awards the same milestone twice', () => {
      const state: AchievementState = {
        total_sessions: 10,
        current_streak: 5,
        last_session_date: new Date().toISOString(),
        earned_badges: [
          { id: 'first-session', label: 'First Steps!', icon: '🎯', earned_at: '2024-01-01T00:00:00.000Z', session_id: '' },
          { id: 'streak-3', label: 'On a Roll!', icon: '🔥', earned_at: '2024-01-02T00:00:00.000Z', session_id: '' },
          { id: 'streak-5', label: 'Unstoppable!', icon: '⚡', earned_at: '2024-01-03T00:00:00.000Z', session_id: '' },
          { id: 'perfect-score', label: 'Perfect!', icon: '💯', earned_at: '2024-01-04T00:00:00.000Z', session_id: '' },
          { id: 'ten-sessions', label: 'Dedicated!', icon: '🏆', earned_at: '2024-01-05T00:00:00.000Z', session_id: '' },
        ],
      };
      const badges = evaluateAchievements(100, state);
      expect(badges).toHaveLength(0);
    });
  });

  describe('updateAchievementState', () => {
    it('increments streak when last session was within 48h', async () => {
      const recentDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(); // 24h ago
      const stored: AchievementState = {
        total_sessions: 2,
        current_streak: 2,
        last_session_date: recentDate,
        earned_badges: [
          { id: 'first-session', label: 'First Steps!', icon: '🎯', earned_at: '2024-01-01T00:00:00.000Z', session_id: '' },
        ],
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(stored));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const newBadges = await updateAchievementState(80);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        ACHIEVEMENTS_KEY,
        expect.any(String)
      );
      const persisted = JSON.parse(
        (AsyncStorage.setItem as jest.Mock).mock.calls[0][1]
      ) as AchievementState;
      expect(persisted.current_streak).toBe(3);
      expect(persisted.total_sessions).toBe(3);
      // streak-3 should be awarded
      expect(newBadges.find((b) => b.id === 'streak-3')).toBeDefined();
    });

    it('resets streak to 1 when gap > 48h', async () => {
      const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 49).toISOString(); // 49h ago
      const stored: AchievementState = {
        total_sessions: 4,
        current_streak: 4,
        last_session_date: oldDate,
        earned_badges: [
          { id: 'first-session', label: 'First Steps!', icon: '🎯', earned_at: '2024-01-01T00:00:00.000Z', session_id: '' },
          { id: 'streak-3', label: 'On a Roll!', icon: '🔥', earned_at: '2024-01-02T00:00:00.000Z', session_id: '' },
        ],
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(stored));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await updateAchievementState(70);

      const persisted = JSON.parse(
        (AsyncStorage.setItem as jest.Mock).mock.calls[0][1]
      ) as AchievementState;
      expect(persisted.current_streak).toBe(1);
      expect(persisted.total_sessions).toBe(5);
    });

    it('sets streak to 1 on first ever session', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const newBadges = await updateAchievementState(65);

      const persisted = JSON.parse(
        (AsyncStorage.setItem as jest.Mock).mock.calls[0][1]
      ) as AchievementState;
      expect(persisted.current_streak).toBe(1);
      expect(persisted.total_sessions).toBe(1);
      expect(newBadges.find((b) => b.id === 'first-session')).toBeDefined();
    });
  });
});
