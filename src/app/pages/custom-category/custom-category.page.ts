import { Component, ElementRef, OnDestroy, OnInit, ViewChild, ChangeDetectorRef, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ActionSheetController } from '@ionic/angular';
import { Location } from '@angular/common';
import { FirebaseService } from '../../services/firebase.service';
import { ConfirmService } from '../../services/confirm.service';

type UUID = string;

interface UserCategory {
  id: UUID;
  name: string;
  description?: string;
  emoji?: string;
  createdAt: number;
}

interface RawFlashcard {
  id: UUID;
  categoryId: UUID;
  type: 'photo' | 'video' | 'manual';
  src: string;
  label?: string;
  audio?: string | null;
  duration?: number; 
  createdAt: number;
}

interface DisplayCard {
  id: UUID;
  label: string;
  image: string;       
  audio?: string | null;
  duration?: number;   
}

const CATEGORIES_KEY = 'alala_custom_categories_v1';
const CARDS_PREFIX   = 'alala_cards_';

@Component({
  selector: 'app-custom-category',
  templateUrl: './custom-category.page.html',
  styleUrls: ['./custom-category.page.scss'],
  standalone: false
})
export class CustomCategoryPage implements OnInit, OnDestroy {
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('videoInput') videoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editImageInput') editImageInput!: ElementRef<HTMLInputElement>;

  id = '';
  title = 'Category';
  description?: string;
  emoji = '️';
  
  get categoryName() { return this.title; }
  get categoryDescription() { return this.description; }

  isPatientMode = localStorage.getItem('patientMode') === 'true';

  displayCards: DisplayCard[] = [];
  currentCard: DisplayCard | null = null;
  currentIndex = 0;

  currentAudio: HTMLAudioElement | null = null;
  isPlaying = false;
  currentTime = 0;
  duration = 0;
  private rafId: number | null = null;

  skipCount = 0;
  skippedCardIds: string[] = [];

  // Modal states
  isImageModalOpen = false;
  showEditModal = false;
  editCardLabel = '';
  editCardImage = '';

  private modeListener = (e: any) => {
    this.isPatientMode = !!e?.detail;
  };

  private onFlashcardUpdated = (e: any) => {
    
    this.loadDisplayCards();
  };

  private onFlashcardAdded = (e: any) => {
    
    this.loadDisplayCards();
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private alertCtrl: AlertController,
    private actionSheetCtrl: ActionSheetController,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private location: Location,
    private firebaseService: FirebaseService,
    private confirmService: ConfirmService
  ) {}

  async ngOnInit() {
    window.addEventListener('patientMode-changed', this.modeListener);
    
    window.addEventListener('flashcard-updated', this.onFlashcardUpdated);
    window.addEventListener('flashcard-added', this.onFlashcardAdded);
    

    this.id = this.route.snapshot.paramMap.get('id') || '';

    const state = this.router.getCurrentNavigation()?.extras?.state as { categoryName?: string } | undefined;
    if (state?.categoryName) {
      this.title = state.categoryName;
    }

    // Try to load category info from Firebase first
    try {
      const categories = await this.firebaseService.getCustomCategories();
      const cat = categories.find(c => c.id === this.id);
      if (cat) {
        this.title = cat.name || this.title;
        this.description = cat.description;
        this.emoji = cat.emoji || this.emoji;
      }
    } catch (e) {
      // Fallback to localStorage
      const cat = this.findCategoryById(this.id);
      if (cat) {
        this.title = cat.name || this.title;
        this.description = cat.description;
        this.emoji = cat.emoji || this.emoji;
      }
    }

    await this.loadDisplayCards();
  }

  ionViewWillEnter() {
    this.loadDisplayCards();
  }

  ngOnDestroy() {
    window.removeEventListener('patientMode-changed', this.modeListener);
    window.removeEventListener('flashcard-updated', this.onFlashcardUpdated);
    window.removeEventListener('flashcard-added', this.onFlashcardAdded);
    this.stopAudio();
    this.stopRaf();
  }

  
  private getAllCategories(): UserCategory[] {
    try {
      const user = this.firebaseService.getCurrentUser();
      const userSpecificKey = user ? `${CATEGORIES_KEY}_${user.uid}` : CATEGORIES_KEY;
      const raw = localStorage.getItem(userSpecificKey);
      return raw ? (JSON.parse(raw) as UserCategory[]) : [];
    } catch { return []; }
  }
  private findCategoryById(id: string): UserCategory | undefined {
    return this.getAllCategories().find(c => c.id === id);
  }
  private cardsKey(): string {
    return `${CARDS_PREFIX}${this.id}`;
  }

  private async loadDisplayCards() {
    // Try loading from Firebase first (synced across devices)
    try {
      const firebaseCards = await this.firebaseService.getCustomCategoryCards(this.id);
      
      if (firebaseCards.length > 0) {
        this.displayCards = firebaseCards.map(c => ({
          id: c.id,
          label: c.label || 'Untitled',
          image: c.image,
          audio: c.audio || null,
          duration: c.duration || 0
        }));
      } else {
        // Fallback to localStorage
        const raw = this.getRawCards();
        const photos = raw.filter(c => c.type === 'photo');
        const sortedPhotos = photos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        
        this.displayCards = sortedPhotos.map(c => ({
          id: c.id,
          label: c.label || 'Untitled',
          image: c.src,
          audio: c.audio || null,
          duration: c.duration || 0
        }));
      }
    } catch (e) {
      console.warn('Failed to load from Firebase, falling back to localStorage:', e);
      // Fallback to localStorage
      const raw = this.getRawCards();
      const photos = raw.filter(c => c.type === 'photo');
      const sortedPhotos = photos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      this.displayCards = sortedPhotos.map(c => ({
        id: c.id,
        label: c.label || 'Untitled',
      
        image: c.src,
        audio: c.audio || null,
        duration: c.duration || 0
      }));
    }

    console.log('Custom Category loaded cards:', this.displayCards.map(c => ({ 
      label: c.label, 
      hasAudio: !!c.audio, 
      audioSrc: c.audio?.substring(0, 50),
      duration: c.duration 
    })));

    if (this.displayCards.length > 0) {
      this.setCard(0);
    } else {
      this.currentCard = null;
      this.stopAudio();
    }
  }

  private getRawCards(): RawFlashcard[] {
    try {
      const raw = localStorage.getItem(this.cardsKey());
      return raw ? (JSON.parse(raw) as RawFlashcard[]) : [];
    } catch { return []; }
  }
  private saveRawCards(list: RawFlashcard[]) {
    localStorage.setItem(this.cardsKey(), JSON.stringify(list));
  }

  

  async onDeleteCategory() {
    if (this.isPatientMode) return;

    const ok = await this.confirmService.confirm({
      title: 'Remove category?',
      message: `Remove “${this.title}”? The category goes away; your media stays in your library.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    const list = this.getAllCategories().filter(c => c.id !== this.id);
    const user = this.firebaseService.getCurrentUser();
    const userSpecificKey = user ? `${CATEGORIES_KEY}_${user.uid}` : CATEGORIES_KEY;
    localStorage.setItem(userSpecificKey, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('categories-updated', { detail: list }));
    this.presentToast('Category removed', 'success');
    this.router.navigate(['/home']);
  }

  async deleteCurrentCard() {
    if (!this.currentCard) return;

    const ok = await this.confirmService.confirm({
      title: 'Delete memory?',
      message: `Remove “${this.currentCard.label || 'this memory'}”? This can’t be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    const deletedId = this.currentCard?.id;
    const categoryId = this.id;

    try {
      if (this.currentCard?.id) {
        await this.firebaseService.deleteFlashcard(this.currentCard.id, 'custom-category');
      }

      const raw = this.getRawCards();
      const idxInRaw = raw.findIndex(r => r.id === deletedId);
      if (idxInRaw >= 0) {
        raw.splice(idxInRaw, 1);
        this.saveRawCards(raw);
      }

      const prevIndex = this.currentIndex;
      this.loadDisplayCards();
      if (this.displayCards.length > 0) {
        this.setCard(Math.min(prevIndex, this.displayCards.length - 1));
      } else {
        this.currentCard = null;
        this.stopAudio();
      }

      window.dispatchEvent(
        new CustomEvent('card-deleted', { detail: { cardId: deletedId, category: categoryId } })
      );
      await this.confirmService.notify('Memory was deleted.', 'Deleted');
    } catch (err) {
      console.error('Failed to delete card:', err);
      await this.confirmService.notify('Could not delete this memory. Please try again.', 'Couldn’t delete');
    }
  }

  async editCurrentCard() {
    if (!this.currentCard) return;

    
    this.router.navigate(['/add-flashcard'], {
      queryParams: {
        defaultCategoryId: this.id,
        editCardId: this.currentCard.id,
        editLabel: this.currentCard.label
      }
    });
  }

  goBack() {
    this.router.navigate(['/memory-categories']);
  }

  
  setCard(index: number) {
    if (this.displayCards.length === 0) {
      this.currentCard = null;
      this.stopAudio();
      return;
    }
    this.currentIndex = (index + this.displayCards.length) % this.displayCards.length;
    this.currentCard = this.displayCards[this.currentIndex];

    const storedDur = Number(this.currentCard?.duration ?? 0);
    this.buildPlayer(this.currentCard?.audio || null, storedDur);
  }
  nextCard() { this.setCard(this.currentIndex + 1); }
  prevCard() { this.setCard(this.currentIndex - 1); }

  
  skipCurrent() {
    if (!this.currentCard) return;
    this.skipCount++;
    if (this.currentCard.id) this.skippedCardIds.push(this.currentCard.id);
    this.nextCard();
  }

  
  private isValidAudioSource(src: string): boolean {
    if (!src) return false;
    if (src.startsWith('data:audio/')) return true;
    if (src.startsWith('blob:')) return true;
    if (src.startsWith('http://') || src.startsWith('https://')) return true;
    if (src.startsWith('file://')) return true;
    if (src.includes('capacitor://')) return true;
    console.warn('Unknown audio source format:', src?.substring(0, 50));
    return false;
  }

  
  private buildPlayer(src: string | null, storedDuration?: number) {
    this.stopAudio();

    

    if (!src) {
      this.duration = 0;
      return;
    }

    if (!this.isValidAudioSource(src)) {
      console.warn('Invalid audio source:', src?.substring(0, 50));
      this.duration = 0;
      return;
    }

    this.currentAudio = new Audio(src);
    this.currentAudio.preload = 'metadata';
    this.currentAudio.playbackRate = 1.0; 
    this.isPlaying = false;
    this.currentTime = 0;

    
    if (storedDuration && isFinite(storedDuration) && storedDuration > 0) {
      this.duration = storedDuration;
    } else {
      this.duration = 0;
    }

    this.currentAudio.addEventListener('loadedmetadata', () => {
      const metaDur = Number(this.currentAudio?.duration || 0);
      console.log(' Audio metadata loaded:', {
        duration: metaDur,
        playbackRate: this.currentAudio?.playbackRate,
        src: src?.substring(0, 50)
      });
      if ((!this.duration || this.duration <= 0) && isFinite(metaDur) && metaDur > 0) {
        this.duration = metaDur;
      }
    });

    this.currentAudio.addEventListener('timeupdate', () => {
      
      const newTime = Math.round((this.currentAudio?.currentTime || 0) * 100) / 100;
      if (Math.abs(newTime - this.currentTime) >= 0.1) {
        this.currentTime = newTime;
        this.cdr.markForCheck();
      }
    });

    this.currentAudio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.stopRaf();
    });

    this.currentAudio.addEventListener('error', (e) => {
      console.error('Audio load error:', e);
      this.isPlaying = false;
      this.stopRaf();
    });
  }

  toggleAudio() {
    console.log(' Custom Category toggleAudio called:', { 
      hasCurrentAudio: !!this.currentAudio, 
      isPlaying: this.isPlaying,
      audioSrc: this.currentAudio?.src?.substring(0, 50)
    });
    
    if (!this.currentAudio) return;
    if (this.isPlaying) {
      this.currentAudio.pause();
      this.isPlaying = false;
      this.stopRaf();
    } else {
      this.currentAudio.play()
        .then(() => {
          this.isPlaying = true;
          this.startRaf();
        })
        .catch(err => {
          console.error('Audio play failed:', err);
          this.isPlaying = false;
          this.stopRaf();
        });
    }
  }

  private startRaf() {
    
    
  }
  private stopRaf() {
    
  }

  stopAudio() {
    this.stopRaf();
    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch {}
      try { this.currentAudio.src = ''; } catch {}
      this.currentAudio = null;
    }
    this.isPlaying = false;
    this.currentTime = 0;
  }

  seekAudio(event: any) {
    if (!this.currentAudio) return;
    const t = Number(event.detail.value ?? 0);
    if (isFinite(t)) {
      this.currentAudio.currentTime = t;
      this.currentTime = Math.round(t * 100) / 100;
      this.cdr.markForCheck();
    }
  }

  formatTime(time: number): string {
    if (!isFinite(time) || isNaN(time) || time < 0) return '0:00';
    const total = Math.floor(time + 0.5);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }

  
  private async presentToast(
    message: string,
    _color: 'success' | 'warning' | 'danger' | 'primary' = 'primary'
  ) {
    // Toasts removed for defense UI consistency (use consistent modals instead).
    await this.confirmService.notify(message);
  }

  // Image Modal Methods
  openImageModal() {
    this.isImageModalOpen = true;
  }

  closeImageModal() {
    this.isImageModalOpen = false;
  }

  // Edit Modal Methods
  openEditModal() {
    if (!this.currentCard) return;
    this.editCardLabel = this.currentCard.label || '';
    this.editCardImage = this.currentCard.image || '';
    this.closeImageModal();
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editCardLabel = '';
    this.editCardImage = '';
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
      };
      reader.readAsDataURL(file);
    }
  }

  async saveCardEdit() {
    if (!this.currentCard) return;

    try {
      // Update in Firebase
      await this.firebaseService.updateStructuredFlashcard(
        this.currentCard.id,
        'custom-category',
        {
          label: this.editCardLabel,
          src: this.editCardImage
        }
      );

      // Update in local storage
      const raw = this.getRawCards();
      const cardIndex = raw.findIndex(c => c.id === this.currentCard!.id);
      if (cardIndex >= 0) {
        raw[cardIndex].label = this.editCardLabel;
        raw[cardIndex].src = this.editCardImage;
        this.saveRawCards(raw);
      }

      // Update current card
      this.currentCard.label = this.editCardLabel;
      this.currentCard.image = this.editCardImage;

      // Reload and close
      await this.loadDisplayCards();
      this.closeEditModal();
      this.presentToast('Changes saved', 'success');

      // Dispatch event
      window.dispatchEvent(new CustomEvent('flashcard-updated', {
        detail: { cardId: this.currentCard.id, category: this.id }
      }));
    } catch (err) {
      console.error('Failed to save edit:', err);
      this.presentToast('Failed to save changes', 'danger');
    }
  }
}
