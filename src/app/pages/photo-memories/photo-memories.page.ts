import { Component, OnDestroy, OnInit, ChangeDetectorRef, NgZone, ViewChild, ElementRef } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { Location } from '@angular/common';
import type { Unsubscribe } from '@firebase/firestore';
import { ConfirmService } from '../../services/confirm.service';


type BuiltinCategory = 'people' | 'places' | 'objects';

type Category = BuiltinCategory | 'custom' | string;

interface RawCard {
  id?: string;
  label?: string;
  name?: string;
  image?: string;
  photo?: string;
  photoUrl?: string;
  imagePath?: string;
  audio?: string;
  audioUrl?: string;
  audioPath?: string;
  category?: string;
  createdAt?: number | string;
}


interface RawCustomCard {
  id: string;
  categoryId: string;
  type: 'photo' | 'video' | 'manual';
  src: string;         
  label?: string;
  audio?: string | null;
  duration?: number;
  createdAt: number;
}

interface UnifiedCard {
  id: string;
  label: string;
  image: string;
  category: Category;
  categoryName?: string;
  createdAt?: number;
  
  origin: { kind: 'builtin'; key: 'peopleCards' | 'placesCards' | 'objectsCards' }
        | { kind: 'custom'; customId: string }
        | { kind: 'firebase'; id: string };
}

const CATEGORIES_KEY = 'alala_custom_categories_v1';
const CARDS_PREFIX   = 'alala_cards_';

@Component({
  selector: 'app-photo-memories',
  templateUrl: './photo-memories.page.html',
  styleUrls: ['./photo-memories.page.scss'],
  standalone: false
})
export class PhotoMemoriesPage implements OnInit, OnDestroy {
  isPatientMode = false;

  cards: UnifiedCard[] = [];
  idx = -1;

  
  showDetailModal = false;
  selectedCard: UnifiedCard | null = null;
  selectedIndex = -1;

  
  isSelectionMode = false;
  selectedCards = new Set<string>();

  // Edit modal
  showEditModal = false;
  editCardLabel = '';
  editCardImage = '';
  editCardCategory = '';
  cardBeingEdited: UnifiedCard | null = null;
  customCategories: { id: string; name: string }[] = [];
  @ViewChild('editImageInput') editImageInput!: ElementRef<HTMLInputElement>;

  
  private touchStartX = 0;
  private touchStartY = 0;
  private minSwipeDistance = 50;
  swipeOffset = 0;
  private isDragging = false;

  
  private isDeleting = false;
  private deletedCardIds = new Set<string>(); 

   constructor(
    private alertCtrl: AlertController,
    private router: Router,
    private firebaseService: FirebaseService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private location: Location
  ) {}

  private onPatientModeChange = (e?: any) => {
    const v = e?.detail ?? localStorage.getItem('patientMode');
    this.isPatientMode = (v === true || v === 'true');
  };

  async ngOnInit(): Promise<void> {
    this.isPatientMode = localStorage.getItem('patientMode') === 'true';
    await this.loadAll();
    
    if (this.cards.length > 0) this.idx = 0;

    
    window.addEventListener('patientMode-changed', this.onPatientModeChange as any);
    
    window.addEventListener('flashcard-added', this.onFlashcardAdded as any);
    
    window.addEventListener('flashcard-deleted', this.onFlashcardDeleted as any);
    
    
    
    
    
  }

  async ionViewWillEnter(): Promise<void> {
    
    this.isPatientMode = localStorage.getItem('patientMode') === 'true';
    const prev = this.currentCard?.id;
    await this.loadAll();
    if (this.cards.length === 0) { this.idx = -1; return; }
    const keep = prev ? this.cards.findIndex(c => c.id === prev) : -1;
    this.idx = keep >= 0 ? keep : Math.min(Math.max(this.idx, 0), this.cards.length - 1);
  }

  ngOnDestroy(): void {
    window.removeEventListener('patientMode-changed', this.onPatientModeChange as any);
    window.removeEventListener('flashcard-added', this.onFlashcardAdded as any);
    window.removeEventListener('flashcard-deleted', this.onFlashcardDeleted as any);
    
  }

  
  get hasCard(): boolean { return this.idx >= 0 && this.idx < this.cards.length; }
  get currentCard(): UnifiedCard | null { return this.hasCard ? this.cards[this.idx] : null; }

  imgSrc(card: UnifiedCard | null): string {
    return card?.image || '';
  }

  
  private async loadAll() {
    try {
      const firebaseCards = await this.firebaseService.getGameFlashcardsOnce();

      const filtered = firebaseCards.filter((card) => !!card.image && !!card.label);
      filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      // Load custom categories to get names
      const customCategoriesMap = new Map<string, string>();
      try {
        const user = this.firebaseService.getCurrentUser();
        const userSpecificKey = user ? `${CATEGORIES_KEY}_${user.uid}` : CATEGORIES_KEY;
        const raw = localStorage.getItem(userSpecificKey);
        if (raw) {
          const categories = JSON.parse(raw) as Array<{ id: string; name: string }>;
          categories.forEach(cat => customCategoriesMap.set(cat.id, cat.name));
        }
      } catch (e) {
        console.warn('Failed to load custom categories:', e);
      }

      this.cards = filtered.map((c) => {
        let categoryName = c.category;
        
        // If it's a custom category, look up the actual name
        if (c.category === 'custom-category' && (c as any).categoryId) {
          const customName = customCategoriesMap.get((c as any).categoryId);
          if (customName) {
            categoryName = customName;
          }
        }

        return {
          id: c.id,
          label: c.label,
          image: c.image,
          category: c.category as Category,
          categoryName: categoryName,
          createdAt: c.createdAt,
          origin: { kind: 'firebase', id: c.id }
        };
      });
    } catch (error) {
      console.error('Failed to load photo memories from Firebase:', error);
      this.cards = [];
    }
  }

  private readBuiltin(key: 'peopleCards' | 'placesCards' | 'objectsCards', cat: BuiltinCategory): UnifiedCard[] {
    const user = this.firebaseService.getCurrentUser();
    const uid = user ? user.uid : 'anon';
    const scopedKey = `${key}_${uid}`;
    const raw = localStorage.getItem(scopedKey);
    
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as RawCard[];
      
      
      
      const migratedArr = this.migrateCardsWithIds(arr, key);
      if (migratedArr !== arr) {
        localStorage.setItem(scopedKey, JSON.stringify(migratedArr));
        
      }
      
      
      const seen = new Set<string>();
      const unique = migratedArr.filter((c) => {
        const label = (c.label || c.name || '').toString().trim().toLowerCase();
        const image = (c.image || c.photo || c.photoUrl || c.imagePath || '').toString();
        const key = `${label}::${image}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      const result = unique
        .map((c, i) => this.normalizeBuiltin(c, cat, key, i))
        .filter((x): x is UnifiedCard => !!x && !!x.label && !!x.image);
      
      return result;
    } catch (e) {
      console.error(`readBuiltin(${key}) error:`, e);
      return [];
    }
  }

  private normalizeBuiltin(
    c: RawCard,
    category: BuiltinCategory,
    originKey: 'peopleCards' | 'placesCards' | 'objectsCards',
    i: number
  ): UnifiedCard | null {
    
    const label = (c.label || c.name || '').toString().trim();
    const image = (c.image || c.photo || c.photoUrl || c.imagePath || '').toString().trim();
    
    
    const contentHash = this.createContentHash(label, image);
    const id = c.id || `${originKey}-${contentHash}`;
    
    if (!label || !image) return null;

    let createdAt: number | undefined;
    if (c.createdAt) {
      const n = typeof c.createdAt === 'string' ? Date.parse(c.createdAt) : c.createdAt;
      if (!Number.isNaN(n)) createdAt = typeof n === 'number' ? n : undefined;
    }

    return {
      id,
      label,
      image,
      category,
      createdAt,
      origin: { kind: 'builtin', key: originKey }
    };
    }

  

  
  private onFlashcardAdded = async (e: CustomEvent) => {
    const category = e.detail?.category;
    if (!category || !['people', 'places', 'objects', 'custom-category'].includes(category)) {
      return;
    }
    
    const prev = this.currentCard?.id;
    await this.loadAll();
    if (this.cards.length === 0) { this.idx = -1; return; }
    const keep = prev ? this.cards.findIndex(c => c.id === prev) : -1;
    this.idx = keep >= 0 ? keep : Math.min(Math.max(this.idx, 0), this.cards.length - 1);
  }

  
  private onFlashcardDeleted = async (e: CustomEvent) => {
    
    
    
    if (this.isDeleting) {
      
      return;
    }
    
    
    const deletedCardId = e.detail?.cardId;
    if (deletedCardId) {
      this.deletedCardIds.add(deletedCardId);
      
    }
    
    
    
    if (e.detail?.fromCurrentPage) {
      
      return;
    }
    
    
    const prev = this.currentCard?.id;
    await this.loadAll();
    if (this.cards.length === 0) { 
      this.idx = -1; 
      this.closeDetailView();
      return; 
    }
    const keep = prev ? this.cards.findIndex(c => c.id === prev) : -1;
    this.idx = keep >= 0 ? keep : Math.min(Math.max(this.idx, 0), this.cards.length - 1);
  }

  

  
  prev() {
    if (!this.hasCard) return;
    this.idx = (this.idx - 1 + this.cards.length) % this.cards.length;
  }

  next() {
    if (!this.hasCard) return;
    this.idx = (this.idx + 1) % this.cards.length;
  }

  
  async deleteCurrent() {
    if (this.isPatientMode || !this.currentCard) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete Memory',
      message: `Remove "${this.currentCard.label}" from its category?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => this.performDelete([this.currentCard!]) }
      ]
    });
    await alert.present();
  }




  
  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    void color;
    await this.confirmService.notify(message);
  }

  
  async refreshData() {
    await this.loadAll();
    
    
    
    
    
    this.cdr.detectChanges();
    
    
  }

  
  private forceUIUpdate() {
    this.ngZone.run(() => {
      this.cdr.detectChanges();
    });
  }

  
  private forceCompleteUIUpdate() {
    this.ngZone.run(() => {
      
      this.cdr.markForCheck();
      this.cdr.detectChanges();
      
      
      setTimeout(() => {
        this.cdr.detectChanges();
      }, 0);
    });
  }

  
  private debugUIState() {
    
    
    
    
    
    
  }

  
  trackByCardId(index: number, card: UnifiedCard): string {
    return card.id;
  }

  
  private createContentHash(label: string, image: string): string {
    
    const content = `${label}|${image}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; 
    }
    return Math.abs(hash).toString(36);
  }

  
  private migrateCardsWithIds(cards: RawCard[], originKey: string): RawCard[] {
    let needsMigration = false;
    const migratedCards = cards.map((card, index) => {
      if (!card.id) {
        needsMigration = true;
        const label = (card.label || card.name || '').toString().trim();
        const image = (card.image || card.photo || card.photoUrl || card.imagePath || '').toString().trim();
        const contentHash = this.createContentHash(label, image);
        return { ...card, id: `${originKey}-${contentHash}` };
      }
      return card;
    });
    
    if (needsMigration) {
      
    }
    
    return migratedCards;
  }

  

  
  openDetailView(card: UnifiedCard, index: number) {
    this.selectedCard = card;
    this.selectedIndex = index;
    this.showDetailModal = true;
  }

  closeDetailView() {
    this.showDetailModal = false;
    this.selectedCard = null;
    this.selectedIndex = -1;
  }

  nextImage() {
    if (this.selectedIndex < this.cards.length - 1) {
      this.selectedIndex++;
      this.selectedCard = this.cards[this.selectedIndex];
    }
  }

  prevImage() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.selectedCard = this.cards[this.selectedIndex];
    }
  }

  
  onTouchStart(event: TouchEvent) {
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
    this.isDragging = true;
  }

  onTouchEnd(event: TouchEvent) {
    this.isDragging = false;
    
    const touchEndX = event.changedTouches[0].clientX;
    const touchEndY = event.changedTouches[0].clientY;
    
    const deltaX = touchEndX - this.touchStartX;
    const deltaY = touchEndY - this.touchStartY;
    
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.minSwipeDistance) {
      if (deltaX > 0) {
        
        this.prevImage();
      } else {
        
        this.nextImage();
      }
    }
  }

  
  onSwipeLeft() {
    
    this.swipeOffset -= 100;
    if (this.swipeOffset < -200) {
      this.swipeOffset = -200; 
    }
  }

  onSwipeRight() {
    
    this.swipeOffset += 100;
    if (this.swipeOffset > 0) {
      this.swipeOffset = 0; 
    }
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isDragging) return;
    
    const touchX = event.touches[0].clientX;
    const deltaX = touchX - this.touchStartX;
    
    
    this.swipeOffset = deltaX * 0.5;
    
    
    event.preventDefault();
  }

  
  toggleSelectionMode() {
    this.isSelectionMode = !this.isSelectionMode;
    if (!this.isSelectionMode) {
      this.selectedCards.clear();
    }
  }

  toggleCardSelection(cardId: string) {
    if (this.selectedCards.has(cardId)) {
      this.selectedCards.delete(cardId);
    } else {
      this.selectedCards.add(cardId);
    }
  }

  selectAllCards() {
    this.selectedCards.clear();
    this.cards.forEach(card => this.selectedCards.add(card.id));
    
  }

  editCard(card: UnifiedCard) {
    this.cardBeingEdited = card;
    this.editCardLabel = card.label || '';
    this.editCardImage = card.image || '';
    this.editCardCategory = this.getCardCategoryValue(card);
    this.loadCustomCategories();
    this.showEditModal = true;
  }

  private getCardCategoryValue(card: UnifiedCard): string {
    if (card.origin.kind === 'custom') {
      return card.origin.customId;
    }
    return card.category;
  }

  private loadCustomCategories() {
    try {
      const stored = localStorage.getItem(CATEGORIES_KEY);
      this.customCategories = stored ? JSON.parse(stored) : [];
    } catch {
      this.customCategories = [];
    }
  }

  closeEditModal() {
    this.showEditModal = false;
    this.cardBeingEdited = null;
    this.editCardLabel = '';
    this.editCardImage = '';
    this.editCardCategory = '';
  }

  triggerImagePicker() {
    this.editImageInput?.nativeElement?.click();
  }

  onEditImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        this.editCardImage = e.target?.result as string;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  async saveCardEdit() {
    if (!this.cardBeingEdited) return;

    try {
      const updates: any = {
        label: this.editCardLabel,
        image: this.editCardImage,
        category: this.editCardCategory
      };

      // Update local card object
      this.cardBeingEdited.label = this.editCardLabel;
      this.cardBeingEdited.image = this.editCardImage;

      // Determine if category changed
      const isBuiltinCategory = ['people', 'places', 'objects'].includes(this.editCardCategory);
      const oldCategory = this.cardBeingEdited.category;
      const categoryChanged = oldCategory !== this.editCardCategory;

      if (isBuiltinCategory) {
        this.cardBeingEdited.category = this.editCardCategory as Category;
      }

      // Update in Firebase if it's a firebase card
      if (this.cardBeingEdited.origin.kind === 'firebase') {
        await this.firebaseService.updateFlashcard(this.cardBeingEdited.origin.id, updates);
      } else if (this.cardBeingEdited.origin.kind === 'builtin') {
        // Update in localStorage for builtin cards
        const storageKey = `${this.cardBeingEdited.origin.key}_${this.firebaseService.getCurrentUser()?.uid || 'anon'}`;
        const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const cardIndex = existing.findIndex((item: any) => item.id === this.cardBeingEdited!.id);
        if (cardIndex !== -1) {
          existing[cardIndex].label = this.editCardLabel;
          existing[cardIndex].image = this.editCardImage;
          if (categoryChanged && isBuiltinCategory) {
            existing[cardIndex].category = this.editCardCategory;
          }
          localStorage.setItem(storageKey, JSON.stringify(existing));
        }
      }

      // Update the selected card if it's the same
      if (this.selectedCard && this.selectedCard.id === this.cardBeingEdited.id) {
        this.selectedCard.label = this.editCardLabel;
        this.selectedCard.image = this.editCardImage;
        if (isBuiltinCategory) {
          this.selectedCard.category = this.editCardCategory as Category;
        }
      }

      this.cdr.detectChanges();
      await this.toast('Memory updated successfully', 'success');
      this.closeEditModal();
    } catch (err) {
      console.error('Failed to update card:', err);
      await this.toast('Failed to update memory', 'danger');
    }
  }
  
  async deleteCard(card: UnifiedCard, event: Event) {
    event.stopPropagation();
    
    const alert = await this.alertCtrl.create({
      header: 'Delete Memory',
      message: `Are you sure you want to delete "${card.label}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => this.performDelete([card])
        }
      ]
    });
    await alert.present();
  }

  async deleteSelected() {
    if (this.selectedCards.size === 0) return;
    
    const selectedCardsList = this.cards.filter(card => this.selectedCards.has(card.id));
    const ok = await this.confirmService.confirm({
      title: 'Delete memories?',
      message: `Delete ${this.selectedCards.size} selected memories? This can’t be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;
    await this.performDelete(selectedCardsList);
  }

  private async presentToast(message: string, _color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    await this.confirmService.notify(message);
  }

  private async performDelete(cardsToDelete: UnifiedCard[]) {
    
    
    
    
    this.isDeleting = true;
    
    
    const cardsToDeleteIds = cardsToDelete.map(card => card.id);
    cardsToDeleteIds.forEach(id => this.deletedCardIds.add(id));
    
    try {
      
      const beforeCount = this.cards.length;
      
      
      this.cards = this.cards.filter(card => !cardsToDeleteIds.includes(card.id));
      const afterCount = this.cards.length;
      
      
      
      this.selectedCards.clear();
      this.isSelectionMode = false;
      
      // Close the detail modal after delete
      this.closeDetailView();
      
      this.forceCompleteUIUpdate();
      
      
      this.debugUIState();
      
      
      for (const card of cardsToDelete) {
        
        await this.deleteCardFromStorage(card);
      }
      
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      
      const remainingDeletedCards = this.cards.filter(card => cardsToDeleteIds.includes(card.id));
      if (remainingDeletedCards.length > 0) {
        console.warn('️ Some cards were not removed from UI:', remainingDeletedCards.map(c => c.id));
        
        this.cards = this.cards.filter(card => !cardsToDeleteIds.includes(card.id));
        this.forceCompleteUIUpdate();
      }
      
      await this.toast(`Deleted ${cardsToDelete.length} memories`, 'success');
      
      
      
      await this.verifyDeletion(cardsToDelete);
      
      
      this.clearCache();
      
      
      this.isDeleting = false;
      
      
      setTimeout(() => {
        cardsToDeleteIds.forEach(id => this.deletedCardIds.delete(id));
        
      }, 60000); 
      
    } catch (error) {
      console.error(' Error deleting memories:', error);
      await this.toast('Error deleting memories', 'danger');
      
      
      this.isDeleting = false;
      
      
      cardsToDeleteIds.forEach(id => this.deletedCardIds.delete(id));
    }
  }

  private async verifyDeletion(deletedCards: UnifiedCard[]) {
    
    
    for (const card of deletedCards) {
      if (card.origin.kind === 'builtin') {
        const storageKey = `${card.origin.key}_${this.firebaseService.getCurrentUser()?.uid || 'anon'}`;
        const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const found = existing.find((item: any) => item.id === card.id);
        if (found) {
          console.error(' VERIFICATION FAILED: Card still exists in storage:', card.id, found);
        } else {
          
        }
      } else if (card.origin.kind === 'custom') {
        const key = `${CARDS_PREFIX}${card.origin.customId}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const found = existing.find((item: any) => item.id === card.id);
        if (found) {
          console.error(' VERIFICATION FAILED: Card still exists in custom storage:', card.id, found);
        } else {
          
        }
      }
    }
    
    
    const stillInArray = this.cards.filter(card => deletedCards.some(deleted => deleted.id === card.id));
    if (stillInArray.length > 0) {
      console.error(' VERIFICATION FAILED: Cards still in local array:', stillInArray.map(c => c.id));
    } else {
      
    }
  }

  private clearCache() {
    try {
      const user = this.firebaseService.getCurrentUser();
      const uid = user ? user.uid : 'anon';
      const cacheKey = `photoMemoriesCache_${uid}`;
      localStorage.removeItem(cacheKey);
      
    } catch (e) {
      console.warn('Failed to clear cache:', e);
    }
  }

  private async deleteCardFromStorage(card: UnifiedCard) {
    console.log('️ deleteCardFromStorage called for:', {
      id: card.id,
      label: card.label,
      origin: card.origin,
      category: card.category
    });
    
    try {
      
      try {
        const firebaseId = card.origin.kind === 'firebase' ? card.origin.id : card.id;
        
        await this.firebaseService.deleteFlashcard(firebaseId, card.category);
        
      } catch (firebaseError) {
        
        
      }
      
      
      if (card.origin.kind === 'builtin') {
        const storageKey = `${card.origin.key}_${this.firebaseService.getCurrentUser()?.uid || 'anon'}`;
        
        const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const beforeCount = existing.length;
        
        
        const updated = existing.filter((item: any) => {
          const matches = item.id !== card.id;
          if (!matches) {
            console.log('️ Found card to delete:', { 
              itemId: item.id, 
              cardId: card.id, 
              itemLabel: item.label || item.name,
              cardLabel: card.label 
            });
          }
          return matches;
        });
        const afterCount = updated.length;
        localStorage.setItem(storageKey, JSON.stringify(updated));
        
        
        if (beforeCount === afterCount) {
          console.warn('️ Card was not found in builtin storage:', card.id);
          console.warn('️ Available IDs in storage:', existing.map((c: any) => c.id));
        }
      } else {
        console.warn('️ Photo Memories only handles builtin categories (People, Places, Objects). Ignoring:', card.origin);
      }
      
      
      window.dispatchEvent(new CustomEvent('flashcard-deleted', {
        detail: { cardId: card.id, category: card.category, fromCurrentPage: true }
      }));
      
    } catch (error) {
      console.error(' Error deleting card from storage:', error);
      throw error;
    }
  }

  
  private cleanupDuplicateStorage(allCards: UnifiedCard[], deduplicatedCards: UnifiedCard[]) {
    
    const validImages = new Set(deduplicatedCards.map(card => card.image));
    
    
    const builtinCategories = ['people', 'places', 'objects'] as const;
    builtinCategories.forEach(cat => {
      const key = `${cat}Cards_${this.firebaseService.getCurrentUser()?.uid || 'anon'}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const cleaned = existing.filter((item: any) => {
        const image = item.image || item.photo || item.photoUrl || item.imagePath || '';
        return validImages.has(image);
      });
      
      if (cleaned.length !== existing.length) {
        
        localStorage.setItem(key, JSON.stringify(cleaned));
      }
    });
    
    
    const customKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('Cards_')) {
        customKeys.push(key);
      }
    }
    
    customKeys.forEach(key => {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const cleaned = existing.filter((item: any) => {
        const image = item.src || item.image || '';
        return validImages.has(image);
      });
      
      if (cleaned.length !== existing.length) {
        
        localStorage.setItem(key, JSON.stringify(cleaned));
      }
    });
    
    
    this.cleanupLocalStorageDuplicates(allCards, deduplicatedCards);
  }
  
  private cleanupLocalStorageDuplicates(allCards: UnifiedCard[], deduplicatedCards: UnifiedCard[]) {
    
    const validImages = new Set(deduplicatedCards.map(card => card.image));
    
    
    const builtinCategories = ['people', 'places', 'objects'] as const;
    builtinCategories.forEach(cat => {
      const key = `${cat}Cards_${this.firebaseService.getCurrentUser()?.uid || 'anon'}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const cleaned = existing.filter((item: any) => {
        const image = item.image || item.photo || item.photoUrl || item.imagePath || '';
        return validImages.has(image);
      });
      
      if (cleaned.length !== existing.length) {
        
        localStorage.setItem(key, JSON.stringify(cleaned));
      }
    });
    
    
    const customKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('Cards_')) {
        customKeys.push(key);
      }
    }
    
    customKeys.forEach(key => {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const cleaned = existing.filter((item: any) => {
        const image = item.src || item.image || '';
        return validImages.has(image);
      });
      
      if (cleaned.length !== existing.length) {
        
        localStorage.setItem(key, JSON.stringify(cleaned));
      }
    });
  }

  
  getCategoryName(category: string): string {
    const categoryNames: { [key: string]: string } = {
      'people': 'People',
      'places': 'Places', 
      'objects': 'Objects',
      'custom': 'Custom Category'
    };
    return categoryNames[category] || category;
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  goToAddFlashcard() {
    this.router.navigate(['/add-flashcard'], {
      queryParams: { from: 'category-match' }
    });
  }

  goBack() {
    this.location.back();
  }
}
