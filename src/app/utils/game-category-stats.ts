/**
 * Aggregates session lists into per-game rows for Progress / Statistics / Firestore.
 * Memory Recall and Guess the Silhouettes total correctResponses / totalItems across every
 * session in the list (selected period).
 */

function getSessionMillis(s: any): number {
  const t = s?.timestamp ?? s?.createdAt;
  if (t == null) return 0;
  if (typeof t === 'number' && !isNaN(t)) return t;
  if (typeof t?.toMillis === 'function') return t.toMillis();
  if (typeof t?.seconds === 'number') return t.seconds * 1000 + (t.nanoseconds || 0) / 1e6;
  const d = new Date(t);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Most recent session in the list (by timestamp); list is usually already filtered by period. */
function pickLatestSession(sArr: any[]): any | null {
  if (!sArr.length) return null;
  let best = sArr[0];
  let bestMs = getSessionMillis(best);
  for (let i = 1; i < sArr.length; i++) {
    const ms = getSessionMillis(sArr[i]);
    if (ms >= bestMs) {
      best = sArr[i];
      bestMs = ms;
    }
  }
  return best;
}

export function isRecordStatCategory(row: { name: string }): boolean {
  return row.name === 'Memory Recall' || row.name === 'Guess the Silhouettes';
}

export function normalizeSessionCategory(s: any): string {
  return (s?.category || '').toString().toLowerCase().trim().replace(/\s+/g, '-');
}

/** Never rolls into overall accuracy / cards reviewed — those metrics are flashcards + Category Match only. */
const EXCLUDED_FROM_OVERALL_STATS = new Set([
  'memory-recall-challenge',
  'memory-recall',
  'guess-the-silhouettes',
  'guess-the-silhouette',
]);

const INCLUDED_IN_OVERALL_STATS = new Set([
  'people',
  'name-that-memory-people',
  'places',
  'name-that-memory-places',
  'objects',
  'name-that-memory-objects',
  'category-match',
  'categorymatch',
]);

/**
 * Only Name That Memory (People/Places/Objects) and Category Match sessions roll into
 * `overallStats`. Memory Recall and Guess the Silhouettes are excluded.
 */
export function isSessionCountingTowardOverallStats(s: any): boolean {
  const n = normalizeSessionCategory(s);
  if (EXCLUDED_FROM_OVERALL_STATS.has(n)) return false;
  return INCLUDED_IN_OVERALL_STATS.has(n);
}

export function filterSessionsForOverallStats(sessions: any[] | null | undefined): any[] {
  return (sessions || []).filter(isSessionCountingTowardOverallStats);
}

/** Statistics page: switch between Flashcards aggregate, Memory Recall, or Guess the Silhouettes. */
export type StatisticsGameTab = 'flashcards' | 'memory-recall' | 'silhouettes';

export function filterSessionsForStatisticsTab(
  sessions: any[] | null | undefined,
  tab: StatisticsGameTab
): any[] {
  const list = sessions || [];
  if (tab === 'flashcards') {
    return filterSessionsForOverallStats(list);
  }
  if (tab === 'memory-recall') {
    return list.filter((s) => {
      const n = normalizeSessionCategory(s);
      return n === 'memory-recall-challenge' || n === 'memory-recall';
    });
  }
  return list.filter((s) => {
    const n = normalizeSessionCategory(s);
    return n === 'guess-the-silhouettes' || n === 'guess-the-silhouette';
  });
}

/** Drop legacy % `accuracy` — record games use `correctResponses` / `totalItems` only. */
export function stripAccuracyFromRecordRows(rows: any[]): any[] {
  return rows.map((r) => {
    if (!isRecordStatCategory(r)) return r;
    const out = { ...r };
    delete out.accuracy;
    return out;
  });
}

/** Default rows (all zeros); same shape as {@link buildGameCategoryStatsRows}. */
export function emptyCategoryStatsRows(): any[] {
  return buildGameCategoryStatsRows([]);
}

export function buildGameCategoryStatsRows(sessions: any[]): any[] {
  const rows = [
    { name: 'People', icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
    { name: 'Places', icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
    { name: 'Objects', icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
    { name: 'Category Match', icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
    {
      name: 'Memory Recall',
      icon: '',
      cardsPlayed: 0,
      avgTime: 0,
      correctResponses: 0,
      totalItems: 0,
      // Memory Recall-specific accumulated fields (kept in sync with game session schema)
      studySetSize: 0,
      recordCorrect: 0,
      recordTotal: 0,
      falseSelections: 0,
      recallPhaseTime: 0,
      delayedRecallPercent: 0,
    },
    {
      name: 'Guess the Silhouettes',
      icon: '',
      cardsPlayed: 0,
      avgTime: 0,
      correctResponses: 0,
      totalItems: 0,
    },
  ];

  const byName = (name: string) => rows.find((c) => c.name === name)!;

  const accumulate = (catName: string, sArr: any[]) => {
    if (sArr.length === 0) return;
    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalTime = 0;
    sArr.forEach((s) => {
      totalQuestions += s.totalQuestions || 0;
      totalCorrect += s.correctAnswers || 0;
      totalTime += s.totalTime || 0;
    });
    const row = byName(catName);
    row.cardsPlayed = totalQuestions;
    row.accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    row.avgTime = totalQuestions > 0 ? Number((totalTime / totalQuestions).toFixed(1)) : 0;
  };

  /** One evaluation per game: use only the latest session (no cross-session sums). */
  const applyRecordFromLatestSession = (catName: string, sArr: any[]) => {
    const row = byName(catName);
    const latest = pickLatestSession(sArr);
    if (!latest) {
      row.correctResponses = 0;
      row.totalItems = catName === 'Memory Recall' ? 4 : 0;
      row.cardsPlayed = 0;
      row.avgTime = 0;
      return;
    }
    const totalQuestions = latest.totalQuestions || 0;
    const totalCorrect = latest.correctAnswers || 0;
    const totalTime = latest.totalTime || 0;
    row.correctResponses = totalCorrect;
    row.totalItems = totalQuestions;
    row.cardsPlayed = totalQuestions;
    row.avgTime = totalQuestions > 0 ? Number((totalTime / totalQuestions).toFixed(1)) : 0;
  };

  /** Sum every session’s correct/total/time (fraction + weighted avg time). */
  const accumulateRecordSessions = (catName: string, sArr: any[]) => {
    const row = byName(catName);
    if (sArr.length === 0) {
      row.correctResponses = 0;
      row.totalItems = 0;
      row.cardsPlayed = 0;
      row.avgTime = 0;
      return;
    }
    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalTime = 0;
    sArr.forEach((s) => {
      totalQuestions += s.totalQuestions || 0;
      totalCorrect += s.correctAnswers || 0;
      totalTime += s.totalTime || 0;
    });
    row.correctResponses = totalCorrect;
    row.totalItems = totalQuestions;
    row.cardsPlayed = totalQuestions;
    row.avgTime = totalQuestions > 0 ? Number((totalTime / totalQuestions).toFixed(1)) : 0;
  };

  /** Memory Recall: sum totals + compute delayed recall %, also track false selections + recall time. */
  const accumulateMemoryRecallSessions = (sArr: any[]) => {
    const row = byName('Memory Recall');
    if (sArr.length === 0) {
      row.correctResponses = 0;
      row.totalItems = 0;
      row.cardsPlayed = 0;
      row.avgTime = 0;
      row.studySetSize = 0;
      row.recordCorrect = 0;
      row.recordTotal = 0;
      row.falseSelections = 0;
      row.recallPhaseTime = 0;
      row.delayedRecallPercent = 0;
      return;
    }

    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalTime = 0;
    let totalFalseSelections = 0;
    sArr.forEach((s) => {
      totalQuestions += s.totalQuestions || 0;
      totalCorrect += s.correctAnswers || 0;
      totalTime += s.totalTime || 0;
      totalFalseSelections += s.falseSelections || 0;
    });

    row.correctResponses = totalCorrect;
    row.totalItems = totalQuestions;
    row.cardsPlayed = totalQuestions;
    row.avgTime = totalQuestions > 0 ? Number((totalTime / totalQuestions).toFixed(1)) : 0;

    row.studySetSize = totalQuestions;
    row.recordCorrect = totalCorrect;
    row.recordTotal = totalQuestions;
    row.falseSelections = totalFalseSelections;
    row.recallPhaseTime = Number((totalTime / Math.max(1, sArr.length)).toFixed(1));
    row.delayedRecallPercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  };

  const norm = (s: any) => normalizeSessionCategory(s);
  const peopleSessions = sessions.filter((s) => norm(s) === 'people' || norm(s) === 'name-that-memory-people');
  const placesSessions = sessions.filter((s) => norm(s) === 'places' || norm(s) === 'name-that-memory-places');
  const objectsSessions = sessions.filter((s) => norm(s) === 'objects' || norm(s) === 'name-that-memory-objects');
  const cmSessions = sessions.filter((s) => norm(s) === 'category-match' || norm(s) === 'categorymatch');
  const memoryRecallSessions = sessions.filter(
    (s) => norm(s) === 'memory-recall-challenge' || norm(s) === 'memory-recall'
  );
  const silhouetteSessions = sessions.filter(
    (s) => norm(s) === 'guess-the-silhouettes' || norm(s) === 'guess-the-silhouette'
  );

  accumulate('People', peopleSessions);
  accumulate('Places', placesSessions);
  accumulate('Objects', objectsSessions);
  accumulate('Category Match', cmSessions);
  accumulateMemoryRecallSessions(memoryRecallSessions);
  accumulateRecordSessions('Guess the Silhouettes', silhouetteSessions);

  return stripAccuracyFromRecordRows(rows);
}
