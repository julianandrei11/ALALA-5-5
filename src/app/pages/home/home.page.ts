import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';
import type { Unsubscribe } from '@firebase/firestore';
import { ConfirmService } from '../../services/confirm.service';
import { PatientModeToastService } from '../../services/patient-mode-toast.service';


@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit, OnDestroy {
  isPatientMode = false;
  greetingName = 'there';
  streakDays = 0;
  /** First name (or short name) for “Welcome, …” */
  welcomeFirstName = 'there';

  
  userPhoto = '';
  userName = '';

  /** Selected patient profile image for header (replaces ALALA logo on Home). */
  patientProfilePhoto = '';

  
  todayStats = {
    accuracy: 0,
    cardsToday: 0,
    avgTime: 0
  };

  private profileListener?: (e: any) => void;
  private sessionsUnsub?: Unsubscribe;
  /** Firestore listener scope: caregiverId + patientId (avoid stale stats after switching patients). */
  private sessionsSubscriptionKey: string | null = null;
  private caregiverToggleListener?: (e: any) => void;

  goToProfile(): void {
    this.router.navigate(['/profile']).catch((err) => console.error('Navigate to profile failed', err));
  }

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private firebaseService: FirebaseService,
    private confirmService: ConfirmService,
    private patientModeToast: PatientModeToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.isPatientMode = localStorage.getItem('patientMode') === 'true';
    this.loadUserProfile();
    this.loadTodayStats();
    this.attachRealtimeToday();
    void this.refreshStreakAndGreeting();

    
    this.profileListener = () => this.loadUserProfile();
    window.addEventListener('user-profile-updated', this.profileListener);

    this.caregiverToggleListener = () => this.onPatientModeToggle();
    window.addEventListener('caregiver-toggle', this.caregiverToggleListener);
    
    
    window.addEventListener('user-logged-in', () => {
      void this.loadUserProfile();
      void this.loadTodayStats();
      void this.refreshStreakAndGreeting();
      this.refreshSessionsListenerIfPatientScopeChanged();
    });
  }

  private async refreshStreakAndGreeting(): Promise<void> {
    this.streakDays = this.firebaseService.getBrainStreakDisplayCount();
    await this.loadGreetingName();
  }

  private async loadGreetingName() {
    try {
      this.greetingName = await this.firebaseService.getSelectedPatientDisplayName();
    } catch {
      this.greetingName = 'there';
    }
    this.syncWelcomeFirstName();
    this.cdr.markForCheck();
  }

  /**
   * Welcome line uses the selected patient’s name for caregivers / family (dashboard picks a patient),
   * and when Patient Mode is on. Otherwise it uses the signed-in account display name (e.g. patient-only accounts).
   */
  private syncWelcomeFirstName(): void {
    const selectedPatientId = (localStorage.getItem('selectedPatientId') || '').trim();
    const greetingReady = !!this.greetingName && this.greetingName !== 'there';
    const usePatientWelcome =
      greetingReady &&
      (this.isPatientMode || !!selectedPatientId);
    const raw =
      (usePatientWelcome ? this.greetingName : (this.userName || '').trim()) || 'Guest';
    const first = raw.split(/\s+/).filter(Boolean)[0] || 'there';
    this.welcomeFirstName = /^guest$/i.test(first) ? 'there' : first;
  }

  ngOnDestroy(): void {
    if (this.profileListener) {
      window.removeEventListener('user-profile-updated', this.profileListener);
    }
    if (this.caregiverToggleListener) {
      window.removeEventListener('caregiver-toggle', this.caregiverToggleListener);
    }
    try { this.sessionsUnsub?.(); } catch {}
  }

  async ionViewWillEnter() {
    void this.loadTodayStats();
    await this.loadUserProfile();
    await this.refreshSelectedPatientPhoto();
    await this.refreshStreakAndGreeting();
    this.refreshSessionsListenerIfPatientScopeChanged();

    try {
      const pending = localStorage.getItem('pendingPatientMode') === 'true';
      if (pending && !this.isPatientMode) {
        // Directly enable patient mode without confirmation (already confirmed in Settings/Profile/Progress)
        this.activatePatientModeDirectly();
      }
      if (pending) {
        localStorage.removeItem('pendingPatientMode');
      }
    } catch {}
  }

  private activatePatientModeDirectly() {
    this.isPatientMode = true;
    localStorage.setItem('patientMode', 'true');
    this.syncWelcomeFirstName();
    void this.patientModeToast.showPatientModeOn();
    window.dispatchEvent(new CustomEvent('patientMode-changed', { detail: true }));
  }

  async loadTodayStats() {
    try {
      
      const currentUser = this.firebaseService.getCurrentUser();
      if (!currentUser) {
        this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
        return;
      }

      
      const todaySessions = await this.getTodaySessions();

      if (todaySessions.length === 0) {
        this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
        return;
      }

      
      const totalQuestions = todaySessions.reduce((sum: number, s: any) => sum + s.totalQuestions, 0);
      const totalCorrect = todaySessions.reduce((sum: number, s: any) => sum + s.correctAnswers, 0);
      const totalTime = todaySessions.reduce((sum: number, s: any) => sum + s.totalTime, 0);

      this.todayStats = {
        accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
        cardsToday: totalQuestions,
        avgTime: totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0
      };

      
    } catch (error) {
      console.error('Error loading today\'s stats:', error);
      this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
    }
  }

  private attachRealtimeToday() {
    try {
      this.sessionsUnsub?.();
      this.sessionsUnsub = undefined;
      const ctx = this.firebaseService.getBrainStreakContext();
      if (!ctx) {
        this.sessionsSubscriptionKey = null;
        return;
      }
      this.sessionsSubscriptionKey = `${ctx.caregiverId}::${ctx.patientId}`;
      this.sessionsUnsub = this.firebaseService.subscribeToGameSessions((sessions) => {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        const todaySessions = (sessions || []).filter((s: any) => {
          const t = new Date(s.timestamp);
          return t >= startOfDay && t <= endOfDay;
        });

        if (todaySessions.length === 0) {
          this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
          return;
        }
        const totalQuestions = todaySessions.reduce((sum: number, s: any) => sum + (s.totalQuestions || 0), 0);
        const totalCorrect = todaySessions.reduce((sum: number, s: any) => sum + (s.correctAnswers || 0), 0);
        const totalTime = todaySessions.reduce((sum: number, s: any) => sum + (s.totalTime || 0), 0);
        this.todayStats = {
          accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
          cardsToday: totalQuestions,
          avgTime: totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0
        };
        this.cdr.markForCheck();
      });
    } catch {
      this.sessionsSubscriptionKey = null;
    }
  }

  /** Re-bind live sessions when returning from dashboard with a different patient. */
  private refreshSessionsListenerIfPatientScopeChanged(): void {
    const ctx = this.firebaseService.getBrainStreakContext();
    const key = ctx ? `${ctx.caregiverId}::${ctx.patientId}` : '';
    if (key === this.sessionsSubscriptionKey) return;
    this.attachRealtimeToday();
  }

  async getTodaySessions() {
    try {
      const allSessions = await this.firebaseService.getUserGameSessions();

      
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      const todaySessions = allSessions.filter((session: any) => {
        let sessionDate: Date;
        if (typeof session.timestamp === 'string') {
          sessionDate = new Date(session.timestamp);
        } else if (typeof session.timestamp === 'number') {
          sessionDate = new Date(session.timestamp);
        } else {
          return false;
        }

        return sessionDate >= startOfDay && sessionDate <= endOfDay;
      });

      return todaySessions;
    } catch (error) {
      console.error('Error getting today\'s sessions:', error);
      
      const uid = localStorage.getItem('userId');
      const key = uid ? `gameSessions:${uid}` : 'gameSessions';
      const sessions = localStorage.getItem(key);
      if (!sessions) return [];

      const allSessions = JSON.parse(sessions);
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      return allSessions.filter((session: any) => {
        const sessionDate = new Date(session.timestamp);
        return sessionDate >= startOfDay && sessionDate <= endOfDay;
      });
    }
  }

  
  private async loadUserProfile() {
    try {
      
      
      
      const userProfile = await this.firebaseService.getUserProfile();
      
      
      if (userProfile) {
        
        this.userName = userProfile.name || userProfile.patientInfo?.name || 'User';
        
        this.userPhoto = userProfile.photo ? `${userProfile.photo}?t=${Date.now()}` : '';
        
        
      } else {
        
        const user = this.firebaseService.getCurrentUser();
        this.userName = user?.displayName || 'Guest';
        this.userPhoto = '';
        
        
      }
      
      
      if (!this.userName || this.userName === 'Guest') {
        const raw = localStorage.getItem('userData');
        const data = raw ? JSON.parse(raw) : {};
        this.userName = data?.name || data?.caregiverInfo?.name || data?.patientInfo?.name || 'User';
        this.userPhoto = data?.photo ? `${data.photo}?t=${Date.now()}` : '';
        
        
      }
      
      
      this.syncWelcomeFirstName();
      this.cdr.detectChanges();
      
    } catch (e) {
      console.warn('Error loading user profile:', e);
      this.userPhoto = '';
      this.userName = 'User';
      this.syncWelcomeFirstName();
    }
  }

  private async refreshSelectedPatientPhoto(): Promise<void> {
    const pid = localStorage.getItem('selectedPatientId');
    if (!pid) {
      this.patientProfilePhoto = '';
      return;
    }
    try {
      const list = await this.firebaseService.getPatients();
      const p = list.find((x) => x.id === pid);
      const url = ((p?.photo || '') as string).trim();
      this.patientProfilePhoto = url ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : '';
    } catch {
      this.patientProfilePhoto = '';
    }
    this.cdr.markForCheck();
  }

  
  async refreshData() {
    
    try {
      
      const loading = await this.loadingCtrl.create({
        message: 'Refreshing data...',
        duration: 1000
      });
      await loading.present();

      
      await Promise.all([
        this.loadUserProfile(),
        this.loadTodayStats()
      ]);

      await loading.dismiss();
      await this.confirmService.notify('Data refreshed successfully!', 'Saved');
      
    } catch (error) {
      console.error('Error refreshing data:', error);
      await this.confirmService.notify('Error refreshing data', 'Could not refresh');
    }
  }

  
  
  async enablePatientMode() {
    const currentUser = this.firebaseService.getCurrentUser();
    if (!currentUser) {
      // If we somehow don't have a user, just send them to Settings
      // so they can configure caregiver options there.
      this.router.navigate(['/settings']).catch(err => {
        console.error('Navigation to settings failed from enablePatientMode:', err);
      });
      return;
    }

    const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);

    
    if (!savedPin) {
      const go = await this.confirmService.confirm({
        title: 'Password required',
        message: 'Create a caregiver password in Settings first. You will need it to exit Patient Mode.',
        confirmText: 'Go to Settings',
        cancelText: 'Cancel'
      });
      if (go) {
        this.router.navigate(['/settings']).catch(err => {
          console.error('Navigation to settings failed from enablePatientMode:', err);
        });
      }
      return;
    }

    const ok = await this.confirmService.confirm({
      title: 'Enter Patient Mode?',
      message: 'You will need your caregiver password to exit Patient Mode.',
      confirmText: 'Enter',
      cancelText: 'Cancel'
    });
    if (!ok) return;

    this.isPatientMode = true;
    localStorage.setItem('patientMode', 'true');
    this.syncWelcomeFirstName();
    void this.patientModeToast.showPatientModeOn();
    window.dispatchEvent(new CustomEvent('patientMode-changed', { detail: true }));
  }

  
  async onPatientModeToggle() {
    if (!this.isPatientMode) {
      
      await this.enablePatientMode();
      return;
    }
    
    await this.promptExitPatientMode();
  }

  public async promptExitPatientMode() {
    const alert = await this.alertCtrl.create({
      header: 'Exit Patient Mode',
      message: 'Enter your caregiver password to return to standard mode.',
      cssClass: 'alala-ion-alert',
      inputs: [
        {
          name: 'pin',
          type: 'password',
          placeholder: 'Enter password',
          attributes: { maxlength: 32 }
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Unlock',
          handler: async (data) => this.verifyAndExitPatientMode(data?.pin)
        }
      ],
      backdropDismiss: false
    });
    await alert.present();
  }

  private async verifyAndExitPatientMode(inputPin: string) {
    const currentUser = this.firebaseService.getCurrentUser();
    if (!currentUser) {
      // No user available – send them to Settings instead of showing an error toast.
      this.router.navigate(['/settings']).catch(err => {
        console.error('Navigation to settings failed from verifyAndExitPatientMode:', err);
      });
      return false;
    }

    const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);

    if (!savedPin) {
      const go = await this.confirmService.confirm({
        title: 'No password set',
        message: 'Add a caregiver password in Settings before exiting Patient Mode.',
        confirmText: 'Go to Settings',
        cancelText: 'Cancel'
      });
      if (go) {
        this.router.navigate(['/settings']).catch(err => {
          console.error('Navigation to settings failed from verifyAndExitPatientMode:', err);
        });
      }
      return false;
    }

    if (!inputPin || inputPin !== savedPin) {
      await this.confirmService.notify('Incorrect password', 'Try again');
      return false;
    }

    this.isPatientMode = false;
    localStorage.setItem('patientMode', 'false');
    this.syncWelcomeFirstName();
    await this.patientModeToast.showStandardModeOn();
    window.dispatchEvent(new CustomEvent('patientMode-changed', { detail: false }));
    return true;
  }

  
  togglePatientMode() {
    if (!this.isPatientMode) {
      
      this.enablePatientMode();
    } else {
      this.promptExitPatientMode();
    }
  }


  
  navigateToGame(gameType: string) {
    switch (gameType) {
      case 'name-that-memory':
        this.router.navigate(['/brain-game-category', 'name-that-memory']);
        break;
      case 'category-match':
        this.router.navigate(['/brain-game-category', 'category-match']);
        break;
      case 'memory-matching':
        this.router.navigate(['/memory-matching']);
        break;
      case 'color-sequence':
        this.router.navigate(['/color-sequence']);
        break;
      default:
        
    }
  }

  // Toasts removed for defense UI consistency (use consistent modals instead).
}
