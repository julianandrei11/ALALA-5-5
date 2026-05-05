import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import {
  filterSessionsForStatisticsTab,
  normalizeSessionCategory,
  type StatisticsGameTab,
} from '../../utils/game-category-stats';
import { ToastController, AlertController } from '@ionic/angular';

/** One cell in the custom range calendar (Monday-first grid). */
interface RangeCalendarCell {
  date: Date;
  inCurrentMonth: boolean;
  dayNum: number;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isBetween: boolean;
}

@Component({
  selector: 'app-statistics',
  templateUrl: './statistics.page.html',
  styleUrls: ['./statistics.page.scss'],
  standalone: false,
})
export class StatisticsPage implements OnInit {
  @ViewChild('accuracyChart', { static: false }) accuracyChart?: ElementRef;

  selectedPeriod: string = 'today';
  customStartDate: string = '';
  customEndDate: string = '';
  isPatientMode = false;

  /** Which game family’s stats + chart to show (pill tabs). */
  selectedGameTab: StatisticsGameTab = 'flashcards';

  /** Sessions after period filter; reused when switching tabs without refetching. */
  private sessionsForPeriod: any[] = [];

  chart: any;
  chartLoaded = false;

  isFirebaseConnected: boolean = false;
  dataSource: string = 'Loading...';

  overallStats = {
    accuracy: 0,
    avgTimePerCard: 0,
    totalCards: 0,
    /** Wrong answers in the selected period + tab (total questions − correct). */
    cardsMistaken: 0,
    /** Sum of correct answers / sum of questions — shown as Record fraction. */
    recordCorrect: 0,
    recordTotal: 0,
  };

  /** Memory Recall display fields are based on the latest session in the selected period. */
  memoryRecallDisplay = {
    delayedRecallPercent: 0,
    /** Average study set size per session (usually fixed at 3). */
    studySetSize: 0,
    /** Totals across sessions (used for record + percent). */
    totalQuestions: 0,
    correctAnswers: 0,
    falseSelections: 0,
    totalTimeSeconds: 0,
  };

  /** SVG circle radius for the brain-score donut (viewBox 0 0 100 100). */
  readonly brainScoreRingRadius = 38;

  recentSessions: any[] = [];
  insights: any[] = [];
  hasDataForPeriod: boolean = false;

  isDateRangePickerOpen = false;
  startMonth: string = '';
  startDay: string = '';
  startYear: string = '';
  endMonth: string = '';
  endDay: string = '';
  endYear: string = '';
  dateRangeText: string = 'Select date range';
  private viewActive = false;

  calendarCells: RangeCalendarCell[] = [];
  calendarViewYear = new Date().getFullYear();
  calendarViewMonth = new Date().getMonth() + 1;
  /** False: next tap starts a new anchor day; true: next tap completes the range. */
  private rangeAwaitingSecondTap = false;
  private pickerFieldBackup: {
    customStartDate: string;
    customEndDate: string;
    startMonth: string;
    startDay: string;
    startYear: string;
    endMonth: string;
    endDay: string;
    endYear: string;
  } | null = null;

  constructor(
    private firebaseService: FirebaseService,
    private toastController: ToastController,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private alertCtrl: AlertController,
    private location: Location
  ) {}

  goBack(): void {
    this.location.back();
  }

  get brainScoreCircumference(): number {
    return 2 * Math.PI * this.brainScoreRingRadius;
  }

  /** Stroke dash offset so the arc length matches overall accuracy (0–100%). */
  get brainScoreDashOffset(): number {
    const acc = Math.max(0, Math.min(100, Math.round(Number(this.overallStats.accuracy) || 0)));
    return this.brainScoreCircumference * (1 - acc / 100);
  }

  async ngOnInit() {
    await this.loadChartJS();
    await this.loadProgressData();
    this.initializeDatePicker();
    this.updateDateRangeText();
  }

  ionViewDidEnter() {
    this.viewActive = true;
    // Ensure canvas exists and has a real size before creating Chart.js.
    setTimeout(() => this.refreshChart(), 80);
  }

  ionViewWillLeave() {
    this.viewActive = false;
    try {
      this.chart?.destroy?.();
    } catch {}
    this.chart = undefined;
  }

  async loadChartJS() {
    try {
      if ((window as any).Chart) {
        this.chartLoaded = true;
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => {
        this.chartLoaded = true;
      };
      script.onerror = () => {
        console.error('Failed to load Chart.js');
        this.chartLoaded = false;
      };
      document.head.appendChild(script);
    } catch (error) {
      console.error('Failed to load Chart.js:', error);
      this.chartLoaded = false;
    }
  }

  private getCustomDateRange(): { start: Date; end: Date } | null {
    if (!this.customStartDate || !this.customEndDate) return null;
    const start = new Date(this.customStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(this.customEndDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private isSessionInDateRange(session: any, start: Date, end: Date): boolean {
    const ts = session.timestamp || session.createdAt || 0;
    const sessionDate = new Date(ts);
    return !isNaN(sessionDate.getTime()) && sessionDate >= start && sessionDate <= end;
  }

  filterSessionsByPeriod(sessions: any[]) {
    if (this.selectedPeriod === 'all') return sessions.slice();

    if (this.selectedPeriod === 'custom') {
      const customRange = this.getCustomDateRange();
      if (!customRange) return [];
      return sessions.filter((s) => this.isSessionInDateRange(s, customRange.start, customRange.end));
    }

    const dateBuckets = this.getChartDateRangeFromSessions(sessions);
    if (!dateBuckets || dateBuckets.length === 0) return [];
    const start = dateBuckets[0].start;
    const end = dateBuckets[dateBuckets.length - 1].end;
    return sessions.filter((s) => this.isSessionInDateRange(s, start, end));
  }

  async fetchGameSessions() {
    try {
      let allSessions: any[] = [];
      try {
        allSessions = await this.firebaseService.getUserGameSessions();
        this.isFirebaseConnected = true;
        this.dataSource = 'Firebase';
        this.firebaseService.cacheData('gameSessions', allSessions);
      } catch (fbErr) {
        console.warn('fetchGameSessions: firebase fetch failed', fbErr);
        this.isFirebaseConnected = false;
        allSessions = this.firebaseService.getCachedData('gameSessions', []);
        if (!allSessions || allSessions.length === 0) {
          const pid = localStorage.getItem('selectedPatientId') || localStorage.getItem('userId');
          const localKey = pid ? `gameSessions_${pid}` : 'gameSessions';
          const raw = localStorage.getItem(localKey) || '[]';
          try {
            allSessions = JSON.parse(raw);
          } catch {
            allSessions = [];
          }
        }
        this.dataSource = allSessions && allSessions.length > 0 ? 'Local Storage' : 'No Data';
      }
      return this.filterSessionsByPeriod(allSessions);
    } catch (error) {
      console.error('Error getting game session data:', error);
    }
    return [];
  }

  async loadProgressData() {
    try {
      const sessions = (await this.fetchGameSessions()) || [];
      this.sessionsForPeriod = sessions;
      this.updateHasDataForPeriod(sessions);
      this.calculateOverallStats(sessions);
    } catch (error) {
      console.error('Error loading progress data:', error);
      this.dataSource = 'Error';
    } finally {
      this.cdr.detectChanges();
      setTimeout(() => this.refreshChart(), 60);
    }
  }

  calculateOverallStats(sessions: any[]) {
    const defaultStats = {
      accuracy: 0,
      avgTimePerCard: 0,
      totalCards: 0,
      cardsMistaken: 0,
      recordCorrect: 0,
      recordTotal: 0,
    };
    const tabSessions = filterSessionsForStatisticsTab(sessions, this.selectedGameTab);
    if (!tabSessions.length) {
      this.overallStats = defaultStats;
      this.memoryRecallDisplay = {
        delayedRecallPercent: 0,
        studySetSize: 0,
        totalQuestions: 0,
        correctAnswers: 0,
        falseSelections: 0,
        totalTimeSeconds: 0,
      };
      return;
    }

    if (this.selectedGameTab === 'memory-recall') {
      // Accumulate ALL Memory Recall sessions in the selected period.
      let totalQuestions = 0;
      let correctAnswers = 0;
      let falseSelections = 0;
      let totalTimeSeconds = 0;

      for (const s of tabSessions) {
        totalQuestions += s?.totalQuestions || 0;
        correctAnswers += s?.correctAnswers || 0;
        falseSelections += s?.falseSelections || 0;
        totalTimeSeconds += s?.totalTime || 0;
      }

      // Recall Phase time should be an average per session.
      totalTimeSeconds = Number((totalTimeSeconds / Math.max(1, tabSessions.length)).toFixed(1));
      const studySetSize = Math.round(totalQuestions / Math.max(1, tabSessions.length));

      // Weighted across sessions (total correct / total studied).
      const delayedRecallPercent = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

      this.memoryRecallDisplay = {
        delayedRecallPercent,
        studySetSize,
        totalQuestions,
        correctAnswers,
        falseSelections,
        totalTimeSeconds,
      };

      // Reuse existing UI fields: accuracy donut + record fraction.
      this.overallStats = {
        accuracy: Math.max(0, Math.min(100, Math.round(delayedRecallPercent || 0))),
        avgTimePerCard: totalQuestions > 0 ? Number((totalTimeSeconds / totalQuestions).toFixed(1)) : 0,
        totalCards: totalQuestions,
        cardsMistaken: Math.max(0, totalQuestions - correctAnswers),
        recordCorrect: correctAnswers,
        recordTotal: totalQuestions,
      };
      return;
    }

    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalTime = 0;

    for (const session of tabSessions) {
      totalQuestions += session.totalQuestions || 0;
      totalCorrect += session.correctAnswers || 0;
      totalTime += session.totalTime || 0;
    }

    const cardsMistaken = Math.max(0, totalQuestions - totalCorrect);

    this.overallStats = {
      accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
      avgTimePerCard: totalQuestions > 0 ? Number((totalTime / totalQuestions).toFixed(1)) : 0,
      totalCards: totalQuestions,
      cardsMistaken,
      recordCorrect: totalCorrect,
      recordTotal: totalQuestions,
    };
  }

  private pickLatestSession(sArr: any[]): any | null {
    if (!sArr?.length) return null;
    let best = sArr[0];
    let bestMs = this.getSessionMillis(best);
    for (let i = 1; i < sArr.length; i++) {
      const ms = this.getSessionMillis(sArr[i]);
      if (ms >= bestMs) {
        best = sArr[i];
        bestMs = ms;
      }
    }
    return best;
  }

  private getSessionMillis(s: any): number {
    const t = s?.timestamp ?? s?.createdAt;
    if (t == null) return 0;
    if (typeof t === 'number' && !isNaN(t)) return t;
    if (typeof t?.toMillis === 'function') return t.toMillis();
    if (typeof t?.seconds === 'number') return t.seconds * 1000 + (t.nanoseconds || 0) / 1e6;
    const d = new Date(t);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  formatMinutesSeconds(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  formatSeconds(seconds: number, decimals: number = 1): string {
    const s = Number(seconds);
    const safe = Number.isFinite(s) ? Math.max(0, s) : 0;
    return `${safe.toFixed(decimals)}s`;
  }

  onPeriodChange() {
    this.loadProgressData();
  }

  selectGameTab(tab: StatisticsGameTab) {
    if (this.selectedGameTab === tab) return;
    this.selectedGameTab = tab;
    this.updateHasDataForPeriod(this.sessionsForPeriod);
    this.calculateOverallStats(this.sessionsForPeriod);
    this.cdr.detectChanges();
    setTimeout(() => this.refreshChart(), 0);
  }

  /**
   * Keep `hasDataForPeriod` in sync with the active filter + tab.
   * This prevents a "No Data" custom-range state from hiding the canvas
   * and blocking the chart from re-mounting when data becomes available.
   */
  private updateHasDataForPeriod(sessions: any[]): void {
    const tabSessions = filterSessionsForStatisticsTab(sessions || [], this.selectedGameTab);
    this.hasDataForPeriod = tabSessions.length > 0;
  }

  private getChartCatsForTab(): { key: string; label: string; color: string }[] {
    switch (this.selectedGameTab) {
      case 'memory-recall':
        return [{ key: 'memory-recall', label: 'Memory Recall', color: '#0f766e' }];
      case 'silhouettes':
        return [{ key: 'guess-the-silhouettes', label: 'Guess the Silhouettes', color: '#e11d48' }];
      default:
        return [
          { key: 'people', label: 'Name That Memory - People', color: '#6a2e91' },
          { key: 'places', label: 'Name That Memory - Places', color: '#10b981' },
          { key: 'objects', label: 'Name That Memory - Objects', color: '#f59e0b' },
          { key: 'category-match', label: 'Category Match', color: '#ef4444' },
        ];
    }
  }

  // ---- chart helpers copied from ProgressPage (minimal set) ----
  private startOfCalendarWeek(d: Date): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - x.getDay());
    return x;
  }

  private endOfCalendarWeek(d: Date): Date {
    const start = this.startOfCalendarWeek(d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  private createDayBucket(date: Date): { key: string; label: string; start: Date; end: Date } {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    const key = dayStart.toISOString().split('T')[0];
    const label = dayStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return { key, label, start: dayStart, end: dayEnd };
  }

  private getUniqueDatesFromSessions(sessions: any[]): Array<{ key: string; date: Date }> {
    const uniqueDatesMap = new Map<string, Date>();
    sessions.forEach((s) => {
      const sessionDate = new Date(s.timestamp || s.createdAt || 0);
      if (!isNaN(sessionDate.getTime())) {
        const dateKey = sessionDate.toISOString().split('T')[0];
        if (!uniqueDatesMap.has(dateKey)) uniqueDatesMap.set(dateKey, sessionDate);
      }
    });
    return Array.from(uniqueDatesMap.entries())
      .map(([key, date]) => ({ key, date }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private getChartDateRangeFromSessions(sessions: any[]) {
    const buckets: Array<{ key: string; label: string; start: Date; end: Date }> = [];

    if (this.selectedPeriod === 'today') {
      buckets.push(this.createDayBucket(new Date()));
      return buckets;
    }

    if (this.selectedPeriod === 'custom') {
      const customRange = this.getCustomDateRange();
      if (!customRange) return buckets;
      const filteredSessions = (sessions || []).filter((s) => this.isSessionInDateRange(s, customRange.start, customRange.end));
      if (filteredSessions.length === 0) return buckets;
      const sortedDates = this.getUniqueDatesFromSessions(filteredSessions);
      for (const { date } of sortedDates) buckets.push(this.createDayBucket(date));
      return buckets;
    }

    if (this.selectedPeriod === 'all') {
      if (!sessions || sessions.length === 0) return buckets;
      const sortedDates = this.getUniqueDatesFromSessions(sessions);
      for (const { date } of sortedDates) buckets.push(this.createDayBucket(date));
      return buckets;
    }

    if (this.selectedPeriod === 'week') {
      const now = new Date();
      const weekStart = this.startOfCalendarWeek(now);
      const weekEnd = this.endOfCalendarWeek(now);
      const cursor = new Date(weekStart);
      while (cursor <= weekEnd) {
        buckets.push(this.createDayBucket(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return buckets;
    }

    if (this.selectedPeriod === 'month') {
      const now = new Date();
      const endYear = now.getFullYear();
      const endMonth = now.getMonth();
      for (let back = 5; back >= 0; back--) {
        const monthStart = new Date(endYear, endMonth - back, 1, 0, 0, 0, 0);
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
        const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
        const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        buckets.push({ key, label, start: monthStart, end: monthEnd });
      }
      return buckets;
    }

    return buckets;
  }

  private isSessionInCategory(session: any, catKey: string): boolean {
    const c = normalizeSessionCategory(session);
    if (catKey === 'category-match') return c === 'category-match' || c === 'categorymatch';
    if (catKey === 'memory-recall') return c === 'memory-recall-challenge' || c === 'memory-recall';
    if (catKey === 'guess-the-silhouettes') return c === 'guess-the-silhouettes' || c === 'guess-the-silhouette';
    return c === catKey || c === `name-that-memory-${catKey}`;
  }

  private groupSessionsIntoBuckets(
    sessions: any[],
    dateRange: Array<{ key: string; label: string; start: Date; end: Date }>
  ) {
    const map: Record<string, any[]> = {};
    for (const dr of dateRange) map[dr.key] = [];
    for (const s of sessions) {
      const ts = s.timestamp || s.createdAt || 0;
      const d = new Date(ts);
      for (const dr of dateRange) {
        if (d >= dr.start && d <= dr.end) {
          map[dr.key].push(s);
          break;
        }
      }
    }
    return map;
  }

  async displayChartData() {
    const rawSessions: any[] = (await this.fetchGameSessions()) || [];
    const sessions = filterSessionsForStatisticsTab(rawSessions, this.selectedGameTab);
    const cats = this.getChartCatsForTab();

    if (!sessions.length) {
      this.hasDataForPeriod = false;
      const labels = ['Today'];
      const emptyDataset = (label: string, color: string) => ({
        label,
        data: [0],
        borderColor: color,
        backgroundColor: color + '33',
        fill: false,
        tension: 0.3,
      });
      return {
        labels,
        datasets: cats.map((c) => emptyDataset(c.label, c.color)),
      } as any;
    }

    const dateRange = this.getChartDateRangeFromSessions(sessions);
    const labels = dateRange.map((d) => d.label);
    const grouped = this.groupSessionsIntoBuckets(sessions, dateRange);

    if (this.selectedPeriod === 'today') {
      const datasets = cats.map((cat) => {
        const todaySessions = sessions.filter((s) => {
          const sessionDate = new Date(s.timestamp || s.createdAt || 0);
          const today = new Date();
          const isToday = sessionDate.toDateString() === today.toDateString();
          return isToday && this.isSessionInCategory(s, cat.key);
        });

        let accuracy = 0;
        if (todaySessions.length > 0) {
          const totalCorrect = todaySessions.reduce((sum, s) => sum + (s.correctAnswers || 0), 0);
          const totalQuestions = todaySessions.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
          accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
        }

        return {
          label: cat.label,
          data: [accuracy],
          borderColor: cat.color,
          backgroundColor: cat.color + '80',
          borderWidth: 1,
          borderRadius: 4,
        } as any;
      });

      this.hasDataForPeriod = true;
      return { labels: ['Today'], datasets } as any;
    }

    const datasets = cats.map((cat) => {
      const data = dateRange.map((dr) => {
        const allBucketSessions = grouped[dr.key] || [];
        const bucketSessions = allBucketSessions.filter((s: any) => this.isSessionInCategory(s, cat.key));
        if (!bucketSessions || bucketSessions.length === 0) return 0;
        const totalCorrect = bucketSessions.reduce((sum: number, s: any) => sum + (s.correctAnswers || 0), 0);
        const totalQuestions = bucketSessions.reduce((sum: number, s: any) => sum + (s.totalQuestions || 0), 0);
        return totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
      });
      return {
        label: cat.label,
        data,
        borderColor: cat.color,
        backgroundColor: cat.color + '33',
        borderWidth: 2,
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointBorderWidth: 2,
        pointBackgroundColor: cat.color,
        pointBorderColor: '#fff',
      } as any;
    });

    this.hasDataForPeriod = true;
    return { labels, datasets } as any;
  }

  async createChart() {
    if (!this.accuracyChart || !this.chartLoaded || !(window as any).Chart) return;
    try {
      const ctx = this.accuracyChart.nativeElement.getContext('2d');
      if (!ctx) return;

      const chartData = await this.displayChartData();
      if (this.chart) this.chart.destroy();

      const chartType = this.selectedPeriod === 'today' ? 'bar' : 'line';
      const narrowLegend = typeof window !== 'undefined' && window.innerWidth < 520;

      this.chart = new (window as any).Chart(ctx, {
        type: chartType,
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: { left: narrowLegend ? 4 : 8, right: narrowLegend ? 4 : 8, bottom: narrowLegend ? 6 : 4 },
          },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              align: 'start',
              fullSize: true,
              rtl: false,
              labels: {
                usePointStyle: true,
                pointStyle: 'rect',
                boxWidth: 10,
                boxHeight: 10,
                padding: narrowLegend ? 10 : 14,
                textAlign: 'left',
                font: { size: narrowLegend ? 10 : 12, family: 'Poppins' },
              },
            },
            tooltip: { mode: 'index', intersect: false },
          },
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: function (value: any) {
                  return value + '%';
                },
              },
            },
          },
          elements:
            chartType === 'bar'
              ? { bar: { borderWidth: 1, borderRadius: 4 } }
              : { line: { tension: 0.3, borderWidth: 2 }, point: { radius: 3, borderWidth: 2 } },
        },
      });
    } catch (error) {
      console.error('Error creating chart:', error);
    }
  }

  async updateChart() {
    if (!this.chart) {
      await this.createChart();
      return;
    }
    try {
      this.chart.destroy();
      await this.createChart();
    } catch (error) {
      console.error('Error updating chart:', error);
    }
  }

  private async refreshChart() {
    if (!this.viewActive) return;
    if (!this.chartLoaded) return;
    if (!this.accuracyChart?.nativeElement) return;

    try {
      if (this.chart) {
        await this.updateChart();
      } else {
        await this.createChart();
      }
    } catch (e) {
      console.error('Failed to refresh chart:', e);
    }
  }

  // ---- date range picker (calendar UI) ----
  toggleDateRangePicker() {
    if (!this.isDateRangePickerOpen) this.openDateRangePicker();
    else this.closeDateRangePicker();
  }

  closeDateRangePicker() {
    if (this.pickerFieldBackup) {
      const b = this.pickerFieldBackup;
      this.customStartDate = b.customStartDate;
      this.customEndDate = b.customEndDate;
      this.startMonth = b.startMonth;
      this.startDay = b.startDay;
      this.startYear = b.startYear;
      this.endMonth = b.endMonth;
      this.endDay = b.endDay;
      this.endYear = b.endYear;
      this.pickerFieldBackup = null;
    }
    this.isDateRangePickerOpen = false;
    this.updateDateRangeText();
    this.cdr.markForCheck();
  }

  async applyDateRange() {
    this.pickerFieldBackup = null;
    this.updateCustomDates();
    this.selectedPeriod = 'custom';
    this.isDateRangePickerOpen = false;
    this.onCustomDateChange();
    this.cdr.detectChanges();
    setTimeout(() => {
      this.updateDateRangeText();
      this.cdr.detectChanges();
    }, 100);
    await this.showConfirmationToast();
  }

  onCustomDateChange() {
    if (this.customStartDate && this.customEndDate) this.loadProgressData();
  }

  async showConfirmationToast() {
    const toast = await this.toastController.create({
      message: 'Date range saved successfully!',
      duration: 2000,
      position: 'top',
      color: 'success',
      cssClass: 'custom-toast',
    });
    await toast.present();
  }

  updateDateRangeText() {
    if (!this.customStartDate || !this.customEndDate) {
      this.dateRangeText = 'Select date range';
      return;
    }
    try {
      const startDate = new Date(this.customStartDate);
      const endDate = new Date(this.customEndDate);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        this.dateRangeText = 'Select date range';
        return;
      }
      const formatDate = (date: Date) =>
        date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      this.dateRangeText = `${formatDate(startDate)} - ${formatDate(endDate)}`;
    } catch {
      this.dateRangeText = 'Select date range';
    }
  }

  initializeDatePicker() {
    if (!this.startMonth || !this.startDay || !this.startYear) {
      const now = new Date();
      this.startMonth = String(now.getMonth() + 1).padStart(2, '0');
      this.startDay = String(now.getDate()).padStart(2, '0');
      this.startYear = String(now.getFullYear());
    }
    if (!this.endMonth || !this.endDay || !this.endYear) {
      const now = new Date();
      this.endMonth = String(now.getMonth() + 1).padStart(2, '0');
      this.endDay = String(now.getDate()).padStart(2, '0');
      this.endYear = String(now.getFullYear());
    }
    this.updateCustomDates();
  }

  openDateRangePicker() {
    this.pickerFieldBackup = {
      customStartDate: this.customStartDate,
      customEndDate: this.customEndDate,
      startMonth: this.startMonth,
      startDay: this.startDay,
      startYear: this.startYear,
      endMonth: this.endMonth,
      endDay: this.endDay,
      endYear: this.endYear,
    };

    if (this.customStartDate && this.customEndDate) {
      this.applyIsoPairToParts(this.customStartDate, this.customEndDate);
    } else {
      const now = new Date();
      const t = this.stripTime(now);
      this.setPartsFromTwoDates(t, t);
    }

    this.rangeAwaitingSecondTap = false;
    const anchor = this.getRangeStartDate();
    if (anchor) {
      this.calendarViewYear = anchor.getFullYear();
      this.calendarViewMonth = anchor.getMonth() + 1;
    }

    this.initializeDatePicker();
    this.rebuildCalendarGrid();
    this.isDateRangePickerOpen = true;
    this.cdr.markForCheck();
  }

  get calendarMonthYearLabel(): string {
    return new Date(this.calendarViewYear, this.calendarViewMonth - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  get summaryStartLabel(): string {
    const d = this.getRangeStartDate();
    return d ? this.formatSummaryDate(d) : '—';
  }

  get summaryEndLabel(): string {
    const d = this.getRangeEndDate();
    return d ? this.formatSummaryDate(d) : '—';
  }

  navigateCalendarMonth(delta: number): void {
    const d = new Date(this.calendarViewYear, this.calendarViewMonth - 1 + delta, 1);
    this.calendarViewYear = d.getFullYear();
    this.calendarViewMonth = d.getMonth() + 1;
    this.rebuildCalendarGrid();
  }

  jumpCalendarToToday(): void {
    const now = new Date();
    const t = this.stripTime(now);
    this.setPartsFromTwoDates(t, t);
    this.calendarViewYear = now.getFullYear();
    this.calendarViewMonth = now.getMonth() + 1;
    this.rangeAwaitingSecondTap = true;
    this.updateCustomDates();
    this.rebuildCalendarGrid();
    this.cdr.markForCheck();
  }

  onCalendarDayClick(day: Date): void {
    const t = this.stripTime(day);
    if (!this.rangeAwaitingSecondTap) {
      this.setPartsFromTwoDates(t, t);
      this.rangeAwaitingSecondTap = true;
    } else {
      const s = this.getRangeStartDate()!;
      const e0 = this.getRangeEndDate()!;
      if (t < s) {
        this.setPartsFromTwoDates(t, e0);
      } else {
        this.setPartsFromTwoDates(s, t);
      }
      this.rangeAwaitingSecondTap = false;
    }
    this.updateCustomDates();
    this.rebuildCalendarGrid();
    this.cdr.markForCheck();
  }

  private rebuildCalendarGrid(): void {
    const y = this.calendarViewYear;
    const mIdx = this.calendarViewMonth - 1;
    const first = new Date(y, mIdx, 1);
    const pad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, mIdx + 1, 0).getDate();
    const rs = this.getRangeStartDate();
    const re = this.getRangeEndDate();

    const cells: RangeCalendarCell[] = [];
    for (let i = 0; i < pad; i++) {
      const d = new Date(y, mIdx, i - pad + 1);
      cells.push(this.makeCalendarCell(d, false, rs, re));
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, mIdx, day);
      cells.push(this.makeCalendarCell(d, true, rs, re));
    }
    let n = 1;
    while (cells.length < 42) {
      const d = new Date(y, mIdx, daysInMonth + n);
      cells.push(this.makeCalendarCell(d, false, rs, re));
      n++;
    }
    this.calendarCells = cells;
  }

  private makeCalendarCell(
    date: Date,
    inCurrentMonth: boolean,
    rs: Date | null,
    re: Date | null
  ): RangeCalendarCell {
    const t = this.stripTime(date);
    let isRangeStart = false;
    let isRangeEnd = false;
    let isBetween = false;
    if (rs && re) {
      const s = this.stripTime(rs);
      const e = this.stripTime(re);
      isRangeStart = this.sameDay(t, s);
      isRangeEnd = this.sameDay(t, e);
      isBetween = t.getTime() > s.getTime() && t.getTime() < e.getTime();
    }
    return {
      date: t,
      inCurrentMonth,
      dayNum: t.getDate(),
      isRangeStart,
      isRangeEnd,
      isBetween,
    };
  }

  private stripTime(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private sameDay(a: Date, b: Date): boolean {
    return a.getTime() === b.getTime();
  }

  private applyIsoPairToParts(startIso: string, endIso: string): void {
    const [sy, sm, sd] = startIso.split('-').map((x) => parseInt(x, 10));
    const [ey, em, ed] = endIso.split('-').map((x) => parseInt(x, 10));
    this.startYear = String(sy);
    this.startMonth = String(sm).padStart(2, '0');
    this.startDay = String(sd).padStart(2, '0');
    this.endYear = String(ey);
    this.endMonth = String(em).padStart(2, '0');
    this.endDay = String(ed).padStart(2, '0');
  }

  private setPartsFromTwoDates(a: Date, b: Date): void {
    const lo = a <= b ? a : b;
    const hi = a <= b ? b : a;
    this.startYear = String(lo.getFullYear());
    this.startMonth = String(lo.getMonth() + 1).padStart(2, '0');
    this.startDay = String(lo.getDate()).padStart(2, '0');
    this.endYear = String(hi.getFullYear());
    this.endMonth = String(hi.getMonth() + 1).padStart(2, '0');
    this.endDay = String(hi.getDate()).padStart(2, '0');
  }

  private getRangeStartDate(): Date | null {
    if (!this.startYear || !this.startMonth || !this.startDay) return null;
    const y = parseInt(this.startYear, 10);
    const m = parseInt(this.startMonth, 10) - 1;
    const d = parseInt(this.startDay, 10);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : this.stripTime(dt);
  }

  private getRangeEndDate(): Date | null {
    if (!this.endYear || !this.endMonth || !this.endDay) return null;
    const y = parseInt(this.endYear, 10);
    const m = parseInt(this.endMonth, 10) - 1;
    const d = parseInt(this.endDay, 10);
    const dt = new Date(y, m, d);
    return isNaN(dt.getTime()) ? null : this.stripTime(dt);
  }

  private formatSummaryDate(d: Date): string {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private updateCustomDates() {
    if (this.startMonth && this.startDay && this.startYear) {
      this.customStartDate = `${this.startYear}-${this.startMonth}-${this.startDay}`;
    }
    if (this.endMonth && this.endDay && this.endYear) {
      this.customEndDate = `${this.endYear}-${this.endMonth}-${this.endDay}`;
    }
    this.updateDateRangeText();
  }
}

