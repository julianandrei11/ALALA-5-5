import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';
import { ProgressPage } from '../progress/progress.page';

type Screen = 'menu' | 'game' | 'result';

/** Photo in `src/assets/silhouettes/` is shown with CSS silhouette styling; otherwise emoji or ion-icon. */
interface SilhouetteItem {
  category: string;
  answer: string;
  /** e.g. `assets/silhouettes/apple.png` */
  imageAsset?: string;
  emoji?: string;
  icon?: string;
}

interface RoundState {
  item: SilhouetteItem;
  choices: string[];
  correctLabel: string;
}

@Component({
  selector: 'app-guess-the-silhouettes',
  templateUrl: './guess-the-silhouettes.page.html',
  styleUrls: ['./guess-the-silhouettes.page.scss'],
  standalone: false,
})
export class GuessTheSilhouettesPage {
  screen: Screen = 'menu';

  /** Number of silhouette items per play (sampled from the full bank). */
  readonly roundCount = 5;

  /**
   * Catalog aligned with PNGs in `src/assets/silhouettes/`. Photos are shown as dark silhouettes via CSS
   * (grayscale + contrast + multiply on the light stage). Items without a matching file keep emoji/icon.
   */
  private readonly itemBank: SilhouetteItem[] = [
    // Food
    { category: 'Food', answer: 'Apple', imageAsset: 'assets/silhouettes/apple.png' },
    { category: 'Food', answer: 'Banana', imageAsset: 'assets/silhouettes/banana.png' },
    { category: 'Food', answer: 'Bread', imageAsset: 'assets/silhouettes/bread.png' },
    { category: 'Food', answer: 'Pizza', imageAsset: 'assets/silhouettes/pizza.png' },
    { category: 'Food', answer: 'Rice bowl', imageAsset: 'assets/silhouettes/rice-bowl.png' },
    { category: 'Food', answer: 'Cup', imageAsset: 'assets/silhouettes/cup.png' },
    { category: 'Food', answer: 'Spoon', imageAsset: 'assets/silhouettes/spoon.png' },
    { category: 'Food', answer: 'Fork', imageAsset: 'assets/silhouettes/fork.png' },
    { category: 'Food', answer: 'Plate', imageAsset: 'assets/silhouettes/plate.png' },
    // Household
    { category: 'Household', answer: 'Chair', imageAsset: 'assets/silhouettes/chair.png' },
    { category: 'Household', answer: 'Table', imageAsset: 'assets/silhouettes/table.png' },
    { category: 'Household', answer: 'Bed', imageAsset: 'assets/silhouettes/bed.png' },
    { category: 'Household', answer: 'TV', imageAsset: 'assets/silhouettes/tv.png' },
    { category: 'Household', answer: 'Fan', imageAsset: 'assets/silhouettes/fan.png' },
    { category: 'Household', answer: 'Door', imageAsset: 'assets/silhouettes/door.png' },
    { category: 'Household', answer: 'Window', imageAsset: 'assets/silhouettes/window.png' },
    { category: 'Household', answer: 'Lamp', imageAsset: 'assets/silhouettes/lamp.png' },
    { category: 'Household', answer: 'Refrigerator', imageAsset: 'assets/silhouettes/refrigerator.png' },
    { category: 'Household', answer: 'Trash can', imageAsset: 'assets/silhouettes/trash-can.png' },
    { category: 'Household', answer: 'Broom', imageAsset: 'assets/silhouettes/broom.png' },
    // Tech
    { category: 'Tech', answer: 'Phone', imageAsset: 'assets/silhouettes/phone.png' },
    { category: 'Tech', answer: 'Laptop', imageAsset: 'assets/silhouettes/laptop.png' },
    { category: 'Tech', answer: 'Keyboard', imageAsset: 'assets/silhouettes/keyboard.png' },
    { category: 'Tech', answer: 'Mouse', imageAsset: 'assets/silhouettes/mouse.png' },
    { category: 'Tech', answer: 'Headphones', imageAsset: 'assets/silhouettes/headphones.png' },
    // Transport
    { category: 'Transport', answer: 'Car', imageAsset: 'assets/silhouettes/car.png' },
    { category: 'Transport', answer: 'Bus', imageAsset: 'assets/silhouettes/bus.png' },
    { category: 'Transport', answer: 'Bike', imageAsset: 'assets/silhouettes/bike.png' },
    { category: 'Transport', answer: 'Airplane', imageAsset: 'assets/silhouettes/airplane.png' },
    { category: 'Transport', answer: 'Boat', imageAsset: 'assets/silhouettes/boat.png' },
    // Animals
    { category: 'Animals', answer: 'Dog', imageAsset: 'assets/silhouettes/dog.png' },
    { category: 'Animals', answer: 'Cat', imageAsset: 'assets/silhouettes/cat.png' },
    { category: 'Animals', answer: 'Bird', imageAsset: 'assets/silhouettes/bird.png' },
    { category: 'Animals', answer: 'Fish', imageAsset: 'assets/silhouettes/fish.png' },
    { category: 'Animals', answer: 'Elephant', imageAsset: 'assets/silhouettes/elephant.png' },
    // People / actions
    { category: 'People / actions', answer: 'Walking', imageAsset: 'assets/silhouettes/walking.png' },
    { category: 'People / actions', answer: 'Sitting', imageAsset: 'assets/silhouettes/sitting.png' },
    { category: 'People / actions', answer: 'Waving', imageAsset: 'assets/silhouettes/waving.png' },
    { category: 'People / actions', answer: 'Running', imageAsset: 'assets/silhouettes/running.png' },
    // Everyday objects
    { category: 'Everyday objects', answer: 'Toothbrush', imageAsset: 'assets/silhouettes/toothbrush.png' },
    { category: 'Everyday objects', answer: 'Shoes', imageAsset: 'assets/silhouettes/shoes.png' },
    { category: 'Everyday objects', answer: 'Bag', imageAsset: 'assets/silhouettes/bag.png' },
    { category: 'Everyday objects', answer: 'Umbrella', imageAsset: 'assets/silhouettes/umbrella.png' },
    { category: 'Everyday objects', answer: 'Clock', imageAsset: 'assets/silhouettes/clock.png' },
    { category: 'Everyday objects', answer: 'Bottle', imageAsset: 'assets/silhouettes/bottle.png' },
    { category: 'Everyday objects', answer: 'Book', imageAsset: 'assets/silhouettes/book.png' },
    { category: 'Everyday objects', answer: 'Glasses', imageAsset: 'assets/silhouettes/glasses.png' },
    { category: 'Everyday objects', answer: 'Key', imageAsset: 'assets/silhouettes/key.png' },
    { category: 'Everyday objects', answer: 'Wallet', imageAsset: 'assets/silhouettes/wallet.png' },
  ];

  rounds: RoundState[] = [];
  roundIndex = 0;
  correctCount = 0;
  feedbackMessage = '';
  private feedbackTimeoutId: number | null = null;
  private roundStartedAtMs: number | null = null;
  choiceLocked = false;

  constructor(
    private router: Router,
    private firebaseService: FirebaseService,
    private alertCtrl: AlertController
  ) {}

  get currentRound(): RoundState | null {
    return this.rounds[this.roundIndex] ?? null;
  }

  get progressLabel(): string {
    const cat = this.currentRound?.item.category;
    const base = `Round ${this.roundIndex + 1} of ${this.roundCount}`;
    return cat ? `${base} · ${cat}` : base;
  }

  goBackToBrainGames() {
    void this.router.navigate(['/brain-games']);
  }

  async onBackTapped() {
    if (this.screen === 'menu') {
      this.goBackToBrainGames();
      return;
    }
    if (this.screen === 'game') {
      const alert = await this.alertCtrl.create({
        header: 'Leave this game?',
        message: 'Your progress in this round will be lost. You can play again anytime.',
        buttons: [
          { text: 'Continue playing', role: 'cancel' },
          {
            text: 'Leave',
            handler: () => {
              this.screen = 'menu';
              this.resetGameState();
            },
          },
        ],
      });
      await alert.present();
      return;
    }
    this.screen = 'menu';
    this.resetGameState();
  }

  startGame() {
    this.screen = 'game';
    this.roundIndex = 0;
    this.correctCount = 0;
    this.choiceLocked = false;
    this.roundStartedAtMs = Date.now();
    this.rounds = this.buildRounds();
    this.clearFeedback();
  }

  pickChoice(label: string) {
    if (this.screen !== 'game' || !this.currentRound || this.choiceLocked) return;
    this.choiceLocked = true;
    const ok = label === this.currentRound.correctLabel;
    if (ok) {
      this.correctCount++;
      this.setFeedback('Nice! That matches the outline.', 900);
    } else {
      this.setFeedback('Not quite — try the next one.', 900);
    }
    window.setTimeout(() => {
      this.clearFeedback();
      if (this.roundIndex >= this.rounds.length - 1) {
        this.choiceLocked = false;
        void this.finishGame();
        return;
      }
      this.roundIndex++;
      this.choiceLocked = false;
    }, ok ? 650 : 900);
  }

  playAgain() {
    this.startGame();
  }

  backToMenu() {
    this.screen = 'menu';
    this.resetGameState();
  }

  private resetGameState() {
    this.rounds = [];
    this.roundIndex = 0;
    this.correctCount = 0;
    this.roundStartedAtMs = null;
    this.choiceLocked = false;
    this.clearFeedback();
  }

  private buildRounds(): RoundState[] {
    const picked = this.shuffle([...this.itemBank]).slice(0, this.roundCount);
    return picked.map((item) => {
      const [d0, d1] = this.pickDecoys(item);
      const choices = this.shuffle([item.answer, d0, d1]);
      return { item, choices, correctLabel: item.answer };
    });
  }

  /** Prefer wrong answers from the same category (harder); otherwise any other label. */
  private pickDecoys(item: SilhouetteItem): [string, string] {
    const sameCat = this.itemBank.filter((x) => x.category === item.category && x.answer !== item.answer);
    const pool =
      sameCat.length >= 2
        ? sameCat.map((x) => x.answer)
        : this.itemBank.filter((x) => x.answer !== item.answer).map((x) => x.answer);
    const unique = this.shuffle([...new Set(pool)]);
    const decoys: string[] = [];
    for (const a of unique) {
      if (a === item.answer) continue;
      decoys.push(a);
      if (decoys.length === 2) break;
    }
    let i = 0;
    while (decoys.length < 2) {
      const fallback = this.itemBank[i++]?.answer;
      if (!fallback) break;
      if (fallback !== item.answer && !decoys.includes(fallback)) {
        decoys.push(fallback);
      }
    }
    return [decoys[0] ?? 'Chair', decoys[1] ?? 'Table'] as [string, string];
  }

  private async finishGame() {
    this.screen = 'result';
    const durationSeconds =
      this.roundStartedAtMs !== null
        ? Math.max(0, Math.round((Date.now() - this.roundStartedAtMs) / 1000))
        : 0;

    const sessionData = {
      category: 'guess-the-silhouettes',
      totalQuestions: this.roundCount,
      correctAnswers: this.correctCount,
      skipped: 0,
      totalTime: durationSeconds,
      timestamp: Date.now(),
    };

    try {
      await ProgressPage.saveGameSession(this.firebaseService, sessionData as any);
    } catch (error) {
      console.error('Error saving Guess the Silhouettes session:', error);
    }
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
    if (this.feedbackTimeoutId !== null) {
      window.clearTimeout(this.feedbackTimeoutId);
    }
    this.feedbackTimeoutId = window.setTimeout(() => {
      this.feedbackMessage = '';
      this.feedbackTimeoutId = null;
    }, clearAfterMs);
  }

  private clearFeedback() {
    this.feedbackMessage = '';
    if (this.feedbackTimeoutId !== null) {
      window.clearTimeout(this.feedbackTimeoutId);
      this.feedbackTimeoutId = null;
    }
  }
}
