import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';
import { Location } from '@angular/common';
import type { Unsubscribe } from '@firebase/firestore';
import { ConfirmService } from '../../services/confirm.service';

interface PeopleCard {
  id?: string;
  label?: string;
  image?: string;
  audio?: string;
  duration?: number; 
}

@Component({
  selector: 'app-people',
  templateUrl: './people.page.html',
  styleUrls: ['./people.page.scss'],
  standalone: false
})
export class PeoplePage implements OnInit, OnDestroy {
  peopleCards: PeopleCard[] = [];
  currentCard: PeopleCard | null = null;
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
  
  
  private refreshTimeout: any = null;

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
    this.peopleCards = this.getCards();
    if (this.peopleCards.length > 0) this.setCard(0);

    
    this.attachFlashcardsSubscription();

    
    window.addEventListener('patientMode-changed', this.modeListener);
    
    
    window.addEventListener('user-logged-in', (e: any) => {
      
      this.peopleCards = this.getCards();
      if (this.peopleCards.length > 0) this.setCard(0);
      this.attachFlashcardsSubscription();
    });

    
    window.addEventListener('flashcard-added', (e: any) => {
      
      if (e.detail?.category === 'people') {
        
        
        this.reloadFromLocalStorage();
        
      }
    });
    
    window.addEventListener('flashcard-updated', (e: any) => {
      
      if (e.detail?.category === 'people') {
        
        
        this.reloadFromLocalStorage();
        
      }
    });
  }

  
  async ionViewWillEnter() {
    
    
    
    this.peopleCards = this.getCards();
    
    
    if (this.peopleCards.length === 0) {
      this.currentCard = null;
      this.stopAudio();
      
      
      await this.loadFlashcardsDirectly();
    } else if (!this.currentCard) {
      this.setCard(0);
    } else {
      
      const idx = Math.min(this.currentIndex, this.peopleCards.length - 1);
      this.setCard(idx);
    }
    
    
    if (!this.flashcardsUnsub) {
      this.attachFlashcardsSubscription();
    }
    
    
  }

  ngOnDestroy() {
    window.removeEventListener('patientMode-changed', this.modeListener);
    try { this.flashcardsUnsub?.(); } catch {}
    this.stopAudio();
    this.persistSessionHistory();
    
    
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
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
    return `peopleCards_${uid}_${patientId}`;
  }
  private getCards(): PeopleCard[] {
    try { return JSON.parse(localStorage.getItem(this.storageKey()) || '[]'); }
    catch { return []; }
  }
  private saveCards(cards: PeopleCard[]) {
    localStorage.setItem(this.storageKey(), JSON.stringify(cards));
  }

  private attachFlashcardsSubscription() {
    try {
      this.flashcardsUnsub?.();
      
      
      const user = this.firebaseService.getCurrentUser();
      
      
      if (!user) {
        console.warn(' People page: No authenticated user, cannot load flashcards');
        return;
      }
      
      
      this.flashcardsUnsub = this.firebaseService.subscribeToGameFlashcards((all: any[]) => {
        
        
        
        const people = (all || []).filter((c: any) => (c?.category || '').toLowerCase() === 'people');
        
        
        
        const seen = new Set<string>();
        const mapped = people
          .map((c: any) => ({
            id: c.id,
            label: c.label,
            image: c.src || c.image,
            audio: c.audio || undefined,
            duration: Number(c.duration || 0)
          }))
          .filter((c: any) => {
            const key = `${(c.label||'').toLowerCase()}::${c.image||''}`;
            if (seen.has(key)) return false; seen.add(key); return true;
          });
        
        
        
        
        
        this.saveCards(mapped);
        
        this.peopleCards = mapped;
        if (this.peopleCards.length > 0 && !this.currentCard) this.setCard(0);
        
        
      });
    } catch (e) {
      console.error('Failed to attach flashcards subscription:', e);
    }
  }

  

  
  setCard(index: number) {
    if (this.peopleCards.length === 0) {
      this.currentCard = null;
      this.stopAudio();
      return;
    }
    this.currentIndex = (index + this.peopleCards.length) % this.peopleCards.length;
    this.currentCard = this.peopleCards[this.currentIndex];

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

    

    
    this.currentAudio = new Audio();
    this.currentAudio.src = src;
    this.currentAudio.preload = 'metadata';
    this.currentAudio.crossOrigin = 'anonymous'; 
    this.currentAudio.volume = 1.0; 
    
    
    if ('webkitAudioContext' in window || 'AudioContext' in window) {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContext();
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
        
      } catch (e) {
        console.warn('Could not initialize audio context:', e);
      }
    }
    
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

    
    this.currentAudio.addEventListener('error', (e) => {
      console.error('Audio load error:', e);
      this.isPlaying = false;
      this.stopRaf();
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
      try { 
        this.currentAudio.pause(); 
        this.currentAudio.currentTime = 0;
        this.currentAudio.removeAttribute('src');
        this.currentAudio.load(); 
      } catch {}
      this.currentAudio = null;
    }
    
    
    if (this.audioContext) {
      try {
        this.audioContext.close();
        this.audioContext = null;
        
      } catch (e) {
        console.warn('Could not close audio context:', e);
      }
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
      title: 'Delete person?',
      message: `Remove “${this.currentCard.label || 'this person'}”? This can’t be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      if (this.currentCard?.id) {
        await this.firebaseService.deleteFlashcard(this.currentCard.id, 'people');
      }

      const idx = this.currentIndex;
      const list = this.getCards();
      list.splice(idx, 1);
      this.saveCards(list);
      this.peopleCards = list;

      if (this.peopleCards.length > 0) {
        this.setCard(Math.min(idx, this.peopleCards.length - 1));
      } else {
        this.currentCard = null;
        this.stopAudio();
      }

      await this.confirmService.notify('Person was deleted.', 'Deleted');
    } catch (err) {
      console.error('Failed to delete card:', err);
      await this.confirmService.notify('Could not delete this person. Please try again.', 'Couldn’t delete');
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

      // Update in localStorage
      const uid = this.firebaseService.getCurrentUser()?.uid || 'anon';
      const storageKey = `peopleCards_${uid}`;
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const cardIndex = existing.findIndex((item: any) => item.id === this.currentCard!.id);
      if (cardIndex !== -1) {
        existing[cardIndex].label = this.editCardLabel;
        existing[cardIndex].image = this.editCardImage;
        localStorage.setItem(storageKey, JSON.stringify(existing));
      }

      // Update in Firebase if applicable
      if (this.currentCard.id) {
        await this.firebaseService.updateFlashcard(this.currentCard.id, {
          label: this.editCardLabel,
          image: this.editCardImage
        });
      }

      this.cdr.detectChanges();
      await this.toast('Person updated successfully', 'success');
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

  
  private persistSessionHistory() {
    try {
      const key = 'peopleViewHistory';
      const history: any[] = JSON.parse(localStorage.getItem(key) || '[]');
      history.push({
        endedAt: new Date().toISOString(),
        totalCards: this.peopleCards.length,
        skipCount: this.skipCount,
        skippedCardIds: this.skippedCardIds
      });
      localStorage.setItem(key, JSON.stringify(history));
    } catch {}
  }

  goBack() {
    this.router.navigate(['/memory-categories']);
  }

  
  openImageModal() {
    if (this.currentCard?.image) {
      this.isImageModalOpen = true;
    }
  }

  closeImageModal() {
    this.isImageModalOpen = false;
  }

  
  async debugFirebase() {
    
    
    const user = this.firebaseService.getCurrentUser();
    
    
    if (!user) {
      
      return;
    }
    
    try {
      
      const localCards = this.getCards();
      
      
      
      const allCards = await this.firebaseService.getGameFlashcardsOnce();
      
      
      const peopleCards = allCards.filter(card => card.category.toLowerCase() === 'people');
      
      
      
      
      
      
      await this.refreshData();
      
    } catch (error) {
      console.error(' DEBUG: Error during debug:', error);
    }
  }

  
  async refreshData() {
    
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    
    
    this.refreshTimeout = setTimeout(async () => {
      
      
      
      await this.loadFlashcardsDirectly();
      
      
      if (this.peopleCards.length === 0) {
        
        this.peopleCards = this.getCards();
        if (this.peopleCards.length > 0) {
          this.setCard(0);
          
        } else {
          this.currentCard = null;
          this.stopAudio();
          
        }
      }
      
      
      this.attachFlashcardsSubscription();
      
      
      this.cdr.detectChanges();
      
      
    }, 300); 
  }

  
  reloadFromLocalStorage() {
    
    const previousCount = this.peopleCards.length;
    this.peopleCards = this.getCards();
    
    
    
    if (previousCount !== this.peopleCards.length) {
      if (this.peopleCards.length > 0 && !this.currentCard) {
        this.setCard(0);
      } else if (this.peopleCards.length === 0) {
        this.currentCard = null;
        this.stopAudio();
      }
      
      
      this.cdr.detectChanges();
    }
  }

  
  async loadFlashcardsDirectly() {
    try {
      const user = this.firebaseService.getCurrentUser();
      if (!user) {
        console.warn(' People page: No user for direct loading');
        return;
      }

      
      
      
      const allCards = await this.firebaseService.getGameFlashcardsOnce();
      
      
      
      const peopleCards = allCards.filter(card => card.category.toLowerCase() === 'people');
      
      
      if (peopleCards.length > 0) {
        const mappedCards = peopleCards.map(card => ({
          id: card.id,
          label: card.label,
          image: card.image,
          audio: card.audio,
          duration: card.duration || 0
        }));
        
        
        this.peopleCards = mappedCards;
        this.saveCards(mappedCards);
        if (!this.currentCard) this.setCard(0);
      } else {
        
      }
    } catch (error) {
      console.error(' People page: Direct loading failed:', error);
    }
  }
}


function cryptoRandomId() {
  if ('randomUUID' in crypto) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
