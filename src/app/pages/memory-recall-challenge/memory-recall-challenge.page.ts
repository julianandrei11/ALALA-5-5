import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';
import { ProgressPage } from '../progress/progress.page';

type Phase = 'study' | 'distraction' | 'recall' | 'result';
/** Quick calm task — color match (saved for analytics). */
type DistractionType = 'color';

/** Distinct solids only — no similar shades (red / blue / green / yellow). */
type CalmColorId = 'red' | 'blue' | 'green' | 'yellow';

interface CalmColorOption {
  id: CalmColorId;
  hex: string;
  label: string;
}

interface RecallCard {
  id: number;
  /** Image URL under `src/assets/` (e.g. `assets/memory-recall/apple.png`). */
  emoji: string;
  isSelected: boolean;
  isCorrect?: boolean;
}

@Component({
  selector: 'app-memory-recall-challenge',
  templateUrl: './memory-recall-challenge.page.html',
  styleUrls: ['./memory-recall-challenge.page.scss'],
  standalone: false,
})
export class MemoryRecallChallengePage implements OnDestroy {
  phase: Phase = 'study';

  // State variables (as requested)
  studyCards: string[] = [];
  recallCards: RecallCard[] = [];
  selectedAnswers: number[] = [];

  score = 0;
  falseSelections = 0;

  isBusy = false;
  feedbackMessage = '';

  /** Fixed catalog — each round picks a random subset in `startNewRound` / distractions. */
  private readonly imagePool = [
    'assets/memory-recall/apple.png',
    'assets/memory-recall/moon.png',
    'assets/memory-recall/car.png',
    'assets/memory-recall/tulips.png',
    'assets/memory-recall/blocks.png',
    'assets/memory-recall/clock.png',
    'assets/memory-recall/beach-ball.png',
    'assets/memory-recall/socks.png',
    'assets/memory-recall/butterfly.png',
    'assets/memory-recall/sewing-machine.png',
    'assets/memory-recall/dog.png',
    'assets/memory-recall/cat.png',
  ];
  private feedbackTimeoutId: number | null = null;
  private sessionStartedAtMs: number | null = null;
  private recallStartedAtMs: number | null = null;

  // Distraction phase — color match (reference + 4 choices)
  distractionType: DistractionType = 'color';
  distractionPrompt = '';
  distractionCompleted = false;

  /** Fixed order: large touch targets, clearly different hues. */
  readonly calmColorOptions: CalmColorOption[] = [
    { id: 'red', hex: '#C62828', label: 'Red' },
    { id: 'blue', hex: '#6A2E91', label: 'Purple' },
    { id: 'green', hex: '#2E7D32', label: 'Green' },
    { id: 'yellow', hex: '#F9A825', label: 'Yellow' },
  ];

  referenceColorId: CalmColorId = 'red';
  wrongHighlightId: CalmColorId | null = null;

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private firebaseService: FirebaseService
  ) {}

  ngOnDestroy() {
    this.clearTimers();
  }

  async onBackTapped() {
    if (this.phase === 'study') {
      this.router.navigate(['/brain-games']);
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Leave this game?',
      message: 'Your current round will be reset. You can start again anytime 😊',
      buttons: [
        { text: 'Continue', role: 'cancel' },
        { text: 'Back to Brain Games', handler: () => this.router.navigate(['/brain-games']) },
      ],
    });
    await alert.present();
  }

  backToBrainGames() {
    this.router.navigate(['/brain-games']);
  }

  startNewRound() {
    this.clearTimers();
    this.sessionStartedAtMs = Date.now();
    this.recallStartedAtMs = null;

    this.phase = 'study';
    this.isBusy = false;
    this.feedbackMessage = '';

    this.studyCards = this.pickUniqueImages(3);
    this.recallCards = [];
    this.selectedAnswers = [];
    this.score = 0;
    this.falseSelections = 0;

    this.distractionCompleted = false;
    this.setupDistraction();
  }

  doneStudying() {
    if (this.phase !== 'study') return;
    if (!this.studyCards.length) return;
    this.phase = 'distraction';
    this.isBusy = false;
    this.feedbackMessage = '';
  }

  get referenceColorHex(): string {
    return this.calmColorOptions.find(c => c.id === this.referenceColorId)?.hex ?? '#1565C0';
  }

  onCalmColorPick(choice: CalmColorId) {
    if (this.phase !== 'distraction') return;
    if (this.isBusy) return;
    if (this.distractionCompleted) return;

    if (choice === this.referenceColorId) {
      this.isBusy = true;
      this.wrongHighlightId = null;
      this.distractionCompleted = true;
      this.setFeedback('Good job!', 900);
      window.setTimeout(() => this.goToRecall(), 900);
      return;
    }

    this.isBusy = true;
    this.wrongHighlightId = choice;
    this.feedbackMessage = 'That was a good try';
    if (this.feedbackTimeoutId !== null) {
      window.clearTimeout(this.feedbackTimeoutId);
    }
    this.feedbackTimeoutId = window.setTimeout(() => {
      this.feedbackMessage = '';
      this.wrongHighlightId = null;
      this.isBusy = false;
      this.feedbackTimeoutId = null;
    }, 1500);
  }

  toggleRecallCard(cardId: number) {
    if (this.phase !== 'recall') return;
    if (this.isBusy) return;

    const card = this.recallCards.find(c => c.id === cardId);
    if (!card) return;

    const alreadySelected = card.isSelected;
    const maxSelectable = this.studyCards.length;

    if (!alreadySelected && this.selectedAnswers.length >= maxSelectable) {
      // Calm hint — no penalties.
      this.setFeedback(`Select ${maxSelectable} cards only 😊`, 1200);
      return;
    }

    card.isSelected = !card.isSelected;
    this.selectedAnswers = this.recallCards.filter(c => c.isSelected).map(c => c.id);
  }

  submitRecall() {
    if (this.phase !== 'recall') return;
    if (this.isBusy) return;

    this.isBusy = true;

    const selected = this.recallCards.filter(c => c.isSelected);
    const correct = selected.filter(c => this.studyCards.includes(c.emoji));
    const falseSelected = selected.filter(c => !this.studyCards.includes(c.emoji));

    this.score = correct.length;
    this.falseSelections = falseSelected.length;

    this.recallCards.forEach(c => {
      c.isCorrect = this.studyCards.includes(c.emoji);
    });

    const percent = Math.round((this.score / this.studyCards.length) * 100);
    if (percent === 100) this.setFeedback('Good job 😊', 1200);
    else if (percent >= 50) this.setFeedback('Nice try 😊', 1200);
    else this.setFeedback('It’s okay 😊 try again gently', 1200);

    window.setTimeout(() => {
      this.phase = 'result';
      this.isBusy = false;
      this.saveSession().catch(() => {});
    }, 900);
  }

  playAgain() {
    this.startNewRound();
  }

  private setupDistraction() {
    this.distractionType = 'color';
    this.distractionCompleted = false;
    this.isBusy = false;
    this.wrongHighlightId = null;
    const roll = Math.floor(Math.random() * this.calmColorOptions.length);
    this.referenceColorId = this.calmColorOptions[roll].id;
    this.distractionPrompt = 'Tap the same color below.';
  }

  private goToRecall() {
    this.isBusy = false;
    this.feedbackMessage = '';
    this.wrongHighlightId = null;
    this.phase = 'recall';
    this.recallStartedAtMs = Date.now();
    this.buildRecallDeck();
  }

  private buildRecallDeck() {
    const correct = [...this.studyCards];
    const distractors = this.imagePool.filter(e => !correct.includes(e));

    // 3 studied + 3 distractors = 6 cards (clean 3×2 grid).
    const deckEmojis = this.shuffle([...correct, ...distractors.slice(0, 3)]);

    this.recallCards = deckEmojis.map((emoji, idx) => ({
      id: idx,
      emoji,
      isSelected: false,
    }));
    this.selectedAnswers = [];
  }

  get recallPercent(): number {
    if (!this.studyCards.length) return 0;
    return Math.round((this.score / this.studyCards.length) * 100);
  }

  get retentionRate(): number {
    // Same as recall percent for this design.
    return this.recallPercent;
  }

  private async saveSession() {
    // Per spec: "Total Time" = time spent in recall phase (not the whole round).
    const recallDurationSeconds =
      this.recallStartedAtMs ? Math.max(0, Math.round((Date.now() - this.recallStartedAtMs) / 1000)) : 0;

    const perItemSeconds =
      this.studyCards.length > 0 ? Number((recallDurationSeconds / this.studyCards.length).toFixed(1)) : 0;

    const toLabel = (asset: string): string => {
      const parts = (asset || '').split('/');
      const last = parts[parts.length - 1] || '';
      const base = last.replace(/\\.[a-z0-9]+$/i, '');
      return base.replace(/[-_]+/g, ' ').trim() || asset;
    };

    // For Memory Recall: "correct answers" are the studied cards. "patient choice" is whether they selected it.
    const selectedSet = new Set(this.recallCards.filter(c => c.isSelected).map(c => c.emoji));
    const items = this.studyCards.map((emoji) => {
      const picked = selectedSet.has(emoji);
      return {
        correctAnswer: toLabel(emoji),
        selectedAnswer: picked ? 'Selected' : 'Not selected',
        isCorrect: picked,
        durationSeconds: perItemSeconds,
      };
    });

    const sessionData = {
      category: 'memory-recall-challenge',
      // Canonical fields used by statistics/progress pages
      totalQuestions: this.studyCards.length, // Study Set Size
      correctAnswers: this.score, // Correct Answers
      skipped: 0,
      totalTime: recallDurationSeconds, // Total Time (recall phase)
      falseSelections: this.falseSelections, // False Selections
      delayedRecallPercent: this.recallPercent, // Delayed Recall %
      retentionRate: this.retentionRate, // Retention Rate
      distractionCompleted: this.distractionCompleted,
      distractionType: this.distractionType,
      timestamp: Date.now(),
      items,

      // Aliases that match the Memory Recall record schema wording exactly
      studySetSize: this.studyCards.length,
      correctAnswersCount: this.score,
      falseSelectionsCount: this.falseSelections,
      totalTimeSeconds: recallDurationSeconds,
    };

    await ProgressPage.saveGameSession(this.firebaseService, sessionData as any);
  }

  private pickUniqueImages(count: number): string[] {
    return this.shuffle([...this.imagePool]).slice(0, count);
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private setFeedback(message: string, clearAfterMs: number) {
    this.feedbackMessage = message;
    if (this.feedbackTimeoutId !== null) window.clearTimeout(this.feedbackTimeoutId);
    this.feedbackTimeoutId = window.setTimeout(() => {
      this.feedbackMessage = '';
      this.feedbackTimeoutId = null;
    }, clearAfterMs);
  }

  private clearTimers() {
    if (this.feedbackTimeoutId !== null) {
      window.clearTimeout(this.feedbackTimeoutId);
      this.feedbackTimeoutId = null;
    }
  }
}

