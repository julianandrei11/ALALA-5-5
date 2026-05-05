/**
 * CATEGORY MATCH GAME
 * 
 * This game shows a flashcard image and asks the user to identify its category.
 * Each question provides 4 category options (1 correct + 3 incorrect).
 * 
 * FLOW:
 * 1. Open the game → the category picker modal appears
 * 2. Choose a category (People/Places/Objects/Custom)
 * 3. Load cards from Firebase and local storage
 * 4. For each question: show the image + 4 shuffled category options
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

/** Category is stored as a plain string */
type Category = string;

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
  label: string;      // Card label/answer
  image: string;      // Image URL or base64
  audio?: string | null;
  duration?: number;
  category: Category; // Card category
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

// Local storage keys for custom categories
const CATEGORIES_KEY = 'alala_custom_categories_v1';
const CARDS_PREFIX = 'alala_cards_';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

@Component({
  selector: 'app-category-match',
  templateUrl: './category-match.page.html',
  styleUrls: ['./category-match.page.scss'],
  standalone: false,
})
export class CategoryMatchPage implements OnInit, OnDestroy {
  
  // ─────────────────────────────────────────────────────────────────────────────
  // UI STATE
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Whether patient mode is enabled (hides some controls) */
  isPatientMode = false;
  
  /** List of user-created custom categories */
  userCategories: CustomCategory[] = [];
  
  /** Currently selected category filter */
  selectedFilter: { type: 'builtin' | 'custom'; value: string } | null = null;

  // ─────────────────────────────────────────────────────────────────────────────
  // CARD COUNTS (for the category picker UI)
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Card counts per category */
  counts: { 
    people: number; 
    places: number; 
    objects: number; 
    custom: Record<string, number> 
  } = { people: 0, places: 0, objects: 0, custom: {} };

  // ─────────────────────────────────────────────────────────────────────────────
  // GAME DATA
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** All cards available for the game */
  gameCards: GameCard[] = [];
  
  /** Tanan nga available nga categories */
  allCategories: string[] = [];
  
  /** Cards received from Firebase */
  private firebaseCards: GameCard[] = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // CURRENT QUESTION STATE
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** The card shown for the current question */
  currentCard: GameCard | null = null;
  
  /** 4 category options (shuffled, includes the correct answer) */
  options: string[] = [];
  
  /** Karon nga pangutana number (nagsugod sa 1) */
  currentQuestion = 0;
  
  /** Total questions in this game session */
  totalQuestions = 10;
  
  /** Pila na ka sakto nga tubag */
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
  
  /** Mga ID sa gi-skip nga cards */
  skippedCardIds: string[] = [];
  
  /** Mga labels nga na-pangutana na (para di mausab) */
  private askedLabels = new Set<string>();

  // ─────────────────────────────────────────────────────────────────────────────
  // DEFAULT CATEGORIES (fallback when there aren't enough categories)
  // ─────────────────────────────────────────────────────────────────────────────
  
  private readonly DEFAULT_CATEGORIES = ['People', 'Places', 'Objects', 'Events'];

  /** Firebase subscription cleanup function */
  private gcUnsub?: any;

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
    this.attachFirebaseFlashcards();
    this.loadUserCategories();

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
      void this.router.navigate(['/brain-game-category', 'category-match'], { replaceUrl: true });
      return;
    }

    void this.primeFromFirebaseOnce().then(() => {
      this.computeCounts();
      this.applyRouteSelectionFromParams();
    });
  }

  ngOnDestroy(): void {
    try { this.gcUnsub?.(); } catch {}
  }

  ionViewWillEnter() {
    this.loadUserCategories();
    this.computeCounts();
  }

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

  /** Load user categories from local storage */
  private loadUserCategories() {
    try {
      const user = this.firebaseService.getCurrentUser();
      const userSpecificKey = user ? `${CATEGORIES_KEY}_${user.uid}` : CATEGORIES_KEY;
      const raw = localStorage.getItem(userSpecificKey);
      this.userCategories = raw ? JSON.parse(raw) as CustomCategory[] : [];
    } catch { 
      this.userCategories = []; 
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GAME SETUP
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Mag-initialize ug bag-o nga game run
   * - Mag-load ug tanan nga cards
   * - Mag-filter base sa gipili nga category
   * - Mag-reset sa tanan nga game state
   * - Starts the first question
   */
  private setupNewRun() {
    if (!this.selectedFilter) {
      void this.router.navigate(['/brain-game-category', 'category-match']);
      return;
    }

    // Load all cards and categories
    this.loadAllCardsAndCategories();
    
    // Filter cards based on the selection
    this.filterCardsBySelection();

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

    // Start the game if there are cards
    if (this.gameCards.length > 0 && this.totalQuestions > 0) {
      this.startNewQuestion();
    }
  }

  /** Filter cards based on the selected category */
  private filterCardsBySelection() {
    if (!this.selectedFilter) return;
    
    if (this.selectedFilter.type === 'builtin') {
      // Para sa builtin categories, i-filter base sa normalized category
      const cat = this.selectedFilter.value;
      this.gameCards = this.gameCards.filter(c => 
        this.normalizeCategoryForStorage(c.category) === cat
      );
    } else if (this.selectedFilter.type === 'custom') {
      // For custom categories, load cards from local storage
      const categoryId = this.selectedFilter.value;
      const customCards = this.readCustomCards(categoryId);
      const catName = this.userCategories.find(uc => uc.id === categoryId)?.name || categoryId;
      
      this.gameCards = customCards
        .filter(c => c.label && c.src)
        .map(c => ({
          id: c.id,
          label: c.label || '',
          image: c.src,
          audio: c.audio || null,
          duration: c.duration || 0,
          category: catName
        }));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FIREBASE DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Mag-subscribe sa Firebase flashcards para real-time updates */
  private attachFirebaseFlashcards() {
    try {
      this.gcUnsub?.();
      
      this.gcUnsub = this.firebaseService.subscribeToGameFlashcards((cards) => {
        // Mag-map sa Firebase cards ngadto sa GameCard format
        this.firebaseCards = (cards || []).map((c: any) => ({
          id: c.id,
          label: c.label,
          image: c.image || c.src || '',
          category: (c.category || '').toString()
        }));
        
        // I-cache locally para offline use
        this.cacheGameCardsLocally(this.firebaseCards);
        
        // Refresh the card list
        this.loadAllCardsAndCategories();
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
        this.firebaseCards = initial as any;
      } else {
        // Fallback sa cached cards
        const cached = (this.firebaseService as any).getCachedGameFlashcards?.() || [];
        if (cached.length > 0) {
          this.firebaseCards = cached as any;
        }
      }
    } catch {}
    this.setupNewRun();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CARD LOADING (Local Storage + Firebase)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Mag-load ug tanan nga cards ug categories
   * - Merges Firebase cards and local storage cards
   * - Deduplicates
   * - Builds the allCategories list
   */
  private loadAllCardsAndCategories() {
    // Start with Firebase cards
    let merged: GameCard[] = this.firebaseCards.slice();
    const seen = new Set<string>(merged.map(c => `${c.label.toLowerCase()}::${c.image}::${c.category}`));

    // Mga possible local storage keys nga i-scan
    const keysToScan = [
      // People
      'peopleCards', 'personCards', 'people', 'people_cards', 'person_cards', 'peopleList', 'personList',
      // Places
      'placesCards', 'placeCards', 'places', 'places_cards', 'place_cards', 'placesList', 'placeList',
      // Objects
      'objectsCards', 'objectCards', 'objects', 'objects_cards', 'object_cards', 'objectsList', 'objectList',
      // Generic
      'cards', 'memories', 'memoryCards'
    ];

    // Helper function para mu-add ug card
    const pushCard = (r: RawCard, fallbackCategory: string | null) => {
      const label = (r.label || r.name || '').toString().trim();
      const image = (r.image ?? r.photoUrl ?? r.photo ?? r.imagePath ?? '').toString();
      const rawCat = (r.category ?? fallbackCategory ?? '').toString().trim();
      const cat = this.normalizeCategoryForStorage(rawCat) || 'uncategorized';
      if (!label) return;
      
      // Skip duplicates
      const key = `${label.toLowerCase()}::${image}::${cat}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ id: r.id, label, image, category: cat });
    };

    // Mag-scan sa tanan nga local storage keys
    for (const key of keysToScan) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      
      let arr: RawCard[] = [];
      try { arr = JSON.parse(raw); } catch { arr = []; }
      if (!Array.isArray(arr)) continue;

      // Determine fallback category based on the key name
      let fallback: string | null = null;
      if (/people|person/i.test(key)) fallback = 'people';
      else if (/place/i.test(key)) fallback = 'places';
      else if (/object/i.test(key)) fallback = 'objects';

      for (const r of arr) pushCard(r, fallback);
    }

    // Mag-load ug custom category cards
    const { cards: customCards, categories: customDisplayCats } = this.loadCustomGameCardsAndCats();
    for (const c of customCards) {
      const key = `${c.label.toLowerCase()}::${c.image}::${c.category}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(c);
      }
    }

    this.gameCards = merged;

    // Build the allCategories list (used for wrong-answer options)
    const userCats = Array.from(
      new Set(
        merged.map(c => this.displayCategory(c.category)).filter(Boolean)
      )
    );
    const mergedCats = Array.from(new Set([
      ...userCats,
      ...customDisplayCats,
      ...this.DEFAULT_CATEGORIES
    ]));
    this.allCategories = mergedCats.slice(0);
  }

  /** Compute card counts for all categories */
  private computeCounts() {
    this.loadAllCardsAndCategories();
    this.counts = { people: 0, places: 0, objects: 0, custom: {} };
    
    // Count built-in categories
    for (const c of this.gameCards) {
      const norm = this.normalizeCategoryForStorage(c.category);
      if (norm === 'people') this.counts.people++;
      else if (norm === 'places') this.counts.places++;
      else if (norm === 'objects') this.counts.objects++;
    }
    
    // Count custom categories
    for (const cat of this.userCategories) {
      const cards = this.readCustomCards(cat.id);
      this.counts.custom[cat.id] = cards.length;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LOCAL STORAGE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Get all custom categories from local storage */
  private getAllUserCategories(): CustomCategory[] {
    try {
      const user = this.firebaseService.getCurrentUser();
      const userSpecificKey = user ? `${CATEGORIES_KEY}_${user.uid}` : CATEGORIES_KEY;
      const raw = localStorage.getItem(userSpecificKey);
      const arr = raw ? JSON.parse(raw) as CustomCategory[] : [];
      return Array.isArray(arr) ? arr : [];
    } catch { 
      return []; 
    }
  }

  /** Mag-read ug cards para sa specific custom category */
  private readCustomCards(categoryId: string): RawCustomCard[] {
    try {
      const raw = localStorage.getItem(`${CARDS_PREFIX}${categoryId}`);
      return raw ? JSON.parse(raw) as RawCustomCard[] : [];
    } catch { 
      return []; 
    }
  }

  /**
   * Mag-load ug custom game cards ug categories
   * Returns: cards array ug categories array
   */
  private loadCustomGameCardsAndCats(): { cards: GameCard[]; categories: string[] } {
    const cats = this.getAllUserCategories();
    if (cats.length === 0) return { cards: [], categories: [] };

    const cards: GameCard[] = [];
    const categories = new Set<string>();

    for (const cat of cats) {
      const display = this.displayCategory(cat.name || 'Custom');
      categories.add(display);

      // Load and filter custom cards (photos only)
      const raw = this.readCustomCards(cat.id).filter(c => c.type === 'photo');

      for (const r of raw) {
        const label = (r.label || 'Untitled').toString().trim();
        const image = (r.src || '').toString().trim();
        if (!label || !image) continue;

        const norm = this.normalizeCategoryForStorage(cat.name || 'custom');
        cards.push({
          id: r.id,
          label,
          image,
          audio: r.audio || null,
          duration: r.duration || 0,
          category: norm
        });
      }
    }

    return { cards, categories: Array.from(categories) };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CATEGORY HELPERS
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Format a category for display (capitalize words) */
  private displayCategory(cat: string): string {
    const cleaned = (cat || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    if (!cleaned) return 'Uncategorized';
    return cleaned.replace(/\b\w/g, m => m.toUpperCase());
  }

  /** Normalize a category for storage (lowercase, alphanumeric) */
  private normalizeCategoryForStorage(cat: string): string {
    return (cat || '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // QUESTION GENERATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Mag-generate ug bag-o nga pangutana
   * - Magpili ug random unasked card
   * - Maghimo ug 4 ka category options (1 sakto + 3 sayop)
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
    const card = (pool.length ? pool : this.gameCards)[
      Math.floor(Math.random() * (pool.length ? pool.length : this.gameCards.length))
    ];
    this.askedLabels.add(card.label);
    this.currentCard = card;

    // Maghimo ug sayop nga category options
    const correctDisplay = this.displayCategory(card.category);
    const otherCats = this.allCategories.filter(c => 
      this.normalizeToken(c) !== this.normalizeToken(correctDisplay)
    );

    // Filter out categories that are too similar to the correct one
    const filtered = otherCats.filter(c => !this.isSimilar(c, correctDisplay));
    const poolCats = this.shuffle([...filtered]);

    // Add default categories if we don't have enough distractors
    const defaultFillers = this.DEFAULT_CATEGORIES
      .filter(dc => this.normalizeToken(dc) !== this.normalizeToken(correctDisplay))
      .filter(dc => !this.isSimilar(dc, correctDisplay));
    while (poolCats.length < 3 && defaultFillers.length > 0) {
      const next = defaultFillers.shift()!;
      if (!poolCats.some(x => this.normalizeToken(x) === this.normalizeToken(next))) {
        poolCats.push(next);
      }
    }

    // Maghimo ug mag-shuffle sa final options
    const four = [correctDisplay, ...poolCats.slice(0, 3)];
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
    
    const correctDisplay = this.displayCategory(this.currentCard.category);
    
    // Check whether the answer is correct
    this.isCorrect = this.isSimilar(choice, correctDisplay) || 
                     this.normalizeToken(choice) === this.normalizeToken(correctDisplay);
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

  /** End the game and save progress */
  async endGame() {
    // Prepare session data
    const sessionData = {
      category: 'category-match',
      totalQuestions: this.totalQuestions,
      correctAnswers: this.correctAnswers,
      skipped: this.skipCount,
      totalTime: 0,
      timestamp: Date.now()
    };

    try {
      // I-save sa local storage history
      const key = 'categoryMatchHistory';
      const history: any[] = JSON.parse(localStorage.getItem(key) || '[]');
      history.push(sessionData);
      localStorage.setItem(key, JSON.stringify(history));

      // Mag-dispatch ug event para sa uban nga components
      window.dispatchEvent(new CustomEvent('categoryMatchFinished', { detail: sessionData }));
    } catch (error) {
      console.error('Error sa pag-save sa Category Match session:', error);
    }

    // Show completion modal
    this.showResult = false;
    this.showGameComplete = true;

    // I-save sa Firebase progress
    try {
      await ProgressPage.saveGameSession(
        this.firebaseService, 
        sessionData as any, 
        (window as any).progressPageInstance
      );
    } catch (e) {
      console.warn('Progress save/refresh failed:', e);
    }
  }

  /** Close the game complete modal and navigate to Brain Games */
  finishGame() {
    this.showGameComplete = false;
    this.showResult = false;
    this.shouldCompleteAfterResult = false;
    this.router.navigate(['/brain-games']);
  }

  /** Restart the game using the same category */
  playAgain() {
    this.setupNewRun();
  }

  /** Balik sa category picker (dili diretso sa Brain Games aron dili ma-skip ang select page) */
  goBack() {
    void this.router.navigate(['/brain-game-category', 'category-match']);
  }

  /** Mag-navigate sa add flashcard page */
  goToAddFlashcard() {
    this.router.navigate(['/add-flashcard'], {
      queryParams: { from: 'category-match' }
    });
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

  /** Mag-normalize sa string para comparison */
  private normalizeToken(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /** Compare two strings for category matching */
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

  /** Cache game cards locally for offline access */
  private cacheGameCardsLocally(cards: GameCard[]) {
    try {
      const user = this.firebaseService.getCurrentUser();
      const uid = user ? user.uid : 'anon';
      const cacheKey = `categoryMatchCache_${uid}`;
      localStorage.setItem(cacheKey, JSON.stringify(cards));
    } catch (e) {
      console.warn('Failed to cache game cards locally:', e);
    }
  }
}
