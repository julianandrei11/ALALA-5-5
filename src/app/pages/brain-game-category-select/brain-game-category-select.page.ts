import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';

const CATEGORIES_KEY = 'alala_custom_categories_v1';
const CARDS_PREFIX = 'alala_cards_';

interface CustomCategory {
  id: string;
  name: string;
  emoji?: string;
}

@Component({
  selector: 'app-brain-game-category-select',
  templateUrl: './brain-game-category-select.page.html',
  styleUrls: ['./brain-game-category-select.page.scss'],
  standalone: false
})
export class BrainGameCategorySelectPage implements OnInit, ViewWillEnter {
  gameKey: 'name-that-memory' | 'category-match' = 'name-that-memory';
  pageTitle = '';
  subtitle = '';
  counts: { people: number; places: number; objects: number; custom: Record<string, number> } = {
    people: 0,
    places: 0,
    objects: 0,
    custom: {},
  };
  userCategories: CustomCategory[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firebaseService: FirebaseService
  ) {}

  /**
   * Lazy-loaded `brain-game-category/:game` puts `game` on a parent ActivatedRoute.
   * Relying only on `route` / one `parent` often yields '' and wrongly redirects to Brain Games.
   */
  private resolveGameRouteParam(): string {
    let r: ActivatedRoute | null = this.route;
    while (r) {
      const game = r.snapshot.paramMap.get('game');
      if (game) {
        return game.trim();
      }
      r = r.parent;
    }
    try {
      const path = this.router.url.split('?')[0];
      const parts = path.split('/').filter(Boolean);
      const idx = parts.indexOf('brain-game-category');
      if (idx >= 0 && parts[idx + 1]) {
        return decodeURIComponent(parts[idx + 1]).trim();
      }
    } catch {
      /* ignore */
    }
    return '';
  }

  ngOnInit(): void {
    const g = this.resolveGameRouteParam();
    if (g === 'category-match') {
      this.gameKey = 'category-match';
    } else if (g === 'name-that-memory') {
      this.gameKey = 'name-that-memory';
    } else {
      void this.router.navigate(['/brain-games']);
      return;
    }
    this.pageTitle = this.gameKey === 'category-match' ? 'Category Match' : 'Name That Memory';
    this.subtitle = 'Choose a category';
    this.loadUserCategories();
    void this.refreshCounts();
  }

  ionViewWillEnter(): void {
    this.loadUserCategories();
    void this.refreshCounts();
  }

  private loadUserCategories(): void {
    try {
      const user = this.firebaseService.getCurrentUser();
      const key = user ? `${CATEGORIES_KEY}_${user.uid}` : CATEGORIES_KEY;
      const raw = localStorage.getItem(key);
      this.userCategories = raw ? (JSON.parse(raw) as CustomCategory[]) : [];
    } catch {
      this.userCategories = [];
    }
  }

  private async refreshCounts(): Promise<void> {
    let firebaseCards: { category: string; label?: string; image?: string }[] = [];
    try {
      const initial = await (this.firebaseService as any).getGameFlashcardsOnce?.();
      if (Array.isArray(initial)) {
        firebaseCards = initial.map((c: any) => ({
          category: (c.category || '').toString().trim().toLowerCase(),
          label: (c.label || '').toString().trim(),
          image: (c.image || c.src || '').toString().trim(),
        }));
      }
    } catch {
      firebaseCards = [];
    }

    const mergeCount = (cat: 'people' | 'places' | 'objects') => {
      const fb = firebaseCards.filter(c => c.category === cat);
      const local = this.readLocalCards(cat);
      const seen = new Set<string>();
      let n = 0;
      for (const c of [...fb, ...local]) {
        const label = (c.label || '').trim();
        const image = (c.image || '').trim();
        if (!label || !image) continue;
        const k = `${label.toLowerCase()}::${image}`;
        if (seen.has(k)) continue;
        seen.add(k);
        n++;
      }
      return n;
    };

    const custom: Record<string, number> = {};
    for (const c of this.userCategories) {
      custom[c.id] = this.readCustomPhotoCardCount(c.id);
    }

    this.counts = {
      people: mergeCount('people'),
      places: mergeCount('places'),
      objects: mergeCount('objects'),
      custom,
    };
  }

  private readLocalCards(cat: string): { label?: string; image?: string }[] {
    const singular = cat.endsWith('s') ? cat.slice(0, -1) : cat;
    const keys = [`${cat}Cards`, `${singular}Cards`, cat];
    const seen = new Set<string>();
    const out: { label?: string; image?: string }[] = [];
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) continue;
        for (const r of arr) {
          const label = (r.label || r.name || '').toString().trim();
          const image = (r.image || r.photo || r.photoUrl || '').toString().trim();
          if (!label || !image) continue;
          const k = `${label.toLowerCase()}::${image}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ label, image });
        }
      } catch {
        /* ignore */
      }
    }
    return out;
  }

  private readCustomPhotoCardCount(categoryId: string): number {
    try {
      const raw = localStorage.getItem(`${CARDS_PREFIX}${categoryId}`);
      if (!raw) return 0;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return 0;
      return arr.filter((r: any) => r.type === 'photo' && r.label && r.src).length;
    } catch {
      return 0;
    }
  }

  pickBuiltin(b: 'people' | 'places' | 'objects'): void {
    void this.router.navigate([`/${this.gameKey}`], { queryParams: { builtin: b } });
  }

  pickCustom(id: string): void {
    void this.router.navigate([`/${this.gameKey}`], { queryParams: { custom: id } });
  }

  goBack(): void {
    void this.router.navigate(['/brain-games']);
  }
}
