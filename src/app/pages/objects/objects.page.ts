import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { FirebaseService, PATIENT_OWNER_CAREGIVER_LS_KEY } from '../../services/firebase.service';
import { Location } from '@angular/common';
import type { Unsubscribe } from '@firebase/firestore';
import { ConfirmService } from '../../services/confirm.service';


interface ObjectCard {
  id?: string;
  label?: string;
  image?: string;
  audio?: string;
  duration?: number; 
}

@Component({
  selector: 'app-objects',
  templateUrl: './objects.page.html',
  styleUrls: ['./objects.page.scss'],
  standalone: false
})
export class ObjectsPage implements OnInit, OnDestroy {
  objectCards: ObjectCard[] = [];
  currentCard: ObjectCard | null = null;
  currentIndex = 0;

  isPatientMode = false;

  currentAudio: HTMLAudioElement | null = null;
  isPlaying = false;
  currentTime = 0;
  duration = 0;
  private rafId: number | null = null;

  
  skipCount = 0;
  skippedCardIds: string[] = [];

  
  isImageModalOpen = false;

  // Edit modal
  showEditModal = false;
  editCardLabel = '';
  editCardImage = '';
  @ViewChild('editImageInput') editImageInput!: ElementRef<HTMLInputElement>;

  
  private audioContext: AudioContext | null = null;

  private modeListener = (e: any) => {
    this.isPatientMode = !!e?.detail;
  };

  private flashcardsUnsub?: Unsubscribe;

  constructor(
    private router: Router, 
    private alertCtrl: AlertController,
    private firebaseService: FirebaseService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private location: Location
  ) {}


  ngOnInit() {
    this.loadPatientMode();
    this.objectCards = this.getCards();
    if (this.objectCards.length > 0) this.setCard(0);

    
    window.addEventListener('patientMode-changed', this.modeListener);

    
    this.attachFlashcardsSubscription();

    
    window.addEventListener('user-logged-in', (e: any) => {
      
      this.objectCards = this.getCards();
      if (this.objectCards.length > 0) this.setCard(0);
      this.attachFlashcardsSubscription();
    });

    
    window.addEventListener('flashcard-added', (e: any) => {
      
      if (e.detail?.category === 'objects') {
        this.refreshData();
      }
    });
    
    window.addEventListener('flashcard-updated', (e: any) => {
      
      if (e.detail?.category === 'objects') {
        this.refreshData();
      }
    });
  }

  ionViewWillEnter() {
    this.objectCards = this.getCards();
    if (this.objectCards.length === 0) {
      this.currentCard = null;
      this.stopAudio();
    } else if (!this.currentCard) {
      this.setCard(0);
    } else {
      const idx = Math.min(this.currentIndex, this.objectCards.length - 1);
      this.setCard(idx);
    }
  }

  ngOnDestroy() {
    window.removeEventListener('patientMode-changed', this.modeListener);
    try { this.flashcardsUnsub?.(); } catch {}
    this.stopAudio();
    this.persistSessionHistory();
  }

  
  private loadPatientMode() {
    try {
      this.isPatientMode = localStorage.getItem('patientMode') === 'true';
    } catch { this.isPatientMode = false; }
  }

  
  private storageKey(): string {
    const user = this.firebaseService.getCurrentUser();
    const uid = user ? user.uid : 'anon';
    // Include patient ID in cache key to ensure data isolation
    const patientId = localStorage.getItem('selectedPatientId') || uid;
    return `objectsCards_${uid}_${patientId}`;
  }
  private getCards(): ObjectCard[] {
    try { return JSON.parse(localStorage.getItem(this.storageKey()) || '[]'); }
    catch { return []; }
  }
  private saveCards(cards: ObjectCard[]) {
    localStorage.setItem(this.storageKey(), JSON.stringify(cards));
  }

  

  
  setCard(index: number) {
    if (this.objectCards.length === 0) {
      this.currentCard = null;
      this.stopAudio();
      return;
    }
    this.currentIndex = (index + this.objectCards.length) % this.objectCards.length;
    this.currentCard = this.objectCards[this.currentIndex];

    const storedDur = Number(this.currentCard?.duration ?? 0);
    this.buildPlayer(this.currentCard?.audio, storedDur);
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

  
  private buildPlayer(src?: string, storedDuration?: number) {
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
    this.isPlaying = false;
    this.currentTime = 0;

    if (storedDuration && isFinite(storedDuration) && storedDuration > 0) {
      this.duration = storedDuration;
    } else {
      this.duration = 0;
    }

    this.currentAudio.addEventListener('loadedmetadata', () => {
      const metaDur = Number(this.currentAudio?.duration || 0);
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

  

  async deleteCurrentCard() {
    if (!this.currentCard) return;

    const ok = await this.confirmService.confirm({
      title: 'Delete object?',
      message: `Remove “${this.currentCard.label || 'this item'}”? This can’t be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      const deletedId = this.currentCard?.id;
      if (this.currentCard?.id) {
        await this.firebaseService.deleteFlashcard(this.currentCard.id, 'objects');
      }

      const idx = this.currentIndex;
      const list = this.getCards();
      list.splice(idx, 1);
      this.saveCards(list);
      this.objectCards = list;

      if (this.objectCards.length > 0) {
        this.setCard(Math.min(idx, this.objectCards.length - 1));
      } else {
        this.currentCard = null;
        this.stopAudio();
      }

      window.dispatchEvent(
        new CustomEvent('card-deleted', { detail: { cardId: deletedId, category: 'objects' } })
      );
      await this.confirmService.notify('Object was deleted.', 'Deleted');
    } catch (err) {
      console.error('Failed to delete card:', err);
      await this.confirmService.notify('Could not delete this object. Please try again.', 'Couldn’t delete');
    }
  }

  async editCurrentCard() {
    if (!this.currentCard) return;
    this.openEditModal();
  }

  openEditModal() {
    if (!this.currentCard) return;
    this.editCardLabel = this.currentCard.label || '';
    this.editCardImage = this.currentCard.image || '';
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
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  async saveCardEdit() {
    if (!this.currentCard) return;

    try {
      this.currentCard.label = this.editCardLabel;
      this.currentCard.image = this.editCardImage;

      const uid = this.firebaseService.getCurrentUser()?.uid || 'anon';
      const storageKey = `objectsCards_${uid}`;
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const cardIndex = existing.findIndex((item: any) => item.id === this.currentCard!.id);
      if (cardIndex !== -1) {
        existing[cardIndex].label = this.editCardLabel;
        existing[cardIndex].image = this.editCardImage;
        localStorage.setItem(storageKey, JSON.stringify(existing));
      }

      if (this.currentCard.id) {
        await this.firebaseService.updateFlashcard(this.currentCard.id, {
          label: this.editCardLabel,
          image: this.editCardImage
        });
      }

      this.cdr.detectChanges();
      await this.toast('Object updated successfully', 'success');
      this.closeEditModal();
      this.closeImageModal();
    } catch (err) {
      console.error('Failed to update card:', err);
      await this.toast('Failed to update', 'danger');
    }
  }

  private async toast(message: string, _color: string = 'primary') {
    await this.confirmService.notify(message);
  }

  goBack() {
    this.router.navigate(['/memory-categories']);
  }

  
  private persistSessionHistory() {
    try {
      const key = 'objectsViewHistory';
      const history: any[] = JSON.parse(localStorage.getItem(key) || '[]');
      history.push({
        endedAt: new Date().toISOString(),
        totalCards: this.objectCards.length,
        skipCount: this.skipCount,
        skippedCardIds: this.skippedCardIds
      });
      localStorage.setItem(key, JSON.stringify(history));
    } catch {}
  }

  private attachFlashcardsSubscription() {
    try {
      this.flashcardsUnsub?.();
      
      this.flashcardsUnsub = (this.firebaseService as any).subscribeToGameFlashcards?.(async (all: any[]) => {
        const objs = (all || []).filter((c: any) => (c?.category || '').toLowerCase() === 'objects');
        const seen = new Set<string>();
        const mapped = objs
          .map((c: any) => ({ id: c.id, label: c.label, image: c.src || c.image, audio: c.audio || undefined, duration: Number(c.duration || 0) }))
          .filter((c: any) => { const key = `${(c.label||'').toLowerCase()}::${c.image||''}`; if (seen.has(key)) return false; seen.add(key); return true; });
        
        
        this.saveCards(mapped);
        
        this.objectCards = mapped;
        if (this.objectCards.length > 0 && !this.currentCard) this.setCard(0);
        
        
      });
    } catch (e) {
      console.error('Failed to attach flashcards subscription:', e);
    }
  }

  
  openImageModal() {
    if (this.currentCard?.image) {
      this.isImageModalOpen = true;
    }
  }

  closeImageModal() {
    this.isImageModalOpen = false;
  }

  
  async refreshData() {
    
    this.objectCards = this.getCards();
    if (this.objectCards.length > 0) {
      this.setCard(0);
    } else {
      this.currentCard = null;
      this.stopAudio();
    }
    this.attachFlashcardsSubscription();
    
    
    if (this.objectCards.length === 0) {
      
      await this.loadFlashcardsDirectly();
    }
  }

  
  async loadFlashcardsDirectly() {
    try {
      const user = this.firebaseService.getCurrentUser();
      if (!user) {
        console.warn(' Objects page: No user for direct loading');
        return;
      }

      
      
      
      const { getDocs, collection, query, orderBy } = await import('@angular/fire/firestore');
      const { getFirestore } = await import('@angular/fire/firestore');
      
      const firestore = getFirestore();
      const uid = this.firebaseService.getCurrentUser()?.uid;
      if (!uid) return;
      const owner = localStorage.getItem(PATIENT_OWNER_CAREGIVER_LS_KEY);
      const cgId = (owner && owner.trim()) || uid;
      // Get selected patient ID from localStorage, fallback to caregiver's own ID
      const selectedPatientId = localStorage.getItem('selectedPatientId') || uid;
      const pid = selectedPatientId;
      if (!pid) return;
      const objectsRef = collection(firestore, 'caregiver', cgId, 'patients', pid, 'userFlashcards', 'objects', 'cards');
      const q = query(objectsRef, orderBy('createdAt', 'desc'));
      
      const snapshot = await getDocs(q);
      const cards = snapshot.docs.map(doc => ({
        id: doc.id,
        label: doc.data()['label'],
        image: doc.data()['src'] || doc.data()['image'],
        audio: doc.data()['audio'],
        duration: doc.data()['duration'] || 0
      }));

      
      
      if (cards.length > 0) {
        this.objectCards = cards;
        this.saveCards(cards);
        if (!this.currentCard) this.setCard(0);
      }
    } catch (error) {
      console.error(' Objects page: Direct loading failed:', error);
    }
  }
}
