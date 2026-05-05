import { Component, ViewChild, ElementRef, ChangeDetectorRef, OnInit } from '@angular/core';
import { Platform, ModalController, NavController, AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { MediaService } from '../services/media.service';
import { FirebaseService } from '../services/firebase.service';


import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

type UUID = string;

interface UserCategory {
  id: UUID;
  name: string;
  description?: string;
  emoji?: string;
  createdAt: number;
}

type BuiltinCat = 'people' | 'objects' | 'places';

interface BuiltinCard {
  id: string; 
  label: string;
  image: string | null;
  audio: string | null;
  duration: number;
}

const CATEGORIES_KEY = 'alala_custom_categories_v1';
const CARDS_PREFIX   = 'alala_cards_';
const MAX_RECORDING_TIME = 60; 


const FS_BASE64: any = ((): any => {
  try {
    
    
    if (Encoding && (Encoding as any).BASE64) return (Encoding as any).BASE64;
  } catch {}
  
  return 'base64';
})();

@Component({
  selector: 'app-add-flashcard',
  templateUrl: './add-flashcard.page.html',
  styleUrls: ['./add-flashcard.page.scss'],
  standalone: false,
})
export class AddFlashcardPage implements OnInit {
  name = '';
  image: string | null = null;
  audio: string | null = null;

  
  category: BuiltinCat = 'people';

  
  activeTarget: 'builtin' | 'custom' = 'builtin';
  customCategories: UserCategory[] = [];
  selectedCustomCategoryId: string | null = null;

  
  defaultCategoryId: string | null = null;
  defaultCategoryName: string | null = null;

  fromCategoryMatch = false;
  categorySelectOptions: { key: string; label: string }[] = [];
  selectedCategoryKey: string | null = null;
  
  isEditMode = false;
  editCardId: string | null = null;

  isRecording = false;
  recordingTime = '00:00';
  recordingLimitReached = false;
  private recordingInterval: any;
  private recordingStartTime = 0;

  isPlaying = false;
  currentTime = 0;
  audioDuration: number = 0;

  isSaving = false;

  @ViewChild('audioPlayer', { static: false }) audioPlayer!: ElementRef<HTMLAudioElement>;

  constructor(
    private platform: Platform,
    private modalCtrl: ModalController,
    private nav: NavController,
    public  mediaService: MediaService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute,
    private firebaseService: FirebaseService,
    private alertCtrl: AlertController
  ) {}

  ngOnInit() {
    const st = (this.router.getCurrentNavigation()?.extras?.state || {}) as any;
    const stateId: string | undefined = st.defaultCategoryId;
    const stateName: string | undefined = st.defaultCategoryName;
    const qpId = this.route.snapshot.queryParamMap.get('defaultCategoryId') || undefined;
    const qpBuiltin = this.route.snapshot.queryParamMap.get('defaultCategory');
    const qpEditCardId = this.route.snapshot.queryParamMap.get('editCardId') || undefined;
    const qpEditLabel = this.route.snapshot.queryParamMap.get('editLabel') || undefined;
    const qpEditImage = this.route.snapshot.queryParamMap.get('editImage') || undefined;
    const qpEditAudio = this.route.snapshot.queryParamMap.get('editAudio') || undefined;
    const qpEditDuration = this.route.snapshot.queryParamMap.get('editDuration') || undefined;

    this.defaultCategoryId = (stateId || qpId || null);
    this.defaultCategoryName = stateName || null;

    this.fromCategoryMatch = this.route.snapshot.queryParamMap.get('from') === 'category-match';

    
    this.customCategories = this.getAllCategories();

    
    if (this.defaultCategoryId && this.customCategories.some(c => c.id === this.defaultCategoryId)) {
      this.activeTarget = 'custom';
      this.selectedCustomCategoryId = this.defaultCategoryId;
      console.log(' Set to custom category:', this.defaultCategoryId, this.customCategories.find(c => c.id === this.defaultCategoryId)?.name);
    } else if (qpBuiltin && ['people','objects','places'].includes(qpBuiltin)) {
      this.activeTarget = 'builtin';
      this.category = qpBuiltin as BuiltinCat;
      console.log(' Set to builtin category:', qpBuiltin);
    }

    
    if (qpEditCardId || qpEditLabel) {
      this.isEditMode = true;
      this.editCardId = qpEditCardId || null;
      this.name = qpEditLabel || '';
      
      
      if (qpEditImage || qpEditAudio) {
        
        this.image = qpEditImage || null;
        this.audio = qpEditAudio || null;
        this.audioDuration = qpEditDuration ? Number(qpEditDuration) : 0;
        console.log('️ Edit mode: Loaded data from query params', {
          name: this.name,
          hasImage: !!this.image,
          hasAudio: !!this.audio,
          duration: this.audioDuration
        });
      } else {
        
        this.loadExistingCardData();
      }
    }

    this.setupCategorySelectOptions();
  }

  private setupCategorySelectOptions() {
    if (!this.fromCategoryMatch) return;

    const opts: { key: string; label: string }[] = [];

    const builtinOrder: BuiltinCat[] = ['people', 'places', 'objects'];
    builtinOrder.forEach(cat => {
      opts.push({
        key: `builtin:${cat}`,
        label: cat.charAt(0).toUpperCase() + cat.slice(1)
      });
    });

    this.customCategories.forEach(c => {
      opts.push({
        key: `custom:${c.id}`,
        label: c.name
      });
    });

    this.categorySelectOptions = opts;

    let currentKey: string | null = null;
    if (this.activeTarget === 'custom' && this.selectedCustomCategoryId) {
      currentKey = `custom:${this.selectedCustomCategoryId}`;
    } else {
      currentKey = `builtin:${this.category}`;
    }

    if (!opts.some(o => o.key === currentKey) && opts.length) {
      currentKey = opts[0].key;
    }

    this.selectedCategoryKey = currentKey;
  }

  onCategorySelectChange(key: string) {
    this.selectedCategoryKey = key;
    if (!key) return;

    if (key.startsWith('builtin:')) {
      const cat = key.split(':')[1] as BuiltinCat;
      if (['people', 'objects', 'places'].includes(cat)) {
        this.activeTarget = 'builtin';
        this.category = cat;
        this.selectedCustomCategoryId = null;
      }
      return;
    }

    if (key.startsWith('custom:')) {
      const id = key.split(':')[1];
      this.activeTarget = 'custom';
      this.selectedCustomCategoryId = id || null;
    }
  }

  
  private async safeDismiss(result?: any): Promise<void> {
    try {
      const top = await this.modalCtrl.getTop();
      if (top) {
        await top.dismiss(result);
      } else {
        this.nav.back();
      }
    } catch {
      this.nav.back();
    }
  }
  public closeModal(result?: any): Promise<void> {
    return this.safeDismiss(result);
  }

  
  private loadExistingCardData() {
    if (!this.editCardId) return;

    
    if (this.defaultCategoryId) {
      const key = this.cardsKeyFor(this.defaultCategoryId);
      const existingCustom = this.safeGetArray<any>(key);
      const existingCard = existingCustom.find((card: any) => card.id === this.editCardId);
      
      if (existingCard) {
        this.image = existingCard.src || null;
        this.audio = existingCard.audio || null;
        this.audioDuration = existingCard.duration || 0;
        
        this.activeTarget = 'custom';
        this.selectedCustomCategoryId = this.defaultCategoryId;
        return;
      }
    }

    
    if (this.activeTarget !== 'custom') {
      const builtinCategories = ['people', 'objects', 'places'];
      for (const cat of builtinCategories) {
        const storageKey = `${cat}Cards` as const;
        const user = this.firebaseService.getCurrentUser();
        const uid = user ? user.uid : 'anon';
        const scopedKey = `${storageKey}_${uid}`;
        const existing = this.safeGetArray<any>(scopedKey);
        const existingCard = existing.find((card: any) => card.id === this.editCardId);
        
        if (existingCard) {
          this.image = existingCard.image || null;
          this.audio = existingCard.audio || null;
          this.audioDuration = existingCard.duration || 0;
          this.category = cat as BuiltinCat;
          this.activeTarget = 'builtin';
          return;
        }
      }
    }
  }

  
  private getAllCategories(): UserCategory[] {
    try {
      const user = this.firebaseService.getCurrentUser();
      const userSpecificKey = user ? `${CATEGORIES_KEY}_${user.uid}` : CATEGORIES_KEY;
      const raw = localStorage.getItem(userSpecificKey);
      return raw ? (JSON.parse(raw) as UserCategory[]) : [];
    } catch {
      return [];
    }
  }

  private cardsKeyFor(id: string): string {
    return `${CARDS_PREFIX}${id}`;
  }

  
  selectTarget(t: 'builtin' | 'custom') {
    this.activeTarget = t;
    if (t === 'builtin') {
      this.selectedCustomCategoryId = null;
    } else {
      if (!this.selectedCustomCategoryId && this.customCategories.length > 0) {
        this.selectedCustomCategoryId = this.customCategories[0].id;
      }
    }
  }

  selectCustomCategory(id: string) {
    this.activeTarget = 'custom';
    this.selectedCustomCategoryId = id;
  }

  clearCustomSelection() {
    if (this.activeTarget !== 'builtin') this.activeTarget = 'builtin';
    this.selectedCustomCategoryId = null;
  }

  
  async takePhoto() {
    try { 
      this.image = await this.mediaService.takePhoto(); 
      console.log(' Photo taken successfully');
    }
    catch (e) { 
      console.error(' Photo capture failed:', e); 
      alert('Failed to take a photo. Please try again.'); 
    }
  }
  async selectImage() {
    try { 
      this.image = await this.mediaService.chooseFromGallery(); 
      console.log(' Image selected successfully');
    }
    catch (e) { 
      console.error(' Image selection failed:', e); 
      alert('Failed to select image. Please try again.'); 
    }
  }

  
  async selectAudio() {
    try {
      console.log('Starting audio file selection...');
      const asset = await this.mediaService.pickAudioFile();
      console.log('Audio file selected:', asset);
      
      if (asset && (asset as any).base64) {
        this.audio = (asset as any).base64; 
        console.log('Using base64 data URL');
      } else if (asset?.url?.startsWith('blob:')) {
        console.log('Converting blob URL to data URL');
        this.audio = await this.blobUrlToDataUrl(asset.url);
      } else {
        this.audio = asset.url;
        console.log('Using direct URL:', asset.url);
      }
      
      console.log('Audio set, updating duration...');
      await this.updateAccurateDuration(this.audio!);
      console.log('Audio duration updated:', this.audioDuration);
      
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Audio selection failed:', err);
      alert(`Audio selection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  private async blobUrlToDataUrl(blobUrl: string): Promise<string> {
    const res = await fetch(blobUrl);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  
  async recordAudio() {
    console.log(' recordAudio called, isRecording:', this.isRecording);
    
    if (this.isRecording) {
      try {
        console.log(' Stopping recording...');
        clearInterval(this.recordingInterval);
        const stopAt = Date.now();
        const url = await this.mediaService.stopRecording();

        this.isRecording = false;
        this.recordingLimitReached = false;
        this.recordingTime = '00:00';
        this.audio = url;

        const measured = (stopAt - this.recordingStartTime) / 1000;
        await this.updateAccurateDuration(this.audio, measured);
        console.log(' Recording stopped successfully, duration:', measured);
      } catch (e) {
        console.error(' Error stopping recording:', e);
        this.isRecording = false;
        this.recordingLimitReached = false;
        this.recordingTime = '00:00';
      }
      return;
    }
    
    try {
      console.log(' Starting recording...');
      
      
      if (this.audioPlayer && this.isPlaying) {
        this.audioPlayer.nativeElement.pause();
        this.isPlaying = false;
        console.log(' Stopped playing audio before recording');
      }
      
      await this.mediaService.recordAudio();
      this.isRecording = true;
      this.recordingLimitReached = false;
      this.recordingStartTime = Date.now();
      console.log(' Recording started successfully');
      
      this.recordingInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);

        
        if (elapsed >= 50 && !this.recordingLimitReached) {
          this.recordingLimitReached = true;
          console.warn('Recording approaching 60-second limit');
        }

        
        if (elapsed >= MAX_RECORDING_TIME) {
          clearInterval(this.recordingInterval);
          this.recordAudio(); 
          
          const alert = this.alertCtrl.create({
            header: 'Recording Complete',
            message: 'Recording stopped automatically at 60 seconds maximum.',
            buttons: ['OK']
          });
          alert.then(alert => alert.present());
          return;
        }

        const mm = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const ss = (elapsed % 60).toString().padStart(2, '0');
        this.recordingTime = `${mm}:${ss}`;
      }, 250);
    } catch (e) {
      console.error(' Error starting recording:', e);
      this.isRecording = false;
      this.recordingLimitReached = false;
      this.recordingTime = '00:00';
      
      
      const alert = await this.alertCtrl.create({
        header: 'Recording Error',
        message: 'Unable to start recording. Please check microphone permissions and try again.',
        buttons: ['OK']
      });
      await alert.present();
    }
  }

  startNewRecording() {
    this.audio = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.audioDuration = 0;
    this.recordAudio();
  }

  
  togglePlayback() {
    if (!this.audioPlayer) return;
    const el = this.audioPlayer.nativeElement;
    if (this.isPlaying) {
      el.pause();
      this.isPlaying = false;
    } else {
      el.play().then(() => this.isPlaying = true).catch(err => {
        console.error('Audio play failed:', err);
        this.isPlaying = false;
      });
    }
  }
  seekAudio(ev: any) {
    if (!this.audioPlayer) return;
    const t = Number(ev.detail.value ?? 0);
    if (isFinite(t)) this.audioPlayer.nativeElement.currentTime = t;
  }
  onAudioLoaded() {
    const d = this.audioPlayer?.nativeElement?.duration ?? 0;
    if (isFinite(d) && d > 0) { this.audioDuration = d; this.cdr.markForCheck(); }
  }
  onTimeUpdate() {
    if (this.audioPlayer) {
      const t = this.audioPlayer.nativeElement.currentTime;
      this.currentTime = isFinite(t) ? t : 0;
    }
  }
  onAudioEnded() {
    this.isPlaying = false;
    this.currentTime = 0;
    if (this.audioPlayer) this.audioPlayer.nativeElement.currentTime = 0;
  }
  onAudioPause() { this.isPlaying = false; }
  onAudioPlay()  { this.isPlaying = true;  }
  removeAudio() {
    this.audio = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.audioDuration = 0;
  }
  formatTime(n: number) {
    if (!isFinite(n) || isNaN(n) || n < 0) return '00:00';
    const m = Math.floor(n / 60);
    const s = Math.floor(n % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  
  private async showAudioDurationError() {
    const alert = await this.alertCtrl.create({
      header: 'Audio Too Long',
      message: 'Audio files must be 60 seconds or less. Please select a shorter audio file.',
      buttons: ['OK'],
      cssClass: 'audio-duration-alert'
    });
    await alert.present();
  }

  
  private async updateAccurateDuration(url: string, measuredSeconds?: number) {
    const decoded = await this.tryDecodeDuration(url);
    if (decoded && isFinite(decoded) && decoded > 0) {
      this.audioDuration = decoded;
    } else {
      const meta = await this.computeDetachedDuration(url);
      this.audioDuration = meta ?? 0;
    }
    if (measuredSeconds && isFinite(this.audioDuration)) {
      if (measuredSeconds - this.audioDuration > 0.25) {
        this.audioDuration = Math.max(this.audioDuration, measuredSeconds);
      }
    }

    
    if (this.audioDuration > 60) {
      this.showAudioDurationError();
      
      this.audio = null;
      this.audioDuration = 0;
      return;
    }
  }

  private async tryDecodeDuration(url: string): Promise<number | null> {
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const decode = (data: ArrayBuffer) =>
        new Promise<AudioBuffer>((resolve, reject) => {
          const ret = (ctx as any).decodeAudioData(
            data,
            (b: AudioBuffer) => resolve(b),
            (e: any) => reject(e)
          );
          if (ret && typeof (ret as Promise<AudioBuffer>).then === 'function') {
            (ret as Promise<AudioBuffer>).then(resolve).catch(reject);
          }
        });
      const audioBuffer = await decode(buf);
      const dur = audioBuffer?.duration ?? 0;
      try { ctx.close(); } catch {}
      return dur && isFinite(dur) ? dur : null;
    } catch {
      return null;
    }
  }

  private async computeDetachedDuration(url: string): Promise<number | null> {
    return new Promise<number | null>((resolve) => {
      const el = new Audio();
      el.preload = 'metadata';
      el.src = url;
      const cleanup = () => { el.src = ''; };
      el.onloadedmetadata = () => {
        if (isFinite(el.duration) && el.duration > 0) {
          const d = el.duration; cleanup(); resolve(d);
        } else {
          el.onseeked = () => {
            const d = isFinite(el.duration) ? el.duration : 0;
            cleanup(); resolve(d || null);
          };
          try { el.currentTime = 1e6; }
          catch { cleanup(); resolve(null); }
        }
      };
      el.onerror = () => { cleanup(); resolve(null); };
    });
  }

  
  private async shrinkDataUrl(dataUrl: string, maxDim = 1280, quality = 0.8): Promise<string> {
    if (!dataUrl.startsWith('data:image/')) return dataUrl;

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });

    let { width, height } = img;
    if (width <= maxDim && height <= maxDim) return dataUrl;

    const ratio = width / height;
    if (width > height) {
      width = maxDim; height = Math.round(width / ratio);
    } else {
      height = maxDim; width = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality) || dataUrl;
  }

  private dataUrlToBase64(dataUrl: string): string {
    const i = dataUrl.indexOf(',');
    return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  }

  private async persistDataUrlToFilesystem(dataUrl: string, prefix: 'img' | 'aud', fallbackExt: string): Promise<string> {
    try {
      const match = /^data:([^;]+)/.exec(dataUrl);
      const mime = match?.[1] || '';
      const extFromMime =
        mime.includes('jpeg') ? 'jpg' :
        mime.includes('jpg')  ? 'jpg' :
        mime.includes('png')  ? 'png' :
        mime.includes('webp') ? 'webp' :
        mime.includes('ogg')  ? 'ogg' :
        mime.includes('webm') ? 'webm' :
        mime.includes('mp3')  ? 'mp3' :
        mime.includes('m4a')  ? 'm4a' :
        mime.includes('aac')  ? 'aac' : fallbackExt;

      const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.${extFromMime}`;
      
      
      const dataToWrite = prefix === 'img' ? await this.shrinkDataUrl(dataUrl) : dataUrl;
      const base64 = this.dataUrlToBase64(dataToWrite);

      
      const write = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Data,
        encoding: FS_BASE64 as any,
        recursive: true
      } as any);

      return Capacitor.convertFileSrc((write as any).uri || (write as any).path || '');
    } catch (e) {
      console.warn('persistDataUrlToFilesystem failed; trying tiny fallback', e);
      if (prefix === 'img') {
        try {
          const tiny = await this.shrinkDataUrl(dataUrl, 640, 0.7);
          const base64 = this.dataUrlToBase64(tiny);
          const fallbackName = `${prefix}_tiny_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
          const writeTiny = await Filesystem.writeFile({
            path: fallbackName,
            data: base64,
            directory: Directory.Data,
            encoding: FS_BASE64 as any,
            recursive: true
          } as any);
          return Capacitor.convertFileSrc((writeTiny as any).uri || (writeTiny as any).path || '');
        } catch (e2) {
          console.error('Tiny image fallback failed; using original data URL', e2);
          return dataUrl; 
        }
      }
      
      return dataUrl;
    }
  }

  private async ensurePersistentSrc(src: string | null, prefix: 'img' | 'aud', fallbackExt: string): Promise<string | null> {
    if (!src) return null;

    // For images, always use DataUrl (base64) for reliable persistence across app restarts
    if (prefix === 'img' && src.startsWith('data:image/')) {
      // Shrink the image to reduce storage size but keep as DataUrl
      return await this.shrinkDataUrl(src, 1280, 0.8);
    }

    if (prefix === 'img' && src.startsWith('blob:')) {
      try {
        const blob = await fetch(src).then(r => r.blob());
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result as string);
          fr.onerror = () => reject(new Error('read blob'));
          fr.readAsDataURL(blob);
        });
        return await this.shrinkDataUrl(dataUrl, 1280, 0.8);
      } catch (e) {
        console.warn('Could not convert blob image to data URL', e);
        return null;
      }
    }

    // For audio, keep as DataUrl if it's already base64
    if (prefix === 'aud' && src.startsWith('data:')) {
      return src;
    }

    // If already a persistent URL, keep it
    if (/^(https?:|capacitor:|file:)/i.test(src)) return src;

    return src;
  }

  
  private safeGetArray<T = any>(key: string): T[] {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]') as T[];
    } catch {
      return [];
    }
  }

  private async normalizeMedia(list: BuiltinCard[]): Promise<BuiltinCard[]> {
    const out: BuiltinCard[] = [];
    for (const item of list) {
      const normImage = item.image ? await this.ensurePersistentSrc(item.image, 'img', 'jpg') : null;
      const normAudio = item.audio ? await this.ensurePersistentSrc(item.audio, 'aud', 'm4a') : null;
      out.push({
        id: item.id || `migrated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, 
        label: item.label,
        image: normImage || null,
        audio: normAudio || null,
        duration: Number(item.duration || 0)
      });
    }
    return out;
  }

  private trySaveWithTrim(key: string, arr: any[], minKeep = 1): void {
    let copy = arr.slice();
    while (copy.length >= minKeep) {
      try {
        localStorage.setItem(key, JSON.stringify(copy));
        return;
      } catch (e) {
        copy.splice(0, Math.min(3, copy.length - minKeep));
        if (copy.length < minKeep) break;
      }
    }
    try {
      const lastOne = arr.slice(-minKeep);
      localStorage.setItem(key, JSON.stringify(lastOne));
    } catch (e2) {
      console.error('Still cannot save after trimming. Storage is full.', e2);
      throw e2;
    }
  }

  
  private async persistAudioLocally(audioDataUrl: string): Promise<string> {
    
    

    
    if (!audioDataUrl.startsWith('data:')) {
      return audioDataUrl;
    }

    
    
    return audioDataUrl;
  }

  
  async saveFlashcard() {
    if (this.isSaving) return;
    
    console.log(' Starting save process...');
    console.log(' Name:', this.name);
    console.log(' Image exists:', !!this.image);
    console.log(' Audio exists:', !!this.audio);
    console.log(' Category:', this.category);
    console.log(' Active target:', this.activeTarget);
    console.log(' Is edit mode:', this.isEditMode);
    
    
    if (!this.name || this.name.trim().length === 0) {
      await this.showAlert('Missing Information', 'Please enter a name for the flashcard.');
      return;
    }
    
    if (!this.isEditMode && !this.image) {
      await this.showAlert('Missing Photo', 'Please select a photo for the flashcard.');
      return;
    }
    
    if (this.activeTarget === 'custom' && !this.selectedCustomCategoryId) {
      await this.showAlert('Missing Category', 'Please choose one of your categories.');
      return;
    }

    this.isSaving = true;

    try {
      
      let imageSrc: string | null = null;
      if (this.image) {
        console.log(' Processing image...');
        imageSrc = await this.ensurePersistentSrc(this.image, 'img', 'jpg');
        console.log(' Image processed successfully');
      }

      
      let audioSrc: string | null = null;
      if (this.audio) {
        console.log(' Processing audio...');
        if (this.audio.startsWith('data:')) {
          audioSrc = this.audio;
        } else {
          audioSrc = await this.ensurePersistentSrc(this.audio, 'aud', 'm4a');
        }
        console.log(' Audio processed successfully');
      }

      
      const structuredCategory =
        this.activeTarget === 'custom' ? 'custom-category' : this.category;

      const flashcardData: any = {
        type: 'photo' as const,
        label: this.name.trim(),
        audio: audioSrc || null,
        duration: this.audio ? this.audioDuration : 0,
        category: structuredCategory
      };

      if (imageSrc !== null) {
        flashcardData.src = imageSrc;
      } else if (this.image) {
        await this.showAlert(
          'Save Failed',
          'Could not process the photo. Please try another image or take a new photo.'
        );
        return;
      }

      
      if (this.activeTarget === 'custom' && this.selectedCustomCategoryId) {
        flashcardData.categoryId = this.selectedCustomCategoryId;
      }

      console.log(' Saving to Firebase:', flashcardData);
      
      let cardId: string;
      
      if (this.isEditMode && this.editCardId) {
        
        console.log('️ Updating existing flashcard with ID:', this.editCardId);
        await this.firebaseService.updateStructuredFlashcard(
          this.editCardId,
          structuredCategory,
          flashcardData
        );
        cardId = this.editCardId;
        console.log(' Flashcard updated in Firebase');
      } else {
        
        cardId = await this.firebaseService.createFlashcard(flashcardData);
        console.log(' Flashcard saved to Firebase with ID:', cardId);
      }

      
      await this.saveToLocalStorage(imageSrc, audioSrc, cardId);

      
      this.dispatchFlashcardEvent(cardId, imageSrc, audioSrc);

      
      await this.showAlert('Success!', 'Flashcard saved successfully!');

      
      await this.navigateBack();

    } catch (error) {
      console.error(' Save flashcard error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await this.showAlert('Save Failed', `Failed to save flashcard: ${errorMessage}. Please check your internet connection and try again.`);
    } finally {
      this.isSaving = false;
    }
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }

  private async saveToLocalStorage(imageSrc: string | null, audioSrc: string | null, cardId: string): Promise<void> {
    try {
      const user = this.firebaseService.getCurrentUser();
      const uid = user ? user.uid : 'anon';
      
      if (this.activeTarget === 'builtin') {
        const storageKey = `${this.category}Cards_${uid}`;
        const existing = this.safeGetArray<BuiltinCard>(storageKey);
        
        const cardData: BuiltinCard = {
          id: cardId,
          label: this.name,
          image: imageSrc,
          audio: audioSrc || null,
          duration: this.audio ? this.audioDuration : 0
        };
        
        if (this.isEditMode && this.editCardId) {
          
          const index = existing.findIndex(card => card.id === this.editCardId);
          if (index !== -1) {
            existing[index] = cardData;
            console.log('️ Updated existing card in local storage');
          } else {
            
            existing.unshift(cardData);
            console.log(' Added card as new (not found in existing)');
          }
        } else {
          
          existing.unshift(cardData);
          console.log(' Added new card to local storage');
        }
        
        this.trySaveWithTrim(storageKey, existing, 1);
        console.log(' Saved to local storage:', storageKey);
      } else if (this.selectedCustomCategoryId) {
        const key = this.cardsKeyFor(this.selectedCustomCategoryId);
        const existing = this.safeGetArray<any>(key);
        
        const customCard = {
          id: cardId,
          categoryId: this.selectedCustomCategoryId,
          type: 'photo' as const,
          src: imageSrc,
          label: this.name,
          audio: audioSrc || null,
          duration: this.audio ? this.audioDuration : 0,
          createdAt: this.isEditMode ? existing.find(c => c.id === cardId)?.createdAt || Date.now() : Date.now()
        };
        
        if (this.isEditMode && this.editCardId) {
          
          const index = existing.findIndex(card => card.id === this.editCardId);
          if (index !== -1) {
            existing[index] = customCard;
            console.log('️ Updated existing custom card in local storage');
          } else {
            
            existing.unshift(customCard);
            console.log(' Added custom card as new (not found in existing)');
          }
        } else {
          
          existing.unshift(customCard);
          console.log(' Added new custom card to local storage');
        }
        
        this.trySaveWithTrim(key, existing, 1);
        console.log(' Saved to custom category local storage:', key);
      }
    } catch (error) {
      console.warn('Failed to save to local storage:', error);
    }
  }

  private async navigateBack(): Promise<void> {
    try {
      if (this.activeTarget === 'builtin') {
        const dest = this.category === 'people' ? '/people' : 
                    this.category === 'objects' ? '/objects' : '/places';
        await this.safeDismiss();
        this.router.navigate([dest]);
      } else if (this.selectedCustomCategoryId) {
        await this.safeDismiss();
        this.router.navigate(['/category', this.selectedCustomCategoryId]);
      } else {
        await this.closeModal();
      }
    } catch (error) {
      console.warn('Navigation error:', error);
      await this.closeModal();
    }
  }

  private dispatchFlashcardEvent(cardId: string, imageSrc: string | null, audioSrc: string | null): void {
    try {
      const eventData = {
        kind: this.activeTarget === 'custom' ? 'custom' : 'builtin',
        category: this.activeTarget === 'custom' ? 'custom-category' : this.category,
        customCategoryId: this.activeTarget === 'custom' ? this.selectedCustomCategoryId : undefined,
        card: {
          id: cardId,
          label: this.name,
          image: imageSrc,
          audio: audioSrc,
          duration: this.audio ? this.audioDuration : 0,
          createdAt: Date.now()
        }
      };

      const eventName = this.isEditMode ? 'flashcard-updated' : 'flashcard-added';
      console.log(` Dispatching ${eventName} event:`, eventData);
      window.dispatchEvent(new CustomEvent(eventName, { detail: eventData }));
      console.log(' Event dispatched successfully');
    } catch (error) {
      console.warn('Failed to dispatch flashcard event:', error);
    }
  }
}
