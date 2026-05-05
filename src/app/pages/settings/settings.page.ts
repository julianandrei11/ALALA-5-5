import { ChangeDetectorRef, Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController, ViewWillEnter } from '@ionic/angular';
import {
  FirebaseService,
  PatientAccessGrantSummary,
  TrustedPatientInvite
} from '../../services/firebase.service';
import { ConfirmService } from '../../services/confirm.service';
import { PatientModeToastService } from '../../services/patient-mode-toast.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false
})
export class SettingsPage implements OnInit, ViewWillEnter {
  userData: any = {};
  isPatientMode: boolean = false;

  
  securityCode = '';
  private USED_CODES_KEY = 'alala_used_security_codes_v1';
  private readonly CODE_LEN = 24;
  
  
  private readonly ALPHABET = '23456789BCDFGHJKLMNPQRSTVWXZ';

  
  hasPin = false;
  maskedPin = '—';
  revealedPin = '';
  showMasked = true;
  isEditingPassword = false;


  saving = false;

  
  form = { currentPin: '', newPin: '', confirmPin: '' };
  showCurrent = false;
  showNew = false;
  showConfirm = false;

  
  isEditingName = false;
  isEditingEmail = false;
  nameDraft = '';
  emailDraft = '';
  savingName = false;
  savingEmail = false;

  
  @ViewChild('cameraInput') cameraInput!: ElementRef<HTMLInputElement>;
  @ViewChild('galleryInput') galleryInput!: ElementRef<HTMLInputElement>;

  
  canManageTrustedFamily = false;
  patientsForTrustedFamily: Array<{
    id: string;
    name?: string;
    nickname?: string;
    photo?: string;
  }> = [];
  trustedFamilyPatientId = '';
  trustedFamilyContact = '';
  trustedFamilyLoading = false;
  pendingInvitesSent: TrustedPatientInvite[] = [];
  activeGrants: PatientAccessGrantSummary[] = [];
  private inviteeNameCache: Record<string, string> = {};

  expandedSections: { [key: string]: boolean } = {
    contacts: false
  };

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private actionSheetCtrl: ActionSheetController,
    private firebaseService: FirebaseService,
    private confirmService: ConfirmService,
    private patientModeToast: PatientModeToastService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadUserDataFromFirebase();
    await this.loadPinState();
    await this.initTrustedFamilyPanel();
    this.checkPatientMode();
  }

  /** Refresh “who we’re inviting for” when returning from Patients (no dropdown). */
  async ionViewWillEnter() {
    await this.loadPinState();
    await this.refreshTrustedFamilyPatientContext();
  }

  async loadUserDataFromFirebase() {
    try {
      const user = this.firebaseService.getCurrentUser();
      if (user) {
        const data = await this.firebaseService.getUserData(user.uid);
        this.userData = data || {};
        
        
        if (this.userData?.securityCode) {
          this.securityCode = String(this.userData.securityCode);
        } else {
          
          this.securityCode = user.uid;
          this.userData.securityCode = user.uid;
        }
        return;
      }
    } catch {}
    
    this.loadUserData();
    if (this.userData?.securityCode) {
      this.securityCode = String(this.userData.securityCode);
    } else {
      this.ensureSecurityCode();
    }
  }

  

  loadUserData() {
    const stored = localStorage.getItem('userData');
    this.userData = stored ? JSON.parse(stored) : {};
  }

  private async ensureSecurityCode() {
    const validRe = new RegExp(`^[${this.ALPHABET}]{${this.CODE_LEN}}$`);
    const existing = this.userData?.securityCode;

    if (typeof existing === 'string' && validRe.test(existing)) {
      this.securityCode = existing;
      this._addToUsedCodes(existing);
      return;
    }

    
    let code = '';
    const used = this._getUsedCodes();
    do {
      code = this.secureRandomFromAlphabet(this.CODE_LEN, this.ALPHABET);
    } while (used.includes(code));

    this.securityCode = code;
    this.userData = { ...(this.userData || {}), securityCode: code };
    
    
    try {
      const currentUser = this.firebaseService.getCurrentUser();
      if (currentUser) {
        await this.firebaseService.updateUserData(currentUser.uid, { securityCode: code });
      }
    } catch (error) {
      console.error('Failed to save security code to Firebase:', error);
    }
    
    localStorage.setItem('userData', JSON.stringify(this.userData));
    this._addToUsedCodes(code);
    window.dispatchEvent(new CustomEvent('user-profile-updated'));
  }

  private secureRandomFromAlphabet(len: number, alphabet: string): string {
    
    const out: string[] = [];
    const n = alphabet.length;
    const maxUnbiased = Math.floor(256 / n) * n; 

    const buf = new Uint8Array(len * 2); 
    while (out.length < len) {
      crypto.getRandomValues(buf);
      for (let i = 0; i < buf.length && out.length < len; i++) {
        const v = buf[i];
        if (v < maxUnbiased) {
          out.push(alphabet[v % n]);
        }
      }
    }
    return out.join('');
  }

  private _getUsedCodes(): string[] {
    try {
      const raw = localStorage.getItem(this.USED_CODES_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }
  private _addToUsedCodes(code: string) {
    const list = this._getUsedCodes();
    if (!list.includes(code)) {
      list.push(code);
      localStorage.setItem(this.USED_CODES_KEY, JSON.stringify(list));
    }
  }

  async openPhotoSheet() {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Update Profile Picture',
      buttons: [
        { text: 'Take Photo', icon: 'camera', handler: () => this.cameraInput?.nativeElement.click() },
        { text: 'Choose from Gallery', icon: 'image', handler: () => this.galleryInput?.nativeElement.click() },
        { text: 'Cancel', role: 'cancel', icon: 'close' }
      ]
    });
    await sheet.present();
  }

  async onPhotoPicked(ev: Event, _source: 'camera' | 'gallery') {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    try {
      const dataUrl = await this.readFileAsDataURL(file);
      this.userData = { ...(this.userData || {}), photo: dataUrl };
      localStorage.setItem('userData', JSON.stringify(this.userData));
      window.dispatchEvent(new CustomEvent('user-profile-updated'));
      await this.toast('Profile photo updated', 'success');
    } catch {
      await this.toast('Could not load image', 'danger');
    }
  }

  private readFileAsDataURL(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = () => rej(new Error('read error'));
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });
  }

  

  beginNameEdit() {
    if (this.isEditingName) return;
    this.nameDraft = (this.userData.name || '').trim();
    this.isEditingName = true;
  }

  async saveName() {
    if (!this.isEditingName || this.savingName) return;
    this.savingName = true;

    const name = (this.nameDraft || '').trim();
    this.userData = { ...(this.userData || {}), name };
    localStorage.setItem('userData', JSON.stringify(this.userData));
    window.dispatchEvent(new CustomEvent('user-profile-updated'));
    this.isEditingName = false;
    this.savingName = false;
    await this.toast('Name updated', 'success');
  }

  cancelNameEdit() {
    this.isEditingName = false;
    this.savingName = false;
    this.nameDraft = '';
  }

  

  beginEmailEdit() {
    if (this.isEditingEmail) return;
    this.emailDraft = (this.userData.email || '').trim();
    this.isEditingEmail = true;
  }

  async saveEmail() {
    if (!this.isEditingEmail || this.savingEmail) return;
    const email = (this.emailDraft || '').trim();

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await this.toast('Please enter a valid email', 'warning');
      return;
    }

    this.savingEmail = true;
    this.userData = { ...(this.userData || {}), email };
    localStorage.setItem('userData', JSON.stringify(this.userData));
    window.dispatchEvent(new CustomEvent('user-profile-updated'));
    this.isEditingEmail = false;
    this.savingEmail = false;
    await this.toast('Email updated', 'success');
  }

  cancelEmailEdit() {
    this.isEditingEmail = false;
    this.savingEmail = false;
    this.emailDraft = '';
  }

  

  async loadPinState() {
    try {
      const currentUser = this.firebaseService.getCurrentUser();
      if (!currentUser) {
        this.hasPin = false;
        this.maskedPin = '—';
        this.revealedPin = '';
        return;
      }

      const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);
      this.hasPin = !!savedPin;
      if (savedPin) {
        this.maskedPin = this.makeMask(savedPin.length);
        this.revealedPin = savedPin;
      } else {
        this.maskedPin = '—';
        this.revealedPin = '';
      }
    } catch (error) {
      console.error('Failed to load caregiver password:', error);
      this.hasPin = false;
      this.maskedPin = '—';
      this.revealedPin = '';
    }
  }

  makeMask(len: number) {
    const dots = Array(len).fill('•').join('');
    return len > 4 ? dots.replace(/(.{4})/g, '$1 ').trim() : dots;
  }

  /** First segment before comma, else first word (e.g. "yo, yo" → "yo"). */
  displayFirstName(label: string): string {
    const t = (label || '').trim();
    if (!t) return '';
    const comma = t.indexOf(',');
    if (comma >= 0) return t.slice(0, comma).trim();
    const parts = t.split(/\s+/).filter(Boolean);
    return parts[0] || t;
  }

  grantDisplayFirstName(g: PatientAccessGrantSummary): string {
    const name = (g.displayName || '').trim();
    if (name) return this.displayFirstName(name);
    return (g.familyMemberId || '').trim();
  }

  async savePin() {
    if (this.saving) return;
    this.saving = true;

    try {
      const currentUser = this.firebaseService.getCurrentUser();
      if (!currentUser) {
        await this.toast('User not authenticated', 'danger');
        this.saving = false;
        return;
      }

      const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);
      const wasUpdatingExistingPin = !!savedPin;

      if (savedPin) {
        this.hasPin = true;
        this.maskedPin = this.makeMask(savedPin.length);
        this.revealedPin = savedPin;
      } else {
        this.hasPin = false;
        this.maskedPin = '—';
        this.revealedPin = '';
      }
      this.cdr.detectChanges();

      if (savedPin) {
        const cur = (this.form.currentPin || '').trim();
        if (!cur) {
          await this.toast('Enter your current password in the form, then save again.', 'warning');
          this.saving = false;
          return;
        }
        if (cur !== savedPin) {
          await this.toast('Current password is incorrect', 'danger');
          this.saving = false;
          return;
        }
      }

      if (!this.form.newPin || !this.form.confirmPin) {
        await this.toast('Enter and confirm the new password', 'warning');
        this.saving = false; return;
      }
      if (this.form.newPin.length < 4 || this.form.newPin.length > 32) {
        await this.toast('Password must be 4–32 characters', 'warning');
        this.saving = false; return;
      }
      if (this.form.newPin !== this.form.confirmPin) {
        await this.toast('New passwords do not match', 'danger');
        this.saving = false; return;
      }

      
      await this.firebaseService.setCaregiverPassword(currentUser.uid, this.form.newPin);
      
      this.form = { currentPin: '', newPin: '', confirmPin: '' };
      this.showCurrent = this.showNew = this.showConfirm = false;
      this.isEditingPassword = false; 

      await this.loadPinState();
      await this.toast(wasUpdatingExistingPin ? 'Password updated' : 'Password set', 'success');
      
    } catch (error) {
      console.error('Failed to save caregiver password:', error);
      await this.toast('Failed to save password. Please try again.', 'danger');
    }
    
    this.saving = false;
  }

  async promptRemovePin() {
    const alert = await this.alertCtrl.create({
      header: 'Remove password',
      message: 'Enter your current caregiver password to remove it.',
      cssClass: 'alala-ion-alert',
      inputs: [{ name: 'pin', type: 'password', placeholder: 'Current password' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Remove', role: 'confirm', handler: (data) => this.removePin(data?.pin) }
      ],
      backdropDismiss: false
    });
    await alert.present();
  }

  async removePin(inputPin?: string) {
    try {
      const currentUser = this.firebaseService.getCurrentUser();
      if (!currentUser) {
        await this.toast('User not authenticated', 'danger');
        return false;
      }

      const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);
      if (!savedPin) {
        await this.toast('No password to remove', 'warning');
        return false;
      }

      if (!inputPin || inputPin !== savedPin) {
        await this.toast('Incorrect password', 'danger');
        return false;
      }

      await this.firebaseService.removeCaregiverPassword(currentUser.uid);
      await this.loadPinState();
      await this.toast('Password removed', 'success');
      return true;
    } catch (error) {
      console.error('Failed to remove caregiver password:', error);
      await this.toast('Failed to remove password. Please try again.', 'danger');
      return false;
    }
  }

  toggleMask() {
    this.showMasked = !this.showMasked;
  }

  

  goToPatientsDashboard() {
    this.router.navigate(['/patients-dashboard']);
  }

  async confirmGoToPatientsForSwitch() {
    const ok = await this.confirmService.confirm({
      title: 'Go to Patients?',
      message:
        'You’ll open the Patients tab to choose who you’re sending invites for. Come back to Settings afterward.',
      confirmText: 'Go to Patients',
      cancelText: 'Cancel',
      tone: 'default'
    });
    if (ok) this.goToPatientsDashboard();
  }

  async logout() {
    const ok = await this.confirmService.confirm({
      title: 'Log out?',
      message: 'You will need to sign in again to use the app.',
      confirmText: 'Log out',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      await this.firebaseService.logout();
    } catch (e) {
      console.warn('Logout error (continuing redirect):', e);
    }

    try {
      localStorage.removeItem('userLoggedIn');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userId');
      localStorage.removeItem('userData');
      localStorage.removeItem('selectedPatientId');
    } catch {}

    this.router.navigate(['/']);
  }

  async clearAllData() {
    const ok = await this.confirmService.confirm({
      title: 'Clear all local data?',
      message: 'This removes cached cards, sessions, and patient details on this device. It can’t be undone.',
      confirmText: 'Clear',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    localStorage.removeItem('peopleCards');
    localStorage.removeItem('placesCards');
    localStorage.removeItem('objectsCards');
    localStorage.removeItem('gameSessions');
    localStorage.removeItem('patientDetails');
    await this.confirmService.notify('All local data was cleared.', 'Done');
  }

  private async toast(message: string, _color?: 'success' | 'warning' | 'danger' | 'primary' | 'medium') {
    // Toasts removed for defense UI consistency (use consistent modals instead).
    await this.confirmService.notify(message);
  }

  

  private async initTrustedFamilyPanel() {
    try {
      this.canManageTrustedFamily = await this.firebaseService.isPrimaryCaregiverAccount();
    } catch {
      this.canManageTrustedFamily = false;
    }
    if (!this.canManageTrustedFamily) return;
    try {
      this.patientsForTrustedFamily = await this.firebaseService.getPatients();
    } catch (e) {
      console.warn('Settings: load patients for invites', e);
      this.patientsForTrustedFamily = [];
    }
    this.applyTrustedFamilyPatientFromAppSelection();
    await this.reloadTrustedFamilyLists();
  }

  /** Re-read selected patient from localStorage (single-patient accounts still auto-pick). */
  private async refreshTrustedFamilyPatientContext() {
    if (!this.canManageTrustedFamily) return;
    try {
      this.patientsForTrustedFamily = await this.firebaseService.getPatients();
    } catch {
      /* keep previous list */
    }
    this.applyTrustedFamilyPatientFromAppSelection();
    await this.reloadTrustedFamilyLists();
  }

  /**
   * Uses the same patient as the rest of the app (Patients tab selection).
   * If you only have one patient, that one is used automatically.
   */
  private applyTrustedFamilyPatientFromAppSelection() {
    const list = this.patientsForTrustedFamily;
    if (list.length === 0) {
      this.trustedFamilyPatientId = '';
      return;
    }
    if (list.length === 1) {
      this.trustedFamilyPatientId = list[0].id;
      return;
    }
    let sel = '';
    try {
      sel = (localStorage.getItem('selectedPatientId') || '').trim();
    } catch {
      sel = '';
    }
    this.trustedFamilyPatientId = sel && list.some((p) => p.id === sel) ? sel : '';
  }

  get trustedFamilyPatientLabel(): string {
    const p = this.patientsForTrustedFamily.find((x) => x.id === this.trustedFamilyPatientId);
    if (!p) return '';
    const t = (p.nickname || p.name || '').trim();
    return t || p.id;
  }

  get trustedFamilyPatientPhotoUrl(): string {
    const p = this.patientsForTrustedFamily.find((x) => x.id === this.trustedFamilyPatientId);
    return (p?.photo ?? '').trim();
  }

  private async reloadTrustedFamilyLists() {
    const pid = (this.trustedFamilyPatientId || '').trim();
    if (!pid || !this.canManageTrustedFamily) {
      this.pendingInvitesSent = [];
      this.activeGrants = [];
      return;
    }
    try {
      const [inv, gr] = await Promise.all([
        this.firebaseService.listTrustedInvitesSentForPatient(pid),
        this.firebaseService.listActivePatientAccessGrantsForPatient(pid)
      ]);
      this.pendingInvitesSent = inv;
      this.activeGrants = gr;
      await this.hydrateInviteeDisplayNames();
    } catch (e) {
      console.error('Settings: trusted family lists', e);
      this.pendingInvitesSent = [];
      this.activeGrants = [];
    }
  }

  private async hydrateInviteeDisplayNames() {
    const ids = new Set<string>();
    for (const i of this.pendingInvitesSent) {
      if (i.inviteeUserId) ids.add(i.inviteeUserId);
    }
    for (const id of ids) {
      if (this.inviteeNameCache[id]) continue;
      try {
        const p = await this.firebaseService.getUserProfile(id);
        this.inviteeNameCache[id] = ((p?.name || p?.firstName || '') as string).trim() || id;
      } catch {
        this.inviteeNameCache[id] = id;
      }
    }
  }

  inviteeDisplayName(uid: string) {
    return this.inviteeNameCache[uid] || uid;
  }

  async sendTrustedFamilyInvite() {
    const pid = (this.trustedFamilyPatientId || '').trim();
    const contact = (this.trustedFamilyContact || '').trim();
    if (!this.canManageTrustedFamily) return;
    if (!pid) {
      await this.confirmService.notify(
        'Choose a patient on the Patients tab first, then come back here.',
        'Pick a patient'
      );
      return;
    }
    if (!contact) {
      await this.confirmService.notify('Enter an email or contact number.', 'Contact required', {
        afterDismiss: () => {
          this.trustedFamilyContact = '';
        }
      });
      return;
    }
    this.trustedFamilyLoading = true;
    try {
      await this.firebaseService.sendTrustedPatientAccessInvite(pid, contact);
      await this.reloadTrustedFamilyLists();
      await this.confirmService.notify(
        'Invitation sent. They can accept it from their Patients screen.',
        'Sent',
        {
          afterDismiss: () => {
            this.trustedFamilyContact = '';
          }
        }
      );
    } catch (e: any) {
      await this.confirmService.notify(e?.message || 'Could not send invite.', 'Error', {
        afterDismiss: () => {
          this.trustedFamilyContact = '';
        }
      });
    } finally {
      this.trustedFamilyLoading = false;
    }
  }

  async onPatientModeToggle() {
    if (!this.isPatientMode) {
      // Trying to enter patient mode
      await this.enablePatientMode();
      return;
    }
    // Already in patient mode - prompt to exit
    await this.promptExitPatientMode();
  }

  private async enablePatientMode() {
    try {
      const currentUser = this.firebaseService.getCurrentUser();
      if (!currentUser) {
        await this.toast('User not authenticated', 'danger');
        return;
      }

      const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);

      if (!savedPin) {
        await this.confirmService.notify(
          'Create a caregiver password first in the Caregiver Password section above.',
          'Password required'
        );
        return;
      }

      const ok = await this.confirmService.confirm({
        title: 'Enter Patient Mode?',
        message: 'You will need your caregiver password to exit Patient Mode.',
        confirmText: 'Continue',
        cancelText: 'Cancel'
      });
      if (!ok) return;

      try {
        localStorage.setItem('pendingPatientMode', 'true');
      } catch {}
      this.router.navigate(['/home']).catch(err => {
        console.error('Navigation to home failed from settings:', err);
      });
    } catch (err) {
      console.error('Error enabling patient mode from settings:', err);
    }
  }

  private async promptExitPatientMode() {
    const currentUser = this.firebaseService.getCurrentUser();
    if (!currentUser) {
      await this.toast('User not authenticated', 'danger');
      return;
    }

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
          handler: async (data) => {
            const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);
            if (data.pin === savedPin) {
              this.isPatientMode = false;
              localStorage.setItem('patientMode', 'false');
              await this.patientModeToast.showStandardModeOn();
              window.dispatchEvent(new CustomEvent('patientMode-changed', { detail: false }));
              return true;
            } else {
              await this.confirmService.notify('That password doesn’t match.', 'Try again');
              return false;
            }
          }
        }
      ],
      backdropDismiss: false
    });
    await alert.present();
  }

  startPasswordEdit() {
    this.isEditingPassword = true;
    
    this.form = {
      currentPin: '',
      newPin: '',
      confirmPin: ''
    };
  }

  cancelPasswordEdit() {
    this.isEditingPassword = false;
    
    this.form = {
      currentPin: '',
      newPin: '',
      confirmPin: ''
    };
  }

  private checkPatientMode() {
    
    const patientMode = localStorage.getItem('patientMode');
    this.isPatientMode = patientMode === 'true';
  }

  goBack() {
    this.router.navigate(['/home']);
  }

  
  toggleSection(section: string) {
    this.expandedSections[section] = !this.expandedSections[section];
  }

  
  async changePassword() {
    const user = this.firebaseService.getCurrentUser();
    if (!user?.email) {
      await this.confirmService.notify(
        'Password change is only available for accounts that signed in with email and password.',
        'Not available'
      );
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Change login password',
      message: 'Updates your Firebase sign-in password. This is not the Patient Mode PIN.',
      cssClass: 'alala-ion-alert',
      inputs: [
        { name: 'cur', type: 'password', placeholder: 'Current password' },
        { name: 'nw', type: 'password', placeholder: 'New password (min. 6 characters)' },
        { name: 'cf', type: 'password', placeholder: 'Confirm new password' }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Update',
          handler: (data) => {
            void this.submitAccountPasswordChange(alert, data as Record<string, unknown>);
            return false;
          }
        }
      ],
      backdropDismiss: false
    });
    await alert.present();
  }

  private async submitAccountPasswordChange(
    alert: { dismiss: () => Promise<boolean> },
    data: Record<string, unknown> | undefined
  ) {
    const current = String(data?.['cur'] ?? '').trim();
    const next = String(data?.['nw'] ?? '').trim();
    const confirm = String(data?.['cf'] ?? '').trim();
    if (!current || !next || !confirm) {
      await this.confirmService.notify('Fill in all fields.', 'Missing info');
      return;
    }
    if (next.length < 6) {
      await this.confirmService.notify('New password must be at least 6 characters.', 'Too short');
      return;
    }
    if (next !== confirm) {
      await this.confirmService.notify('New passwords do not match.', 'Mismatch');
      return;
    }
    try {
      await this.firebaseService.changeSignedInUserPassword(current, next);
      await alert.dismiss();
      await this.confirmService.notify('Your login password was updated.', 'Success');
    } catch (e: any) {
      const code = String(e?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        await this.confirmService.notify('Current password is incorrect.', 'Could not update');
      } else if (code === 'auth/weak-password') {
        await this.confirmService.notify('Choose a stronger password.', 'Weak password');
      } else {
        await this.confirmService.notify(e?.message || 'Could not update password.', 'Error');
      }
    }
  }

  async deletePatient() {
    const selectedPatientId = localStorage.getItem('selectedPatientId');
    if (!selectedPatientId) {
      await this.confirmService.notify('Select a patient first, then try again.', 'No patient selected');
      return;
    }

    const ok = await this.confirmService.confirm({
      title: 'Delete patient?',
      message:
        'This removes the patient and their progress, memories, and settings from your account. This can’t be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      await this.firebaseService.deletePatient(selectedPatientId);
      await this.confirmService.notify('Patient was deleted.', 'Deleted');
      this.router.navigate(['/patients-dashboard']);
    } catch (error) {
      console.error('Error deleting patient:', error);
      await this.confirmService.notify('Could not delete this patient. Please try again.', 'Couldn’t delete');
    }
  }

}
