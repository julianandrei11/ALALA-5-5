/**
 * VIDEO MEMORIES PAGE
 * 
 * Displays and manages the user's video memories.
 * Videos are uploaded to Cloudinary (cloud storage) and metadata is stored in Firebase.
 * 
 * FLOW:
 * 1. Page loads → subscribe to Firebase for the video list
 * 2. Firebase returns video metadata (URLs, titles, thumbnails)
 * 3. Videos are displayed in a scrollable gallery grid
 * 4. The user can add/edit/delete videos
 * 5. Cloudinary stores the actual video files
 * 
 * STORAGE ARCHITECTURE:
 * - Cloudinary: stores the actual video files and generates thumbnails
 * - Firebase Firestore: stores metadata (id, title, videoUrl, thumbnailUrl, etc.)
 */

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
  NgZone,
} from '@angular/core';
import { ActionSheetController, AlertController, Platform, ToastController } from '@ionic/angular';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { FirebaseService } from '../../services/firebase.service';
import { MediaService } from '../../services/media.service';
import { ConfirmService } from '../../services/confirm.service';
import { Location } from '@angular/common';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Video metadata structure */
interface VideoMeta {
  id: string;
  path: string;
  label?: string;
  createdAt: number;
  poster?: string;
  thumbnail?: string;
  thumb?: string;
}

/** Video with a playable source URL */
interface VideoView extends VideoMeta {
  src: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

@Component({
  selector: 'app-video-memories',
  templateUrl: './video-memories.page.html',
  styleUrls: ['./video-memories.page.scss'],
  standalone: false,
})
export class VideoMemoriesPage implements OnInit, AfterViewInit, OnDestroy {
  
  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW CHILDREN (DOM references)
  // ─────────────────────────────────────────────────────────────────────────────
  
  @ViewChild('cameraInput') cameraInput!: ElementRef<HTMLInputElement>;
  @ViewChild('galleryInput') galleryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('reels') reelsEl?: ElementRef<HTMLElement>;
  @ViewChildren('vidRef') vidRefs!: QueryList<ElementRef<HTMLVideoElement>>;
  @ViewChild('detailVideoRef') detailVideoRef!: ElementRef<HTMLVideoElement>;

  // ─────────────────────────────────────────────────────────────────────────────
  // UI STATE
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Whether patient mode is enabled (hides some controls) */
  isPatientMode = false;
  
  /** Listener for patient mode changes */
  private patientModeListener?: (e: any) => void;

  // ─────────────────────────────────────────────────────────────────────────────
  // VIDEO DATA
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** All videos from Firebase */
  videos: VideoView[] = [];
  
  /** Videos formatted for display (includes loop padding) */
  displayVideos: VideoView[] = [];
  
  /** Progress state per video (current time, duration) */
  progress: Array<{ current: number; duration: number }> = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // EDIT STATE
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Index of the video being edited (null if none) */
  editingIndex: number | null = null;
  
  /** Current edit label value */
  editLabel = '';
  
  /** Expanded title index (used in patient mode) */
  private expandedTitleIndex: number | null = null;

  // ─────────────────────────────────────────────────────────────────────────────
  // SCROLL STATE (for the infinite-loop effect)
  // ─────────────────────────────────────────────────────────────────────────────
  
  private cancelPressed = false;
  private scrollEndTimer: any = null;
  private isJumping = false;
  private currentDisplayIndex = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // SYNC STATE
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Interval para sa periodic refresh */
  private syncInterval: any = null;
  
  /** Timestamp sa last sync */
  private lastSyncTime = 0;
  
  /** Firebase subscription cleanup function */
  private videosUnsub?: any;

  // ─────────────────────────────────────────────────────────────────────────────
  // DETAIL MODAL STATE
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Whether the detail modal is visible */
  showDetailModal = false;
  
  /** Karon nga gipili nga video para sa detail view */
  selectedVideo: VideoView | null = null;
  
  /** Index sa gipili nga video */
  selectedVideoIndex = -1;
  
  /** Whether the detail video is currently playing */
  isDetailVideoPlaying = false;
  
  /** Karon nga playback time sa detail modal */
  detailVideoCurrent = 0;
  
  /** Total duration sa video sa detail modal */
  detailVideoDuration = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // SELECTION MODE (bulk delete)
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Whether selection mode is active */
  isSelectionMode = false;
  
  /** Set of selected video IDs */
  selectedVideos: Set<string> = new Set();

  // ─────────────────────────────────────────────────────────────────────────────
  // EDIT MODAL STATE
  // ─────────────────────────────────────────────────────────────────────────────
  
  /** Whether the edit modal is visible */
  showEditModal = false;
  
  /** Title being edited */
  editVideoTitle = '';
  
  /** Video being edited */
  videoBeingEdited: VideoView | null = null;

  // ─────────────────────────────────────────────────────────────────────────────
  // PLACEHOLDER IMAGE (for videos without a thumbnail)
  // ─────────────────────────────────────────────────────────────────────────────
  
  readonly placeholderDataUrl: string = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9" width="160" height="90">
      <rect width="16" height="9" fill="#0b0b0b" />
      <circle cx="8" cy="4.5" r="3" fill="rgba(255,255,255,0.03)" />
      <polygon points="6,3.2 6,5.8 9,4.5" fill="#ffffff" />
    </svg>
  `);

  constructor(
    private _plt: Platform,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    private firebaseService: FirebaseService,
    private mediaService: MediaService,
    private location: Location,
    private toastCtrl: ToastController,
    private confirmService: ConfirmService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════════
  // LIFECYCLE HOOKS
  // ═══════════════════════════════════════════════════════════════════════════════

  async ngOnInit() {
    // Load patient mode from storage
    this.syncPatientMode();
    
    // Listen for patient mode changes
    this.patientModeListener = (e: any) => {
      this.zone.run(() => {
        this.isPatientMode = !!e?.detail;
        this.cdr.detectChanges();
      });
    };
    window.addEventListener('patientMode-changed', this.patientModeListener);
    
    // Listen for video events
    window.addEventListener('video-added', this.onVideoAdded as any);
    window.addEventListener('videos-synced', this.onVideosSynced as any);
    window.addEventListener('video-deleted-universal', this.onVideoDeletedUniversal as any);
    
    // Wait for auth, then load videos
    setTimeout(async () => {
      const currentUser = this.firebaseService.getCurrentUser();
      if (currentUser) {
        this.attachVideosSubscription();
        this.startPeriodicRefresh();
      } else {
        console.warn('User not authenticated, skipping video setup');
        this.videos = [];
        this.rebuildDisplay();
        this.prepareProgress();
        this.cdr.detectChanges();
      }
    }, 1000);
    
    // Initial UI setup
    this.rebuildDisplay();
    this.prepareProgress();
  }

  ngAfterViewInit(): void {
    // Configure video elements for autoplay loop
    this.vidRefs.forEach(ref => {
      const v = ref.nativeElement;
      v.muted = true;
      v.loop = true;
      v.addEventListener('ended', () => { 
        v.currentTime = 0; 
        v.play().catch(() => {}); 
      });
    });

    // Jump to the first video
    setTimeout(() => {
      const startDisplay = this.videos.length > 1 ? 1 : 0;
      this.jumpToPage(startDisplay);
    }, 0);
  }

  ionViewWillEnter() {
    this.syncPatientMode();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    // Remove event listeners
    if (this.patientModeListener) {
      window.removeEventListener('patientMode-changed', this.patientModeListener);
    }
    window.removeEventListener('video-added', this.onVideoAdded as any);
    window.removeEventListener('videos-synced', this.onVideosSynced as any);
    window.removeEventListener('video-deleted-universal', this.onVideoDeletedUniversal as any);
    
    // Clean up subscriptions
    this.detachVideosSubscription();
    this.stopPeriodicSync();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PATIENT MODE
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Load patient mode from storage */
  private syncPatientMode() {
    this.isPatientMode = localStorage.getItem('patientMode') === 'true';
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VIDEO SUBSCRIPTION (Firebase)
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Subscribe to Firebase videos for real-time updates */
  private attachVideosSubscription() {
    try {
      this.detachVideosSubscription();
      
      const currentUser = this.firebaseService.getCurrentUser();
      if (!currentUser) {
        console.warn('No authenticated user, skipping video subscription');
        this.videos = [];
        this.rebuildDisplay();
        this.prepareProgress();
        this.cdr.detectChanges();
        return;
      }
      
      // Subscribe to video changes
      this.videosUnsub = this.firebaseService.subscribeToVideos((items: any[]) => {
        this.updateVideosSmoothly(items || []);
      });
    } catch (error) {
      console.error('Failed to subscribe to Firebase videos:', error);
      this.videos = [];
      this.rebuildDisplay();
      this.prepareProgress();
      this.cdr.detectChanges();
    }
  }

  /** Unsubscribe from Firebase videos */
  private detachVideosSubscription() {
    try { 
      if (this.videosUnsub) this.videosUnsub(); 
    } catch {}
    this.videosUnsub = undefined;
  }

  /**
   * Smoothly update the videos list (only when data actually changes).
   * Maps Firebase data into the local `VideoView` format.
   */
  private updateVideosSmoothly(newVideos: any[]) {
    try {
      // Map Firebase data into `VideoView` objects
      const firebaseVideos: VideoView[] = newVideos.map((v: any) => ({
        id: v.id,
        path: '',
        label: v.label || v.title || v.name,
        createdAt: v.createdAt || v.timestamp || Date.now(),
        src: v.downloadURL || v.videoURL || v.videoUrl || v.video || v.src || v.url,
        poster: v.thumbnailUrl || v.thumbnail || v.thumb || v.poster
      }));

      // Check if the list actually changed
      const videosChanged = this.haveVideosChanged(this.videos, firebaseVideos);
      if (!videosChanged) return;

      // Update the list (sorted newest-first)
      this.videos = firebaseVideos.sort((a, b) => b.createdAt - a.createdAt);
      
      // Rebuild the display list
      this.rebuildDisplay();
      this.prepareProgress();
      
      // Update the UI
      requestAnimationFrame(() => {
        this.cdr.detectChanges();
        this.generateThumbnailsForVideos();
      });
      
    } catch (error) {
      console.error('Error during smooth video update:', error);
    }
  }

  /** Check whether the videos list has changed */
  private haveVideosChanged(oldVideos: VideoView[], newVideos: VideoView[]): boolean {
    if (oldVideos.length !== newVideos.length) return true;
    
    for (let i = 0; i < oldVideos.length; i++) {
      if (oldVideos[i].id !== newVideos[i].id || 
          oldVideos[i].src !== newVideos[i].src || 
          oldVideos[i].label !== newVideos[i].label) {
        return true;
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PERIODIC REFRESH
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Start periodic refresh (every 30 seconds) */
  private startPeriodicRefresh() {
    this.stopPeriodicSync();
    
    this.syncInterval = setInterval(async () => {
      try {
        this.attachVideosSubscription();
        this.lastSyncTime = Date.now();
      } catch (error) {
        console.error('Periodic refresh failed:', error);
      }
    }, 30000);
  }

  /** Stop periodic refresh */
  private stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // MANUAL REFRESH/SYNC
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Manually refresh videos */
  async refreshVideos() {
    try {
      const toast = await this.toastCtrl.create({
        message: 'Refreshing videos...',
        duration: 2000,
        position: 'bottom'
      });
      await toast.present();
      
      this.attachVideosSubscription();
      
      const successToast = await this.toastCtrl.create({
        message: 'Videos refreshed!',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await successToast.present();
    } catch (error) {
      console.error('Refresh failed:', error);
      await this.toast('Refresh failed. Please try again.', 'danger');
    }
  }

  /** Sync videos with Cloudinary */
  async manualSyncVideos() {
    try {
      const toast = await this.toastCtrl.create({
        message: 'Syncing videos with Cloudinary...',
        duration: 2000,
        position: 'bottom'
      });
      await toast.present();
      
      const result = await this.firebaseService.syncVideosWithCloudinary();
      await this.firebaseService.syncDeletionsFromCloudinary();
      
      if (result.added > 0 || result.updated > 0 || result.deleted > 0) {
        await this.showSyncNotification(result);
        setTimeout(() => this.attachVideosSubscription(), 1000);
      } else {
        await this.toast('All videos are already synchronized', 'success');
      }
    } catch (error) {
      console.error('Manual sync failed:', error);
      await this.toast('Sync failed. Please try again.', 'danger');
    }
  }

  /** Show a sync result notification */
  private async showSyncNotification(syncResult: { added: number; updated: number; deleted: number }) {
    const message = `Sync complete: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.deleted} deleted`;
    await this.toast(message, 'success');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DISPLAY HELPERS
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Rebuild the display list (adds padding for an infinite-loop effect) */
  private rebuildDisplay() {
    if (this.videos.length <= 1) {
      this.displayVideos = this.videos.slice();
    } else {
      // Put the last video at the start and the first at the end for seamless looping
      const first = this.videos[0];
      const last = this.videos[this.videos.length - 1];
      this.displayVideos = [last, ...this.videos, first];
    }
    this.cdr.detectChanges();
  }

  /** Convert a display index into the real video index */
  realIndex(displayIndex: number): number {
    const n = this.videos.length;
    if (n <= 1) return Math.max(0, Math.min(displayIndex, n - 1));
    if (displayIndex === 0) return n - 1;       // First display item = last video
    if (displayIndex === n + 1) return 0;       // Last display item = first video
    return displayIndex - 1;                     // Normal mapping
  }

  /** Prepare the progress array for all videos */
  private prepareProgress() {
    this.progress = this.videos.map(() => ({ current: 0, duration: 0 }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SCROLL HANDLING (para sa reels-style viewing)
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Handle scroll events */
  onScroll(event: any): void {}

  /** Get reels container height */
  private reelsHeight(): number {
    return this.reelsEl?.nativeElement.clientHeight || 0;
  }

  /** Handle scroll end */
  onReelsScroll() {
    if (this.isJumping) return;
    if (this.scrollEndTimer) clearTimeout(this.scrollEndTimer);
    this.scrollEndTimer = setTimeout(() => this.onScrollSettled(), 120);
  }

  /** Handle when scrolling settles (snap to a page) */
  private onScrollSettled() {
    const el = this.reelsEl?.nativeElement;
    if (!el) return;
    const h = this.reelsHeight();
    if (h <= 0) return;

    const page = Math.round(el.scrollTop / h);
    const n = this.videos.length;

    if (n > 1) {
      // Handle infinite-loop wrapping
      if (page === 0) { this.jumpToPage(n); return; }
      if (page === n + 1) { this.jumpToPage(1); return; }
    }

    this.currentDisplayIndex = page;
    this.autoplayVisible(page);
  }

  /** Jump to a specific page (instant, no animation) */
  private jumpToPage(page: number) {
    const el = this.reelsEl?.nativeElement;
    const h = this.reelsHeight();
    if (!el || h <= 0) return;
    
    this.isJumping = true;
    el.scrollTo({ top: page * h, behavior: 'auto' });
    this.currentDisplayIndex = page;
    this.autoplayVisible(page);
    
    setTimeout(() => { this.isJumping = false; }, 0);
  }

  /** Autoplay the visible video and pause the others */
  private autoplayVisible(displayIndex: number) {
    this.vidRefs?.forEach((ref, i) => {
      const v = ref.nativeElement;
      if (i === displayIndex) v.play().catch(() => {});
      else v.pause();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VIDEO UPLOAD
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Open the add-video menu */
  async openAddMenu() {
    if (this.isPatientMode) return;
    
    const sheet = await this.actionSheetCtrl.create({
      header: 'Add Video',
      buttons: [
        { text: 'Record with Camera', icon: 'camera', handler: () => this.cameraInput?.nativeElement.click() },
        { text: 'Choose from Gallery', icon: 'folder-open', handler: () => this.selectVideoFromGallery() },
        { text: 'Choose from Files', icon: 'document', handler: () => this.galleryInput?.nativeElement.click() },
        { text: 'Cancel', role: 'cancel', icon: 'close' },
      ],
    });
    await sheet.present();
  }

  /** Handle file input selection */
  async onFilePicked(event: Event, _source: 'camera' | 'gallery') {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;

    const file = input.files[0];
    
    // Validate duration (max 60 seconds)
    const isValidDuration = await this.validateVideoDuration(file);
    if (!isValidDuration) {
      input.value = '';
      return;
    }
    
    // Prompt for a video name
    const suggested = (file.name || '').replace(/\.[^.]+$/, '');
    const label = await this.promptForName('Enter a video name (optional)', suggested);

    try {
      // Upload the video
      await this.saveVideoFile(file, (label ?? '').trim() || undefined);
      
      // Jump to the first video after upload
      setTimeout(() => this.jumpToPage(this.videos.length > 1 ? 1 : 0), 0);
      input.value = '';
      
      await this.toast('Video saved!', 'success');
    } catch (error) {
      console.error('Failed to save video:', error);
      await this.toast('Failed to save video. Please try again.', 'danger');
    }
  }

  /** Pick a video from the gallery using the media service */
  async selectVideoFromGallery() {
    try {
      const result = await this.mediaService.pickVideoFile();
      
      let file: File;
      
      // Convert picker result into a File object
      if (result.base64) {
        const response = await fetch(result.base64);
        const blob = await response.blob();
        file = new File([blob], result.fileName || 'video.mp4', { type: result.mimeType });
      } else if (result.url) {
        const response = await fetch(result.url);
        const blob = await response.blob();
        file = new File([blob], result.fileName || 'video.mp4', { type: result.mimeType });
      } else {
        throw new Error('No valid video data was received');
      }
      
      // Validate duration
      const isValidDuration = await this.validateVideoDuration(file);
      if (!isValidDuration) return;
      
      // Prompt for a name and upload
      const suggested = (result.fileName || '').replace(/\.[^.]+$/, '');
      const label = await this.promptForName('Enter a video name (optional)', suggested);

      await this.saveVideoFile(file, (label ?? '').trim() || undefined);
      setTimeout(() => this.jumpToPage(this.videos.length > 1 ? 1 : 0), 0);
      await this.toast('Video saved!', 'success');
      
    } catch (error) {
      console.error('Video selection failed:', error);
      await this.toast('Failed to select a video. Please try again.', 'danger');
    }
  }

  /** Validate video duration (max 60 seconds) */
  private async validateVideoDuration(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        if (video.duration > 60) {
          this.showVideoDurationError();
          resolve(false);
        } else {
          resolve(true);
        }
      };
      
      video.onerror = () => {
        console.error('Error loading video metadata');
        resolve(false);
      };
      
      video.src = URL.createObjectURL(file);
    });
  }

  /** Show an error alert when the video is too long */
  private async showVideoDurationError() {
    await this.confirmService.notify(
      'Videos must be 60 seconds or less. Please choose a shorter video.',
      'Video too long'
    );
  }

  /**
   * Save the video file to Cloudinary and Firebase.
   * Returns the created `VideoView` object.
   */
  private async saveVideoFile(file: File, label?: string): Promise<VideoView> {
    try {
      // Upload to Cloudinary
      const uploadResult = await this.firebaseService.uploadVideoToCloudinaryFixed(file, label);
      
      // Build video metadata
      const meta: VideoMeta = {
        id: uploadResult.id,
        path: '',
        label: uploadResult.title,
        createdAt: Date.now(),
        poster: uploadResult.thumbnailUrl
      };

      const videoView: VideoView = {
        ...meta,
        src: uploadResult.videoUrl
      };

      // Verify the video was saved to Firestore
      const isSaved = await this.firebaseService.verifyVideoSaved(uploadResult.id);
      if (!isSaved) {
        throw new Error('Video upload failed — it was not saved to the database');
      }

      // Dispatch an event for other components
      window.dispatchEvent(new CustomEvent('video-added', { 
        detail: { meta, src: uploadResult.videoUrl } 
      }));

      return videoView;
    } catch (error) {
      console.error('Cloudinary video upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Failed to save video: ${errorMessage}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VIDEO EDITING
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Start editing a video's title */
  startEdit(displayIdx: number) {
    if (this.isPatientMode) return;
    const ri = this.realIndex(displayIdx);
    this.editingIndex = ri;
    this.editLabel = (this.videos[ri].label || '').trim();
  }

  /** Handle edit input changes */
  onEditLabelInput(ev: any) {
    const val = ev?.detail?.value ?? ev?.target?.value ?? '';
    this.editLabel = val;
  }

  /** Save the edited title */
  async saveEdit(realIdx: number) {
    if (this.editingIndex !== realIdx) return;
    const newLabel = (this.editLabel || '').trim();
    const video = this.videos[realIdx];
    
    try {
      // Update in Firebase
      await this.firebaseService.updateVideoMetadata(video.id, { title: newLabel || undefined });
      
      // Update local state
      this.videos[realIdx].label = newLabel || undefined;
      this.editingIndex = null;
      this.editLabel = '';
      
      await this.toast('Video title updated!', 'success');
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to update video title:', error);
      await this.toast('Failed to update video title. Please try again.', 'danger');
    }
  }

  /** Cancel editing */
  cancelEdit() {
    this.editingIndex = null;
    this.editLabel = '';
  }

  onCancelMouseDown() { 
    this.cancelPressed = true; 
  }

  onInputBlur(realIdx: number) {
    if (this.cancelPressed) {
      this.cancelPressed = false;
      this.cancelEdit();
      return;
    }
    this.saveEdit(realIdx);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TITLE EXPANSION (Patient Mode)
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Check whether the title is expanded */
  isTitleExpanded(displayIdx: number): boolean {
    return this.expandedTitleIndex === displayIdx;
  }

  /** Handle title tap (edit or expand) */
  onTitleTap(displayIdx: number) {
    if (!this.isPatientMode) {
      this.startEdit(displayIdx);
      return;
    }
    this.expandedTitleIndex = (this.expandedTitleIndex === displayIdx) ? null : displayIdx;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VIDEO DELETION
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Delete a video from the reels view */
  async deleteVideo(displayIdx: number) {
    if (this.isPatientMode) return;
    const ri = this.realIndex(displayIdx);
    const item = this.videos[ri];
    if (!item) return;

    const ok = await this.confirmService.confirm({
      title: 'Delete this video?',
      message: 'This will remove the video from your device.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    // Delete the local file (if present)
    try { 
      await Filesystem.deleteFile({ path: item.path, directory: Directory.Data }); 
    } catch {}

    // Remove from the local list
    this.videos.splice(ri, 1);
    this.prepareProgress();
    this.rebuildDisplay();

    if (this.expandedTitleIndex === displayIdx) this.expandedTitleIndex = null;

    this.cdr.detectChanges();
    setTimeout(() => this.jumpToPage(this.videos.length > 1 ? 1 : 0), 0);
  }

  /** Delete a video from the gallery view */
  async deleteVideoFromGallery(index: number) {
    if (this.isPatientMode) return;

    const video = this.videos[index];
    if (!video) return;

    const ok = await this.confirmService.confirm({
      title: 'Delete video?',
      message: `Remove “${video.label || 'this video'}” from your memories? This can’t be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (ok) await this.performDeleteVideo(index);
  }

  /** Perform video deletion */
  private async performDeleteVideo(index: number) {
    try {
      const video = this.videos[index];
      if (!video) return;

      // Delete from Cloudinary and Firebase
      const success = await this.firebaseService.universalDeleteVideo(video.id);
      
      if (success) {
        await this.toast('Video deleted from all platforms!', 'success');
      } else {
        throw new Error('Universal deletion failed');
      }

      // Close the detail view if this video is currently selected
      if (this.selectedVideo && this.selectedVideo.id === video.id) {
        this.closeDetailView();
      }

      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to delete video:', error);
      await this.toast('Failed to delete video. Please try again.', 'danger');
    }
  }

  /** Delete a video from the detail view */
  async deleteVideoFromDetail(video: any) {
    if (!video) return;
    
    const ok = await this.confirmService.confirm({
      title: 'Delete video?',
      message: `Remove “${video.label || 'this video'}”? This can’t be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      if (video.id) {
        const success = await this.firebaseService.deleteVideoFromCloudinary(video.id);

        if (success) {
          this.closeDetailView();
          await this.toast('Video deleted!', 'success');
          setTimeout(() => this.attachVideosSubscription(), 1000);
        } else {
          throw new Error('Deletion failed');
        }
      }
    } catch (err) {
      console.error('Failed to delete video:', err);
      await this.toast('Failed to delete video. Please try again.', 'danger');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SELECTION MODE (Bulk Delete)
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Toggle selection mode on/off */
  toggleSelectionMode() {
    this.isSelectionMode = !this.isSelectionMode;
    if (!this.isSelectionMode) {
      this.selectedVideos.clear();
    }
    this.cdr.detectChanges();
  }

  /** Toggle selection for a single video */
  toggleVideoSelection(videoId: string) {
    if (this.selectedVideos.has(videoId)) {
      this.selectedVideos.delete(videoId);
    } else {
      this.selectedVideos.add(videoId);
    }
    this.cdr.detectChanges();
  }

  /** Select all videos */
  selectAllVideos() {
    this.videos.forEach(video => {
      this.selectedVideos.add(video.id);
    });
    this.cdr.detectChanges();
  }

  /** Delete all selected videos */
  async deleteSelectedVideos() {
    if (this.selectedVideos.size === 0) return;

    const n = this.selectedVideos.size;
    const ok = await this.confirmService.confirm({
      title: 'Delete videos?',
      message: `Delete ${n} selected video${n === 1 ? '' : 's'}? This can’t be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    const idsToDelete = Array.from(this.selectedVideos);
    let deletedCount = 0;

    for (const id of idsToDelete) {
      try {
        const success = await this.firebaseService.universalDeleteVideo(id);
        if (success) deletedCount++;
      } catch (e) {
        console.error('Error deleting a video:', e);
      }
    }

    this.selectedVideos.clear();
    this.isSelectionMode = false;

    await this.toast(`${deletedCount} video(s) deleted!`, 'success');
    this.cdr.detectChanges();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DETAIL MODAL
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Open the detail view for a video */
  openDetailView(video: VideoView, index: number) {
    this.selectedVideo = video;
    this.selectedVideoIndex = index;
    this.showDetailModal = true;
    this.editLabel = video.label || '';
  }

  /** Close the detail view */
  closeDetailView() {
    this.showDetailModal = false;
    this.selectedVideo = null;
    this.selectedVideoIndex = -1;
    this.isDetailVideoPlaying = false;
    this.detailVideoCurrent = 0;
    this.detailVideoDuration = 0;
  }

  /** Handle when the detail video metadata has loaded */
  onDetailVideoLoaded() {
    const video = this.detailVideoRef?.nativeElement;
    if (video) {
      this.detailVideoDuration = video.duration || 0;
    }
  }

  /** Handle detail video time updates */
  onDetailVideoTimeUpdate() {
    const video = this.detailVideoRef?.nativeElement;
    if (video) {
      this.detailVideoCurrent = video.currentTime || 0;
    }
  }

  /** Toggle play/pause in the detail view */
  toggleDetailVideoPlay() {
    const video = this.detailVideoRef?.nativeElement;
    if (!video) return;

    if (this.isDetailVideoPlaying) {
      video.pause();
      this.isDetailVideoPlaying = false;
    } else {
      video.play().then(() => {
        this.isDetailVideoPlaying = true;
      }).catch(() => {
        this.isDetailVideoPlaying = false;
      });
    }
  }

  /** Seek within the detail video */
  onDetailVideoSeek(event: CustomEvent) {
    const video = this.detailVideoRef?.nativeElement;
    if (!video) return;

    const value = Number(event.detail?.value || 0);
    video.currentTime = value;
    this.detailVideoCurrent = value;
  }

  /** Go to the previous video in the detail view */
  goToPreviousVideo() {
    if (this.selectedVideoIndex > 0) {
      const prevIndex = this.selectedVideoIndex - 1;
      this.openDetailView(this.videos[prevIndex], prevIndex);
    }
  }

  /** Go to the next video in the detail view */
  goToNextVideo() {
    if (this.selectedVideoIndex < this.videos.length - 1) {
      const nextIndex = this.selectedVideoIndex + 1;
      this.openDetailView(this.videos[nextIndex], nextIndex);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EDIT MODAL
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Open the edit modal */
  editVideo(video: any) {
    if (!video) return;
    this.videoBeingEdited = video;
    this.editVideoTitle = video.label || '';
    this.showEditModal = true;
  }

  /** Close the edit modal */
  closeEditModal() {
    this.showEditModal = false;
    this.videoBeingEdited = null;
    this.editVideoTitle = '';
  }

  /** Save video edits */
  async saveVideoEdit() {
    if (!this.videoBeingEdited) return;

    try {
      this.videoBeingEdited.label = this.editVideoTitle;
      
      this.prepareProgress();
      this.rebuildDisplay();
      
      // Update in Firebase
      if (this.videoBeingEdited.id) {
        await this.firebaseService.updateVideoMetadata(this.videoBeingEdited.id, {
          title: this.editVideoTitle
        });
      }
      
      // Update the selected video if it matches
      if (this.selectedVideo && this.selectedVideo.id === this.videoBeingEdited.id) {
        this.selectedVideo.label = this.editVideoTitle;
      }
      
      await this.toast('Video updated', 'success');
      this.closeEditModal();
    } catch (err) {
      console.error('Failed to update video:', err);
      await this.toast('Failed to update video', 'danger');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VIDEO PLAYBACK HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Handle when video metadata has loaded */
  onLoadedMeta(displayIdx: number) {
    const v = this.getVideo(displayIdx);
    if (!v) return;
    const dur = isFinite(v.duration) ? v.duration : 0;
    const ri = this.realIndex(displayIdx);
    this.ensureProgressIndex(ri);
    this.progress[ri].duration = dur > 0 ? dur : 0;
  }

  /** Handle video time updates */
  onTimeUpdate(displayIdx: number) {
    const v = this.getVideo(displayIdx);
    if (!v) return;
    const ri = this.realIndex(displayIdx);
    this.ensureProgressIndex(ri);
    this.progress[ri].current = v.currentTime || 0;
    if (!this.progress[ri].duration && isFinite(v.duration)) {
      this.progress[ri].duration = v.duration || 0;
    }
  }

  /** Handle seek slider changes */
  onSeek(ev: CustomEvent, displayIdx: number) {
    const value = (ev.detail as any).value ?? 0;
    const v = this.getVideo(displayIdx);
    if (!v) return;
    v.currentTime = Number(value) || 0;
    const ri = this.realIndex(displayIdx);
    this.ensureProgressIndex(ri);
    this.progress[ri].current = v.currentTime;
  }

  /** Handle video tap (play/pause) */
  onVideoTap(displayIdx: number) {
    const v = this.getVideo(displayIdx);
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  /** Check whether a video is playing */
  isPlaying(displayIdx: number): boolean {
    const v = this.getVideo(displayIdx);
    return !!v && !v.paused && !v.ended && v.currentTime > 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS (Custom Events)
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Handle the \"video-added\" event */
  private onVideoAdded = (e: CustomEvent) => {
    try {
      const detail: any = (e as any).detail;
      if (!detail || !detail.meta || !detail.src) return;
      
      const newVid: VideoView = {
        id: detail.meta.id,
        path: detail.meta.path,
        label: detail.meta.label,
        createdAt: detail.meta.createdAt,
        poster: detail.meta.poster || detail.meta.thumbnailUrl || detail.thumbnail || detail.thumb,
        src: detail.src || detail.meta.videoUrl || detail.meta.downloadURL || detail.meta.videoURL || detail.url
      };
      
      // Don't add duplicates
      if (this.videos.some(v => v.id === newVid.id)) return;
      
      this.videos.unshift(newVid);
      
      // Generate a thumbnail if missing
      if (!newVid.poster && newVid.src) {
        this.generateThumbnailFromVideo(newVid.src).then((dataUrl) => {
          if (dataUrl) {
            newVid.poster = dataUrl;
            this.cdr.detectChanges();
          }
        }).catch(() => {});
      }
      
      this.displayVideos = this.makeLoopDisplay(this.videos);
      this.progress.unshift({ current: 0, duration: 0 });
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error handling video-added event:', error);
    }
  }

  /** Handle the \"video-deleted-universal\" event */
  private onVideoDeletedUniversal = (e: CustomEvent) => {
    try {
      const detail: any = (e as any).detail;
      
      if (detail?.videoId) {
        const videoIndex = this.videos.findIndex(v => v.id === detail.videoId);
        if (videoIndex !== -1) {
          this.videos.splice(videoIndex, 1);
          this.rebuildDisplay();
          this.prepareProgress();
          this.cdr.detectChanges();
          
          // Close the detail view if this video is currently selected
          if (this.selectedVideo && this.selectedVideo.id === detail.videoId) {
            this.closeDetailView();
          }
          
          const message = detail.cloudinaryDeleted && detail.firebaseDeleted
            ? 'Video deleted from all platforms'
            : 'Video deleted (some platforms may have failed)';
          
          this.toast(message, detail.cloudinaryDeleted && detail.firebaseDeleted ? 'success' : 'warning');
        }
      }
    } catch (error) {
      console.error('Error handling universal deletion event:', error);
    }
  };

  /** Handle the \"videos-synced\" event */
  private onVideosSynced = (e: CustomEvent) => {
    try {
      const detail: any = (e as any).detail;
      
      // Handle deleted videos
      if (Array.isArray(detail?.deletedIds) && detail.deletedIds.length > 0) {
        const ids: string[] = detail.deletedIds;
        let removed = 0;
        ids.forEach(id => {
          const idx = this.videos.findIndex(v => v.id === id);
          if (idx !== -1) {
            this.videos.splice(idx, 1);
            removed++;
          }
        });
        if (removed > 0) {
          this.prepareProgress();
          this.rebuildDisplay();
          this.showSyncNotification({ added: 0, updated: 0, deleted: removed }).catch(() => {});
        }
      }

      // Handle added/updated videos
      if (detail.added > 0 || detail.updated > 0) {
        this.showSyncNotification(detail);
        setTimeout(() => this.attachVideosSubscription(), 1000);
      }
    } catch (error) {
      console.error('Error handling videos-synced event:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  /** Build a looped display array (padding for infinite scroll) */
  private makeLoopDisplay(list: VideoView[]): VideoView[] {
    if (!list || list.length <= 1) return (list || []).slice();
    const first = list[0];
    const last = list[list.length - 1];
    return [last, ...list, first];
  }

  /** Get a video element by display index */
  private getVideo(displayIdx: number): HTMLVideoElement | null {
    const ref = this.vidRefs?.get(displayIdx);
    return ref?.nativeElement ?? null;
  }

  /** Ensure a progress entry exists for the given index */
  private ensureProgressIndex(realIdx: number) {
    if (!this.progress[realIdx]) {
      this.progress[realIdx] = { current: 0, duration: 0 };
    }
  }

  /** Prompt the user for a name */
  private async promptForName(header: string, value: string): Promise<string | null> {
    const alert = await this.alertCtrl.create({
      header,
      cssClass: 'alala-ion-alert',
      inputs: [{ name: 'label', type: 'text', placeholder: '(optional)', value }],
      buttons: [{ text: 'Skip', role: 'cancel' }, { text: 'Save', role: 'confirm' }],
      backdropDismiss: true,
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'confirm') return null;
    return (data?.values?.label ?? '') as string;
  }

  /** Generate a thumbnail from a video URL */
  private generateThumbnailFromVideo(videoUrl: string): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const video = document.createElement('video') as HTMLVideoElement;
        video.crossOrigin = 'anonymous';
        video.preload = 'metadata';
        video.src = videoUrl;

        const cleanup = () => {
          try { video.pause(); } catch {}
          video.src = '';
          
        };

        const onLoaded = () => {
          try {
            video.currentTime = 0.05;
          } catch (err) {}
        };

        const onSeeked = () => {
          try {
            const canvas = document.createElement('canvas') as HTMLCanvasElement;
            canvas.width = video.videoWidth || 320;
            canvas.height = video.videoHeight || 180;
            const ctx = canvas.getContext('2d');
            if (!ctx) { cleanup(); resolve(null); return; }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            cleanup();
            resolve(dataUrl);
          } catch (err) {
            cleanup();
            resolve(null);
          }
        };

        const onError = () => { cleanup(); resolve(null); };

        video.addEventListener('loadedmetadata', onLoaded, { once: true });
        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });

        // Timeout fallback
        setTimeout(() => {
          try {
            const canvas = document.createElement('canvas') as HTMLCanvasElement;
            canvas.width = video.videoWidth || 320;
            canvas.height = video.videoHeight || 180;
            const ctx = canvas.getContext('2d');
            if (!ctx) { cleanup(); resolve(null); return; }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            cleanup();
            resolve(dataUrl);
          } catch (err) {
            cleanup();
            resolve(null);
          }
        }, 1500);

      } catch (e) {
        resolve(null);
      }
    });
  }

  /** Generate thumbnails for videos that don't have one */
  private generateThumbnailsForVideos() {
    this.videos.forEach((vid) => {
      if (!vid.poster && vid.src) {
        this.generateThumbnailFromVideo(vid.src).then((dataUrl) => {
          if (dataUrl) {
            vid.poster = dataUrl;
            this.cdr.detectChanges();
          }
        }).catch((err) => {
          console.debug('Thumbnail generation failed for', vid.id, err);
        });
      }
    });
  }

  /** Handle thumbnail image errors */
  onThumbError(ev: Event, video?: VideoView) {
    try {
      const img = ev?.target as HTMLImageElement | null;
      if (img) img.src = this.placeholderDataUrl;
      if (video) video.poster = this.placeholderDataUrl;
      this.cdr.detectChanges();
    } catch (e) {}
  }

  /** Handle thumbnail video errors */
  onThumbVideoError(ev: Event, video?: VideoView) {
    try {
      const vid = ev?.target as HTMLVideoElement | null;
      if (vid) {
        try { vid.pause(); } catch {}
        vid.poster = this.placeholderDataUrl;
        vid.src = '';
      }
      if (video) {
        video.poster = this.placeholderDataUrl;
        video.src = '';
      }
      this.cdr.detectChanges();
    } catch (e) {}
  }

  /** Format seconds as M:SS */
  formatTime(sec: number): string {
    if (!sec || !isFinite(sec)) return '0:00';
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    const m = Math.floor(sec / 60);
    return `${m}:${s}`;
  }

  /** Format duration as M:SS */
  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /** Navigate back */
  goBack() {
    this.location.back();
  }

  /** Show a toast message */
  private async toast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' = 'primary') {
    const t = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom'
    });
    await t.present();
  }
}
