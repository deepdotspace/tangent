/** Tangent client game layer — hooks, protocol types, and helpers. */

export * from './types'
export * from './format'
export * from './svg'
export * from './share'
export { useGuestId, guestDisplayName } from './guest'
export { invokeAction, fetchArticle } from './actionClient'
export type { ActionEnvelope } from './actionClient'
export * from './demo'
export { useAsyncRace } from './useAsyncRace'
export type { AsyncRace, AsyncRaceOptions, AsyncArticle, AsyncPhase } from './useAsyncRace'
export { useRaceArticle } from './useRaceArticle'
export type { RaceArticle } from './useRaceArticle'
export {
  useJoinRoom,
  useLiveRoom,
  useDemoLiveRace,
  demoCurrentArticle,
} from './useLiveRace'
export type { LiveRace, JoinState, JoinStatus } from './useLiveRace'
export {
  useIdentity,
  useDailyChallenge,
  useTicker,
  useLiveCount,
  useDailyLeaderboard,
  useMyRuns,
  useMyStats,
  useDailyHistogram,
  useSeriesList,
} from './useTangentData'
export type {
  RunRow,
  PairRow,
  DailyChallengeRow,
  DailyHistogramRow,
  DailyStatsRow,
  SeriesRow,
  MyStats,
  LoadStatus,
} from './useTangentData'
