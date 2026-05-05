/**
 * NAME THAT MEMORY GAME
 * 
 * This game shows a flashcard image and asks the user to identify it by name.
 * Each question provides 4 options (1 correct + 3 incorrect).
 * 
 * FLOW:
 * 1. Open the game → the category picker modal appears
 * 2. Choose a category (People/Places/Objects/Custom)
 * 3. Load cards from Firebase and local storage
 * 4. For each question: show the image + 4 shuffled options
 * 5. Answer or skip → show result → continue
 * 6. Finish → show final score and save progress
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ProgressPage } from '../progress/progress.page';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Category can be built-in (people/places/objects) or a custom category name */
type Category = 'people' | 'places' | 'objects' | string;

/** Raw card shape from local storage (supports legacy field names) */
interface RawCard {
  id?: string;
  label?: string;
  name?: string;
  image?: string;
  photo?: string;
  photoUrl?: string;
  imagePath?: string;
  category?: string;
}

/** Normalized game card used by the gameplay logic */
interface GameCard {
  id?: string;
  label: string;    // The answer/label for this card
  image: string;    // Image URL or base64
  audio?: string | null;
  duration?: number;
  category: Category;
}

/** Custom category shape stored in local storage */
interface CustomCategory {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  createdAt?: number;
}

/** Raw custom card stored in local storage */
interface RawCustomCard {
  id: string;
  categoryId: string;
  type: 'photo' | 'video' | 'manual';
  src: string;
  label?: string;
  audio?: string | null;
  duration?: number;
  createdAt?: number;
}

/** The selected category filter (built-in or custom) */
type Selection =
  | { type: 'builtin'; value: 'people' | 'places' | 'objects' }
  | { type: 'custom'; value: string };

// Local storage keys for custom categories
const CATEGORIES_KEY = 'alala_custom_categories_v1';
const CARDS_PREFIX = 'alala_cards_';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

@Component({
  selector: 'app-name-that-memory',
  templateUrl: './name-that-memory.page.html',
  styleUrls: ['./name-that-memory.page.scss'],
  standalone: false,
})
export class NameThatMemoryPage implements OnInit, OnDestroy {
  
  // ─────────────────────────────────────────────────────────────────────────────
  // UI STATE
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Whether patient mode is enabled (hides some controls) */
  isPatientMode = false;
  
  /** List of user-created custom categories */
  userCategories: CustomCategory[] = [];
  
  /** Currently selected category filter (null if none selected yet) */
  selectedFilter: Selection | null = null;

  // ─────────────────────────────────────────────────────────────────────────────
  // CARD COUNTS (for the category picker UI)
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Card counts per category */
  counts: {
    people: number;
    places: number;
    objects: number;
    custom: Record<string, number>;
  } = { people: 0, places: 0, objects: 0, custom: {} };

  // ─────────────────────────────────────────────────────────────────────────────
  // GAME DATA
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** All cards loaded for the selected category */
  allCards: GameCard[] = [];
  
  /** Filtered/deduplicated cards used by the game */
  gameCards: GameCard[] = [];
  
  /** Cards received from Firebase */
  private firebaseCards: GameCard[] = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // CURRENT QUESTION STATE
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** The card shown for the current question */
  currentCard: GameCard | null = null;
  
  /** 4 answer options (shuffled, includes the correct answer) */
  options: string[] = [];
  
  /** Current question number (starts at 1) */
  currentQuestion = 0;
  
  /** Total questions in this game session */
  totalQuestions = 10;
  
  /** Number of correct answers */
  correctAnswers = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // RESULT/COMPLETION STATE
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Whether to show the result panel (correct/incorrect) */
  showResult = false;
  
  /** Whether the last answer was correct */
  isCorrect = false;
  
  /** Whether to show the game-complete modal */
  showGameComplete = false;
  
  /** Flag to complete the game after showing the result */
  private shouldCompleteAfterResult = false;

  // ─────────────────────────────────────────────────────────────────────────────
  // SKIP TRACKING
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Number of skipped questions */
  skipCount = 0;
  
  /** IDs of skipped cards */
  skippedCardIds: string[] = [];
  
  /** Labels that have already been asked (to reduce repeats) */
  private askedLabels = new Set<string>();
  
  /** Timestamp when the game started (for duration tracking) */
  private gameStartTime = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // SUBSCRIPTIONS & TIMERS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Firebase subscription cleanup function */
  private flashcardsUnsub?: any;

  // ─────────────────────────────────────────────────────────────────────────────
  // FALLBACK NAMES (used when there aren't enough distinct wrong answers)
  // ─────────────────────────────────────────────────────────────────────────────
  
  private readonly DEFAULT_NAMES = [
    'Aurelia', 'Thaddeus', 'Isolde', 'Cassian', 'Mirella',
    'Osric', 'Linnea', 'Percival', 'Elowen', 'Soren',
    'Calliope', 'Evander', 'Brielle', 'Lucian', 'Marisol'
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private firebaseService: FirebaseService
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════════
  // LIFECYCLE HOOKS
  // ═══════════════════════════════════════════════════════════════════════════════

  ngOnInit() {
    this.loadPatientModeFromStorage();
    this.userCategories = this.getAllUserCategories();
    this.attachFirebaseFlashcards();

    const qp = this.route.snapshot.queryParamMap;
    const legacy = qp.get('category');
    const hasBuiltin =
      qp.get('builtin') === 'people' ||
      qp.get('builtin') === 'places' ||
      qp.get('builtin') === 'objects' ||
      legacy === 'people' ||
      legacy === 'places' ||
      legacy === 'objects';
    const hasCustom = !!qp.get('custom');
    if (!hasBuiltin && !hasCustom) {
      void this.router.navigate(['/brain-game-category', 'name-that-memory'], { replaceUrl: true });
      return;
    }

    void this.primeFromFirebaseOnce().then(() => {
      this.computeCounts();
      this.applyRouteSelectionFromParams();
    });

    window.addEventListener('card-deleted', () => {
      this.computeCounts();
    });
  }

  ionViewWillEnter() {
    this.userCategories = this.getAllUserCategories();
    this.computeCounts();
  }

  ngOnDestroy() {
    try { this.flashcardsUnsub?.(); } catch {}
    window.removeEventListener('card-deleted', () => {});
  }

  /** Apply ?builtin= / ?custom= / legacy ?category= after Firebase prime. */
  private applyRouteSelectionFromParams(): void {
    const qp = this.route.snapshot.queryParamMap;
    const legacy = qp.get('category');
    const builtinRaw =
      qp.get('builtin') ||
      (legacy === 'people' || legacy === 'places' || legacy === 'objects' ? legacy : null);
    const custom = qp.get('custom');
    if (builtinRaw === 'people' || builtinRaw === 'places' || builtinRaw === 'objects') {
      this.selectedFilter = { type: 'builtin', value: builtinRaw };
      this.setupNewRun();
    } else if (custom) {
      this.selectedFilter = { type: 'custom', value: custom };
      this.setupNewRun();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PATIENT MODE
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Toggle patient mode on/off */
  togglePatientMode() {
    this.isPatientMode = !this.isPatientMode;
    try { 
      localStorage.setItem('patientMode', JSON.stringify(this.isPatientMode)); 
    } catch {}
  }

  /** Load patient mode from local storage */
  private loadPatientModeFromStorage() {
    try {
      const raw = localStorage.getItem('patientMode');
      this.isPatientMode = raw ? JSON.parse(raw) : false;
    } catch { 
      this.isPatientMode = false; 
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GAME SETUP
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Initialize a new game run using the selected category.
   * - Loads cards from Firebase/local storage
   * - Filters and deduplicates cards
   * - Resets all game state
   * - Starts the first question
   */
  private setupNewRun() {
    if (!this.selectedFilter) {
      void this.router.navigate(['/brain-game-category', 'name-that-memory']);
      return;
    }

    // Load all cards for the selected category
    this.allCards = this.loadCardsByFilter(this.selectedFilter);

    // Remove duplicate cards (same label + image)
    const seen = new Set<string>();
    this.gameCards = this.allCards.filter(c => {
      const key = `${c.category}::${(c.label || '').toLowerCase()}::${c.image}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return !!c.label && !!c.image; // Require label and image
    });

    // Set total questions (max 10, bounded by unique labels)
    const uniqueCount = new Set(this.gameCards.map(c => c.label.toLowerCase())).size;
    this.totalQuestions = Math.min(10, Math.max(uniqueCount, 0));

    // Reset all game state
    this.currentCard = null;
    this.options = [];
    this.currentQuestion = 0;
    this.correctAnswers = 0;
    this.skipCount = 0;
    this.skippedCardIds = [];
    this.showResult = false;
    this.isCorrect = false;
    this.showGameComplete = false;
    this.shouldCompleteAfterResult = false;
    this.askedLabels.clear();
    this.gameStartTime = Date.now();

    // Start the game if there are cards
    if (this.gameCards.length > 0 && this.totalQuestions > 0) {
      this.startNewQuestion();
    }
  }

  /**
   * Load cards based on the selected filter.
   * - Built-in: load from Firebase or fall back to local storage
   * - Custom: load from local storage
   */
  private loadCardsByFilter(filter: Selection): GameCard[] {
    // Helper to get Firebase cards for a built-in category
    const byCat = (cat: 'people' | 'places' | 'objects') => 
      this.firebaseCards.filter(c => c.category === cat);
    
    // Read cards for each built-in category (Firebase first, local fallback)
    const people = byCat('people').length > 0 ? byCat('people') : this.readCardsWithFallbacks('people');
    const places = byCat('places').length > 0 ? byCat('places') : this.readCardsWithFallbacks('places');
    const objects = byCat('objects').length > 0 ? byCat('objects') : this.readCardsWithFallbacks('objects');

    // Return cards for the selected built-in category
    if (filter.type === 'builtin') {
      const map: Record<'people' | 'places' | 'objects', GameCard[]> = { people, places, objects };
      return map[filter.value].map(c => ({ ...c, category: filter.value }));
    }

    // Return cards for the selected custom category
    if (filter.type === 'custom') {
      const id = filter.value;
      const cats = this.getAllUserCategories();
      const cat = cats.find(c => c.id === id);
      if (!cat) return [];
      
      // Load and filter custom cards (photos only)
      const raw = this.readCustomCards(id).filter(c => c.type === 'photo');
      return raw
        .filter(r => !!r.label && !!r.src)
        .map(r => ({
          id: r.id,
          label: (r.label || 'Untitled').toString().trim(),
          image: (r.src || '').toString().trim(),
          audio: (r as any).audio || null,
          duration: (r as any).duration || 0,
          category: (cat.name || 'custom').toString().trim().toLowerCase()
        }));
    }

    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FIREBASE DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Mag-subscribe sa Firebase flashcards para real-time updates */
  private attachFirebaseFlashcards() {
    try {
      this.flashcardsUnsub?.();
      
      this.flashcardsUnsub = (this.firebaseService as any).subscribeToGameFlashcards?.((cards: any[]) => {
        // Deduplicate and normalize the cards
        const seen = new Set<string>();
        this.firebaseCards = (cards || [])
          .map((c: any) => ({
            id: c.id,
            label: (c.label || '').toString().trim(),
            image: (c.image || c.src || '').toString().trim(),
            audio: c.audio || null,
            duration: c.duration || 0,
            category: (c.category || '').toString().trim().toLowerCase() as Category
          }))
          .filter(c => !!c.label && !!c.image)
          .filter(c => {
            const k = `${c.category}::${c.label.toLowerCase()}::${c.image}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });

        // I-cache locally para offline use
        this.cacheGameCardsLocally(this.firebaseCards);
        
        // Update counts
        this.computeCounts();
        
        // Refresh the game if a category is already selected
        if (this.selectedFilter) this.setupNewRun();
      });
    } catch (e) {
      console.error('Failed to attach Firebase flashcards:', e);
    }
  }

  /** Fetch cards from Firebase once (initial load) */
  private async primeFromFirebaseOnce() {
    try {
      const initial = await (this.firebaseService as any).getGameFlashcardsOnce?.();
      if (Array.isArray(initial) && initial.length > 0) {
        this.firebaseCards = initial.map((c: any) => ({
          id: c.id,
          label: c.label,
          image: c.image,
          category: (c.category || '').toString().trim().toLowerCase() as Category
        }));
      } else {
        // Fallback sa cached cards
        const cached = (this.firebaseService as any).getCachedGameFlashcards?.() || [];
        if (cached.length > 0) {
          this.firebaseCards = cached.map((c: any) => ({
            id: c.id,
            label: c.label,
            image: c.image,
            category: (c.category || '').toString().trim().toLowerCase() as Category
          }));
        }
      }
    } catch {}
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LOCAL STORAGE DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Read cards from local storage using multiple key fallbacks.
   * This supports legacy naming conventions used in older versions.
   */
  private readCardsWithFallbacks(category: Category): GameCard[] {
    const keys = this.buildKeyCandidates(category);
    const result: GameCard[] = [];
    const seen = new Set<string>();

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      let arr: RawCard[] = [];
      try { arr = JSON.parse(raw); } catch { arr = []; }
      if (!Array.isArray(arr)) continue;

      for (const r of arr) {
        const card = this.normalizeCard(r, category);
        if (!card.label || !card.image) continue;
        
        // Mag-deduplicate
        const k = `${card.label.toLowerCase()}::${card.image}`;
        if (seen.has(k)) continue;
        seen.add(k);
        result.push(card);
      }
    }
    return result;
  }

  /** Maghimo ug possible local storage keys para sa category */
  private buildKeyCandidates(cat: string): string[] {
    const singular = cat.endsWith('s') ? cat.slice(0, -1) : cat;
    return [
      `${cat}Cards`, `${singular}Cards`,
      cat, `${cat}_cards`, `${singular}_cards`,
      `${cat}List`, `${singular}List`,
    ];
  }

  /** Mag-normalize sa raw card data ngadto sa GameCard format */
  private normalizeCard(r: RawCard, category: Category): GameCard {
    const label = (r.label || r.name || '').toString().trim();
    const image = (r.image ?? r.photoUrl ?? r.photo ?? r.imagePath ?? '').toString();
    const audio = (r as any).audio || null;
    const duration = (r as any).duration || 0;
    return { id: r.id, label, image, audio, duration, category };
  }

  /** Get all custom categories from local storage */
  private getAllUserCategories(): CustomCategory[] {
    try {
      const user = this.firebaseService.getCurrentUser();
      const userSpecificKey = user ? `${CATEGORIES_KEY}_${user.uid}` : CATEGORIES_KEY;
      const raw = localStorage.getItem(userSpecificKey);
      const arr = raw ? (JSON.parse(raw) as CustomCategory[]) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { 
      return []; 
    }
  }

  /** Mag-read ug cards para sa specific custom category */
  private readCustomCards(categoryId: string): RawCustomCard[] {
    try {
      const raw = localStorage.getItem(`${CARDS_PREFIX}${categoryId}`);
      return raw ? (JSON.parse(raw) as RawCustomCard[]) : [];
    } catch { 
      return []; 
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // QUESTION GENERATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Mag-generate ug bag-o nga pangutana
   * - Magpili ug random unasked card
   * - Maghimo ug 4 ka answer options (1 sakto + 3 sayop)
   * - Shuffles options randomly
   */
  private startNewQuestion() {
    // End the game if needed
    if (this.currentQuestion >= this.totalQuestions || this.gameCards.length === 0) {
      this.endGame();
      return;
    }

    this.currentQuestion += 1;

    // Pick a random card that hasn't been asked yet
    const pool = this.gameCards.filter(c => !this.askedLabels.has(c.label));
    const base = pool.length ? pool : this.gameCards;
    const card = base[Math.floor(Math.random() * base.length)];
    this.askedLabels.add(card.label);
    this.currentCard = card;

    // Maghimo ug sayop nga answer options
    const correct = card.label;
    const allOtherLabels = this.gameCards
      .filter(c => c.label !== correct)
      .map(c => c.label);

    // Filter out labels that are too similar to the correct answer
    const filtered = allOtherLabels.filter(l => !this.isSimilar(l, correct));
    const poolNames = this.shuffle([...filtered]);

    // Add fallback names if we don't have enough wrong answers
    const userAllLabels = new Set(this.gameCards.map(c => this.normalizeToken(c.label)));
    const defaultFillers = this.DEFAULT_NAMES
      .filter(n => !this.isSimilarToAny(n, userAllLabels))
      .filter(n => !this.isSimilar(n, correct));
    
    while (poolNames.length < 3 && defaultFillers.length > 0) {
      poolNames.push(defaultFillers.shift()!);
    }

    // Maghimo ug mag-shuffle sa final options
    const four = [correct, ...poolNames.slice(0, 3)];
    this.options = this.shuffle(four);
    
    // Reset result state
    this.showResult = false;
    this.isCorrect = false;
    this.shouldCompleteAfterResult = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ANSWER HANDLING
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Handle when the user selects an answer */
  selectAnswer(choice: string) {
    if (!this.currentCard) return;
    
    const correct = this.currentCard.label;
    
    // Check correctness (exact match or similar)
    this.isCorrect = this.isSimilar(choice, correct) || choice === correct;
    if (this.isCorrect) this.correctAnswers++;

    // Check whether this is the last question
    this.shouldCompleteAfterResult = (this.currentQuestion >= this.totalQuestions);
    this.showResult = true;
  }

  /** Handle when the user skips the current question */
  skipCurrent() {
    if (!this.currentCard) return;
    
    this.skipCount++;
    if (this.currentCard.id) this.skippedCardIds.push(this.currentCard.id);

    // Continue to the next question or end the game
    if (this.currentQuestion >= this.totalQuestions) {
      this.endGame();
    } else {
      this.startNewQuestion();
    }
  }

  /** Continue to the next question after showing the result */
  continueGame() {
    this.showResult = false;

    if (this.shouldCompleteAfterResult || this.currentQuestion >= this.totalQuestions) {
      this.shouldCompleteAfterResult = false;
      this.endGame();
    } else {
      this.startNewQuestion();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GAME COMPLETION
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Get the name of the currently selected category */
  private getCategoryName(): string {
    if (!this.selectedFilter) return 'unknown';
    if (this.selectedFilter.type === 'builtin') {
      return this.selectedFilter.value;
    } else {
      const customCategory = this.userCategories.find(c => c.id === this.selectedFilter!.value);
      return customCategory ? customCategory.name.toLowerCase() : 'custom';
    }
  }

  /** End the game and save progress */
  async endGame() {
    // Compute total game time
    const totalTimeSeconds = this.gameStartTime > 0 
      ? Math.round((Date.now() - this.gameStartTime) / 1000) 
      : 0;

    // Prepare session data for progress tracking
    const sessionData = {
      category: this.getCategoryName(),
      totalQuestions: this.totalQuestions,
      correctAnswers: this.correctAnswers,
      skipped: this.skipCount,
      totalTime: totalTimeSeconds,
      timestamp: Date.now()
    };

    // I-save sa Firebase progress
    try {
      await ProgressPage.saveGameSession(
        this.firebaseService, 
        sessionData, 
        (window as any).progressPageInstance
      );
    } catch (error) {
      console.error('Error saving Name That Memory session:', error);
    }

    // I-save sad sa local storage history
    try {
      const key = 'nameThatMemoryHistory';
      const history: any[] = JSON.parse(localStorage.getItem(key) || '[]');
      history.push({
        endedAt: new Date().toISOString(),
        totalQuestions: this.totalQuestions,
        correctAnswers: this.correctAnswers,
        skipCount: this.skipCount,
        skippedCardIds: this.skippedCardIds,
        filter: this.selectedFilter
      });
      localStorage.setItem(key, JSON.stringify(history));
    } catch {}

    // Show completion modal
    this.showResult = false;
    this.showGameComplete = true;
  }

  /** Close the game complete modal and navigate Home */
  finishGame() {
    this.showGameComplete = false;
    this.showResult = false;
    this.shouldCompleteAfterResult = false;
    void this.router.navigate(['/brain-games']);
  }

  /** Mag-navigate sa add flashcard page */
  goToAddFlashcard() {
    const filter = this.selectedFilter;

    if (filter && filter.type === 'builtin') {
      this.router.navigate(['/add-flashcard'], {
        queryParams: { defaultCategory: filter.value }
      });
      return;
    }

    if (filter && filter.type === 'custom') {
      const cat = this.userCategories.find(c => c.id === filter.value);
      this.router.navigate(['/add-flashcard'], {
        state: {
          defaultCategoryId: filter.value,
          defaultCategoryName: cat?.name ?? null
        }
      });
      return;
    }

    this.router.navigate(['/add-flashcard']);
  }

  /** Restart the game using the same category */
  playAgain() {
    this.setupNewRun();
  }

  /** Mag-navigate balik sa home */
  goBack() {
    void this.router.navigate(['/brain-games']);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PROGRESS TRACKING
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Get how many questions have been answered so far */
  private getAnsweredCount(): number {
    if (this.totalQuestions <= 0) return 0;
    if (this.showGameComplete) return this.totalQuestions;
    if (this.showResult) return this.currentQuestion;
    return Math.max(0, this.currentQuestion - 1);
  }

  /** Progress bar percentage (0-100) */
  get progressPct(): number {
    if (this.totalQuestions <= 0) return 0;
    const pct = (this.getAnsweredCount() / this.totalQuestions) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Get the image source for the card */
  imgSrc(card: GameCard | null): string {
    return card?.image || '';
  }

  /** Fisher-Yates shuffle algorithm */
  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Mag-normalize sa string para comparison (lowercase, walay diacritics, alphanumeric lang) */
  private normalizeToken(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /** Compare two strings for answer matching */
  private isSimilar(a: string, b: string): boolean {
    const na = this.normalizeToken(a);
    const nb = this.normalizeToken(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    
    // Substring similarity check
    if (na.includes(nb) || nb.includes(na)) {
      if (Math.abs(na.length - nb.length) <= 2) return true;
    }
    
    // Levenshtein distance check
    const d = this.levenshtein(na, nb);
    if (Math.max(na.length, nb.length) <= 5) return d <= 1;
    return d <= 2;
  }

  /** Check whether a name is similar to any entry in the set */
  private isSimilarToAny(name: string, normalizedUserSet: Set<string>): boolean {
    const n = this.normalizeToken(name);
    if (normalizedUserSet.has(n)) return true;
    
    for (const u of normalizedUserSet) {
      const d = this.levenshtein(n, u);
      if (Math.max(n.length, u.length) <= 5 ? d <= 1 : d <= 2) return true;
      if (n.includes(u) || u.includes(n)) {
        if (Math.abs(n.length - u.length) <= 2) return true;
      }
    }
    return false;
  }

  /** Compute Levenshtein distance between two strings */
  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    
    const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + cost // substitution
        );
      }
    }
    return dp[m][n];
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CARD COUNT COMPUTATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Mag-compute ug card counts para sa tanan nga categories (gamiton sa category picker) */
  private computeCounts() {
    // Read cards from Firebase
    const firebasePeople = this.firebaseCards.filter(c => c.category === 'people');
    const firebasePlaces = this.firebaseCards.filter(c => c.category === 'places');
    const firebaseObjects = this.firebaseCards.filter(c => c.category === 'objects');

    // Read cards from local storage
    const localPeople = this.readCardsWithFallbacks('people');
    const localPlaces = this.readCardsWithFallbacks('places');
    const localObjects = this.readCardsWithFallbacks('objects');

    // Merge and deduplicate counts
    const mergeCounts = (firebase: GameCard[], local: GameCard[]) => {
      const seen = new Set<string>();
      const all = [...firebase, ...local];
      return all.filter(c => {
        const key = `${c.category}::${(c.label || '').toLowerCase()}::${c.image}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).length;
    };

    // Count custom-category cards
    const customCounts: Record<string, number> = {};
    const cats = this.getAllUserCategories();
    for (const c of cats) {
      const list = this.readCustomCards(c.id).filter(r => r.type === 'photo' && r.label && r.src);
      customCounts[c.id] = list.length;
    }

    this.counts = {
      people: mergeCounts(firebasePeople, localPeople),
      places: mergeCounts(firebasePlaces, localPlaces),
      objects: mergeCounts(firebaseObjects, localObjects),
      custom: customCounts
    };
  }

  /** Cache game cards locally for offline access */
  private cacheGameCardsLocally(cards: GameCard[]) {
    try {
      const user = this.firebaseService.getCurrentUser();
      const uid = user ? user.uid : 'anon';
      const cacheKey = `nameThatMemoryCache_${uid}`;
      localStorage.setItem(cacheKey, JSON.stringify(cards));
    } catch (e) {
      console.warn('Failed to cache game cards locally:', e);
    }
  }

  /** Get the appropriate icon for a custom category */
  getCategoryIcon(category: CustomCategory): string {
    const iconMap: { [key: string]: string } = {
      'people': 'people-outline',
      'places': 'location-outline',
      'objects': 'cube-outline',
      'default': 'grid-outline'
    };

    // Mag-map ug emojis to icons
    if (category.emoji) {
      const emojiToIcon: { [key: string]: string } = {
        '👥': 'people-outline',
        '🏠': 'home-outline',
        '📍': 'location-outline',
        '📦': 'cube-outline',
        '⭐': 'star-outline',
        '❤️': 'heart-outline',
        '🎯': 'target-outline',
        '🎨': 'color-palette-outline',
        '🎵': 'musical-notes-outline',
        '🍎': 'nutrition-outline',
        '🚗': 'car-outline',
        '📚': 'library-outline',
        '🎮': 'game-controller-outline',
        '🏆': 'trophy-outline',
        '💎': 'diamond-outline',
        '🎪': 'color-wand-outline'
      };
      return emojiToIcon[category.emoji] || iconMap[category.name?.toLowerCase()] || iconMap['default'];
    }

    return iconMap[category.name?.toLowerCase()] || iconMap['default'];
  }
}
