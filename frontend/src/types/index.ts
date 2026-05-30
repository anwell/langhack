/**
 * Core data models for Voice Language Practice app.
 * These interfaces define the shape of data flowing through the application.
 */

/**
 * A conversational role-play scenario for language practice.
 */
export interface Scenario {
  id: string;
  title: string;
  /** Max 150 characters */
  description: string;
  /** ISO 639-1 language code */
  target_language: string;
  key_vocabulary?: string[];
  system_prompt: string;
  source: "preloaded" | "backend" | "generated";
  /** ISO 8601 timestamp */
  created_at: string;
}

/**
 * A single entry in a conversation transcript.
 */
export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  /** English translation of assistant target-language text, when enabled */
  english_translation?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * A complete record of a practice session.
 */
export interface SessionRecord {
  id: string;
  scenario_id: string;
  scenario_title: string;
  /** ISO 639-1 language code */
  target_language: string;
  /** ISO 8601 timestamp */
  started_at: string;
  /** ISO 8601 timestamp */
  ended_at: string;
  transcript: TranscriptEntry[];
  /** Set after successful Box upload */
  box_file_url?: string;
  /** Set after Teacher Agent evaluation */
  feedback?: SessionFeedback;
}

/**
 * Structured feedback from the Teacher Agent after a session.
 */
export interface SessionFeedback {
  session_score: number;
  session_pass_fail: "pass" | "fail";
  performance_highlights: string[];
  areas_for_improvement: string[];
  corrections: Correction[];
  suggested_vocabulary: SuggestedPhrase[];
  suggested_scenarios: SuggestedScenario[];
  lesson_plan: LessonPlanItem[];
}

/**
 * A grammar or vocabulary correction from the Teacher Agent.
 */
export interface Correction {
  original: string;
  corrected: string;
  explanation?: string;
}

/**
 * A vocabulary phrase suggestion with translation and usage context.
 */
export interface SuggestedPhrase {
  phrase: string;
  translation: string;
  context: string;
}

/**
 * A scenario suggested by the Teacher Agent for further practice.
 */
export interface SuggestedScenario {
  /** References existing scenario if available */
  id?: string;
  title: string;
  description: string;
  /** Why this scenario is suggested */
  rationale: string;
}

/**
 * A single item in the lesson plan with focus area and practice phrases.
 */
export interface LessonPlanItem {
  focus_area: string;
  /** Up to 5 phrases */
  practice_phrases: string[];
}
