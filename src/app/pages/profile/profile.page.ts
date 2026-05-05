import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { FirebaseService } from '../../services/firebase.service';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { AlertController, LoadingController, PopoverController, ViewWillEnter } from '@ionic/angular';
import { calculateAge, formatFullName } from '../../utils/patient-utils';
import { ConfirmService } from '../../services/confirm.service';
import { PatientModeToastService } from '../../services/patient-mode-toast.service';
import { MediaService } from '../../services/media.service';
import { PatientDashboardMenuPopoverComponent } from '../patients-dashboard/patient-dashboard-menu-popover.component';

interface CaregiverInfo {
  name: string;
  email: string;
  phone?: string;
}

interface PatientInfo {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  name?: string; // legacy fallback
  nickname?: string;
  gender?: string;
  username?: string;
  /** Profile image URL (patientInfo/details or patient root). */
  photo?: string;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false
})
export class ProfilePage implements OnInit, ViewWillEnter {
  
  caregiverInfo: CaregiverInfo | null = null;
  patientInfo: PatientInfo | null = null;
  accountCreated: Date | null = null;
  isPatientMode: boolean = false;
  /** Full Firestore patient document id (unique patient record id). */
  patientId = '';
  patientDocId = '';
  patientPhotoUploadBusy = false;

  isEditingPatient = false;
  editNickname = '';
  editFirstName = '';
  editLastName = '';
  editBirthday = '';
  editSex = '';
  isSavingPatient = false;

  /** Permanent patient join code (caregiver-owned patient only; read-only). */
  patientAccessJoinCode = '';

  constructor(
    private location: Location,
    private firebaseService: FirebaseService,
    private firestore: Firestore,
    private router: Router,
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private confirmService: ConfirmService,
    private patientModeToast: PatientModeToastService,
    private popoverCtrl: PopoverController,
    private loadingCtrl: LoadingController,
    private mediaService: MediaService
  ) {}

  ngOnInit() {
    void this.refreshProfileScreen();
    this.checkPatientMode();
  }

  async ionViewWillEnter() {
    await this.refreshProfileScreen();
    this.checkPatientMode();
    await this.maybeOpenEditFromQuery();
  }

  /** Patients dashboard “Edit” navigates here with ?edit=1 */
  private async maybeOpenEditFromQuery(): Promise<void> {
    const edit = this.route.snapshot.queryParamMap.get('edit');
    if (edit !== '1' || this.isPatientMode) return;

    this.startEditPatient();

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private async refreshProfileScreen() {
    await this.loadProfileData();
    await this.loadPatientInfo();
    await this.loadPatientAccessJoinCode();
  }

  goBack() {
    this.location.back();
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
        this.router.navigate(['/settings']).catch(err => {
          console.error('Navigation to settings failed from profile page:', err);
        });
        return;
      }

      const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);

      if (!savedPin) {
        const go = await this.confirmService.confirm({
          title: 'Password required',
          message: 'Create a caregiver password in Settings first.',
          confirmText: 'Go to Settings',
          cancelText: 'Cancel'
        });
        if (go) {
          this.router.navigate(['/settings']).catch(err => {
            console.error('Navigation to settings failed from profile page:', err);
          });
        }
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
        console.error('Navigation to home failed from profile page:', err);
      });
    } catch (err) {
      console.error('Error enabling patient mode from profile page:', err);
    }
  }

  private async promptExitPatientMode() {
    const currentUser = this.firebaseService.getCurrentUser();
    if (!currentUser) {
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
            }
            void this.confirmService.notify('That password doesn’t match.', 'Try again');
            return false;
          }
        }
      ],
      backdropDismiss: false
    });
    await alert.present();
  }

  private async loadProfileData() {
    try {
      const user = this.firebaseService.getCurrentUser();
      if (!user) {
        this.caregiverInfo = null;
        return;
      }

      const profile = await this.firebaseService.getUserProfile(user.uid);
      const rootName = (profile?.name || '').trim();
      const rootEmail = (profile?.email || user.email || '').trim();
      const docPhone = (
        (profile as unknown as { phoneNumber?: string })?.phoneNumber || ''
      ).trim();
      const nested = profile?.caregiverInfo;

      const profileFirst = ((profile as { firstName?: string })?.firstName || '').trim();
      const profileLast = ((profile as { lastName?: string })?.lastName || '').trim();
      const nameFromProfileParts = [profileFirst, profileLast].filter(Boolean).join(' ').trim();

      let name =
        nameFromProfileParts ||
        (nested?.name || '').trim() ||
        rootName ||
        (user.displayName || '').trim() ||
        this.nameFromUserDataLocal() ||
        'Caregiver';
      let email =
        (nested?.contactEmail || '').trim() ||
        rootEmail ||
        (user.email || '').trim() ||
        this.emailFromUserDataLocal() ||
        '';
      let phone =
        (nested?.contactPhone || '').trim() ||
        docPhone ||
        (user.phoneNumber || '').trim() ||
        this.phoneFromUserDataLocal() ||
        undefined;

      if (!email) email = 'No email provided';

      this.caregiverInfo = {
        name,
        email,
        phone: phone || undefined
      };

      if (user.metadata?.creationTime) {
        this.accountCreated = new Date(user.metadata.creationTime);
      } else if (profile?.createdAt) {
        this.accountCreated = new Date(profile.createdAt);
      }
    } catch {
      const user = this.firebaseService.getCurrentUser();
      if (user) {
        this.caregiverInfo = {
          name: user.displayName || this.nameFromUserDataLocal() || 'Caregiver',
          email: user.email || this.emailFromUserDataLocal() || 'No email provided',
          phone: user.phoneNumber || this.phoneFromUserDataLocal() || undefined
        };
      }
    }
  }

  private nameFromUserDataLocal(): string {
    try {
      const raw = localStorage.getItem('userData');
      if (!raw) return '';
      const u = JSON.parse(raw) as { name?: string; firstName?: string; lastName?: string };
      const n = (u.name || '').trim();
      if (n) return n;
      return [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    } catch {
      return '';
    }
  }

  private emailFromUserDataLocal(): string {
    try {
      const raw = localStorage.getItem('userData');
      if (!raw) return '';
      return ((JSON.parse(raw) as { email?: string }).email || '').trim();
    } catch {
      return '';
    }
  }

  private phoneFromUserDataLocal(): string {
    try {
      const raw = localStorage.getItem('userData');
      if (!raw) return '';
      return ((JSON.parse(raw) as { phoneNumber?: string }).phoneNumber || '').trim();
    } catch {
      return '';
    }
  }

  private async loadPatientInfo() {
    try {
      const user = this.firebaseService.getCurrentUser();
      if (!user) {
        console.error('No user found');
        return;
      }

      // Get the correct patient ID (selected patient or current user)
      const selectedPatientId = localStorage.getItem('selectedPatientId');
      const patientId = selectedPatientId || user.uid;
      this.patientDocId = patientId;
      this.patientId = patientId;

      // Try to load from localStorage first (for quick display)
      const storedPatientInfo = localStorage.getItem('patientDetails');
      if (storedPatientInfo && !selectedPatientId) {
        // Only use localStorage if we're viewing the current user's own patient info
        try {
          const parsed = JSON.parse(storedPatientInfo);
          this.patientInfo = {
            firstName: parsed.firstName || undefined,
            lastName: parsed.lastName || undefined,
            dateOfBirth: parsed.dateOfBirth || parsed.birthday || undefined,
            name: parsed.name || undefined,
            nickname: parsed.nickname || undefined,
            gender: parsed.sex || parsed.gender,
            username: parsed.username || undefined,
            photo: typeof parsed.photo === 'string' ? parsed.photo : undefined
          };
        } catch (e) {
          // If parsing fails, continue to load from Firestore
        }
      }

      // Load from Firestore (always fetch latest data)
      const cgId = user.uid;
      const patientDocRef = doc(this.firestore, 'caregiver', cgId, 'patients', patientId, 'patientInfo', 'details');
      const patientDoc = await getDoc(patientDocRef);
      
      if (patientDoc.exists()) {
        const patientData = patientDoc.data();
        this.patientInfo = {
          firstName: patientData['firstName'] || undefined,
          lastName: patientData['lastName'] || undefined,
          dateOfBirth: patientData['dateOfBirth'] || undefined,
          name: patientData['name'] || '',
          nickname: patientData['nickname'] || undefined,
          gender: patientData['sex'] || patientData['gender'] || '',
          username: patientData['username'] || undefined,
          photo: typeof patientData['photo'] === 'string' ? patientData['photo'] : undefined
        };
        
        // Update localStorage only if viewing own patient info
        if (!selectedPatientId) {
          localStorage.setItem('patientDetails', JSON.stringify({
            firstName: this.patientInfo.firstName || '',
            lastName: this.patientInfo.lastName || '',
            dateOfBirth: this.patientInfo.dateOfBirth || '',
            name: this.getPatientDisplayName(),
            nickname: this.patientInfo.nickname || '',
            sex: this.patientInfo.gender || '',
            username: this.patientInfo.username,
            photo: this.patientInfo.photo || ''
          }));
        }
      } else {
        // If no patient info found, try to get basic info from patient document
        const patientDocRef2 = doc(this.firestore, 'caregiver', cgId, 'patients', patientId);
        const patientDoc2 = await getDoc(patientDocRef2);
        
        if (patientDoc2.exists()) {
          const patientData2 = patientDoc2.data();
          const rootPhoto =
            typeof patientData2['photo'] === 'string' ? (patientData2['photo'] as string) : undefined;
          this.patientInfo = {
            firstName: patientData2['firstName'] || undefined,
            lastName: patientData2['lastName'] || undefined,
            dateOfBirth: patientData2['dateOfBirth'] || undefined,
            name: patientData2['name'] || 'Patient Name',
            nickname: patientData2['nickname'] || undefined,
            gender: patientData2['sex'] || patientData2['gender'] || '',
            username: patientData2['username'] || undefined,
            photo: (this.patientInfo?.photo || rootPhoto || '').trim() || undefined
          };
        }
      }

      if (this.patientInfo && !(this.patientInfo.photo || '').trim()) {
        const patientRootRef = doc(this.firestore, 'caregiver', cgId, 'patients', patientId);
        const pr = await getDoc(patientRootRef);
        if (pr.exists()) {
          const d = pr.data();
          const ph = typeof d['photo'] === 'string' ? (d['photo'] as string).trim() : '';
          if (ph) this.patientInfo = { ...this.patientInfo, photo: ph };
        }
      }

      await this.hydratePatientFromCaregiverAccount(user.uid, patientId, selectedPatientId);
    } catch (error) {
      console.error('Error loading patient info:', error);
    }
  }

  /**
   * Signup stores caregiver first/last name on `caregiver/{uid}` but often not under
   * `patients/{uid}/patientInfo/details` until Edit Profile saves. Fill the patient card
   * from that account doc when viewing your own default patient.
   */
  private async hydratePatientFromCaregiverAccount(
    caregiverUid: string,
    patientId: string,
    selectedPatientId: string | null
  ) {
    const isOwnDefaultPatient = !selectedPatientId || selectedPatientId === caregiverUid;
    if (!isOwnDefaultPatient) return;

    const profile = await this.firebaseService.getUserProfile(caregiverUid);
    if (!profile) return;

    const p = this.patientInfo;
    const hasPatientSubdoc =
      !!p &&
      !!(
        (p.firstName || '').trim() ||
        (p.lastName || '').trim() ||
        (p.dateOfBirth || '').trim() ||
        (p.nickname || '').trim() ||
        ((p.name || '').trim() && (p.name || '').trim() !== 'Patient Name')
      );

    if (hasPatientSubdoc) return;

    const nested = profile.patientInfo;
    const next: PatientInfo = { ...(p || {}) };

    if (nested) {
      next.dateOfBirth = next.dateOfBirth || nested.dateOfBirth;
      next.gender = next.gender || nested.gender;
      next.name = (next.name || nested.name || '').trim() || undefined;
      next.nickname = (next.nickname || nested.name || '').trim() || undefined;
      if (!(next.firstName || '').trim() && !(next.lastName || '').trim() && nested.name) {
        const parts = nested.name.trim().split(/\s+/);
        if (parts.length >= 2) {
          next.firstName = parts[0];
          next.lastName = parts.slice(1).join(' ');
        } else {
          next.firstName = nested.name.trim();
        }
      }
    }

    next.firstName = (next.firstName || profile.firstName || '').trim() || undefined;
    next.lastName = (next.lastName || profile.lastName || '').trim() || undefined;
    next.dateOfBirth = next.dateOfBirth || profile.dateOfBirth;
    next.name =
      (next.name || profile.name || formatFullName(profile.lastName, profile.firstName) || '').trim() ||
      undefined;

    if (!(next.nickname || '').trim()) {
      const friendly = [next.firstName, next.lastName].filter(Boolean).join(' ').trim();
      if (friendly) next.nickname = friendly;
      else if (next.name) next.nickname = next.name.replace(/^([^,]+),\s*(.+)$/, '$2 $1').trim() || next.name;
    }

    const hasAnything =
      (next.firstName || '').trim() ||
      (next.lastName || '').trim() ||
      (next.dateOfBirth || '').trim() ||
      (next.nickname || '').trim() ||
      (next.name || '').trim() ||
      (next.gender || '').trim();

    if (hasAnything) {
      this.patientInfo = next;
    }
  }

  /** Hide “empty” placeholder when we already show real name / fields from account or Firestore. */
  showPatientInfoPlaceholder(): boolean {
    const p = this.patientInfo;
    if (!p) return true;
    if ((p.dateOfBirth || '').trim()) return false;
    if ((p.gender || '').trim()) return false;
    if ((p.username || '').trim()) return false;
    if ((p.firstName || '').trim() || (p.lastName || '').trim()) return false;
    if ((p.nickname || '').trim()) return false;
    const legal = formatFullName(p.lastName, p.firstName) || (p.name || '').toString().trim();
    if (legal && legal !== 'Patient Name') return false;
    const disp = this.getPatientDisplayName();
    return !disp || disp === 'Patient Name';
  }

  getPatientDisplayName(): string {
    const p = this.patientInfo || {};
    const nick = (p.nickname || '').trim();
    if (nick) return nick;
    return (
      formatFullName(p.lastName, p.firstName) ||
      (p.name || '').toString().trim() ||
      'Patient Name'
    );
  }

  getPatientAgeYears(): number | null {
    return calculateAge(this.patientInfo?.dateOfBirth || null);
  }

  getPatientAgeLabel(): string {
    const age = this.getPatientAgeYears();
    if (age === null) return '';
    return `${age} years old`;
  }

  /** Legal name as “First Last” for headers and labels. */
  getPatientLegalFullNameNatural(): string {
    const p = this.patientInfo;
    if (!p) return 'Patient';
    const fn = (p.firstName || '').trim();
    const ln = (p.lastName || '').trim();
    const fromParts = [fn, ln].filter(Boolean).join(' ').trim();
    if (fromParts) return fromParts;
    const raw = (p.name || '').trim();
    if (raw.includes(',')) {
      const [a, b] = raw.split(',').map((s) => s.trim());
      if (b && a) return `${b} ${a}`.trim();
    }
    if (raw) return raw;
    return this.getPatientDisplayName();
  }

  getPatientBirthdayDate(): Date | null {
    const s = (this.patientInfo?.dateOfBirth || '').trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  getPatientPhotoUrl(): string {
    return (this.patientInfo?.photo || '').trim();
  }

  onPatientAvatarClick(ev: Event): void {
    ev.stopPropagation();
    if (this.isPatientMode || this.patientPhotoUploadBusy) return;
    void this.presentPatientPhotoActionSheet(ev);
  }

  async openProfilePatientMenu(ev: Event): Promise<void> {
    ev.stopPropagation();
    if (this.isPatientMode) return;
    const pop = await this.popoverCtrl.create({
      component: PatientDashboardMenuPopoverComponent,
      componentProps: { variant: 'profile' },
      event: ev,
      showBackdrop: true,
      translucent: true,
      dismissOnSelect: true,
      arrow: true,
      cssClass: 'patient-dashboard-menu-popover'
    });
    await pop.present();
    const { data } = await pop.onDidDismiss<string>();
    if (data === 'edit') this.startEditPatient();
  }

  private async presentPatientPhotoActionSheet(ev: Event): Promise<void> {
    if (!this.patientDocId || this.patientPhotoUploadBusy || this.isPatientMode) return;

    const hasPhoto = !!this.getPatientPhotoUrl();
    const pop = await this.popoverCtrl.create({
      component: PatientDashboardMenuPopoverComponent,
      componentProps: { variant: 'photo', hasPhoto },
      event: ev,
      showBackdrop: true,
      translucent: true,
      dismissOnSelect: true,
      arrow: true,
      cssClass: 'patient-dashboard-menu-popover'
    });
    await pop.present();
    const { data } = await pop.onDidDismiss<string>();
    if (data === 'upload') void this.savePatientPhotoFromSource('file');
    else if (data === 'camera') void this.savePatientPhotoFromSource('camera');
    else if (data === 'gallery') void this.savePatientPhotoFromSource('gallery');
  }

  private async savePatientPhotoFromSource(source: 'camera' | 'gallery' | 'file'): Promise<void> {
    if (!this.patientDocId || this.patientPhotoUploadBusy || this.isPatientMode) return;

    let dataUrl: string | null = null;
    try {
      if (source === 'camera') {
        dataUrl = await this.mediaService.takePhoto();
      } else if (source === 'gallery') {
        dataUrl = await this.mediaService.chooseFromGallery();
      } else {
        dataUrl = await this.pickPhotoViaFileInput();
      }
    } catch {
      if (source === 'gallery') {
        dataUrl = await this.pickPhotoViaFileInput();
      }
    }

    if (!dataUrl) return;

    this.patientPhotoUploadBusy = true;
    const loading = await this.loadingCtrl.create({ message: 'Saving photo…' });
    await loading.present();
    try {
      const url = await this.firebaseService.updatePatientProfilePhoto(this.patientDocId, dataUrl);
      this.patientInfo = { ...(this.patientInfo || {}), photo: url };
      const selectedPatientId = localStorage.getItem('selectedPatientId');
      if (!selectedPatientId) {
        try {
          const raw = localStorage.getItem('patientDetails');
          const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          localStorage.setItem(
            'patientDetails',
            JSON.stringify({ ...prev, photo: url })
          );
        } catch {
          /* ignore */
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to upload profile photo.';
      await this.confirmService.notify(msg, 'Couldn’t save photo');
    } finally {
      this.patientPhotoUploadBusy = false;
      await loading.dismiss();
    }
  }

  private pickPhotoViaFileInput(): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      let settled = false;
      const finish = (v: string | null) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onRefocus, true);
        input.remove();
        resolve(v);
      };

      const onRefocus = () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            finish(null);
          }
        }, 500);
      };
      window.addEventListener('focus', onRefocus, true);

      input.onchange = () => {
        window.removeEventListener('focus', onRefocus, true);
        const file = input.files?.[0];
        if (!file) {
          finish(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => finish(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => finish(null);
        reader.readAsDataURL(file);
      };

      input.click();
    });
  }

  startEditPatient() {
    if (this.isPatientMode) return;
    this.isEditingPatient = true;
    const p = this.patientInfo;
    this.editNickname = (p?.nickname || '').toString();
    this.editFirstName = (p?.firstName || '').toString();
    this.editLastName = (p?.lastName || '').toString();
    this.editBirthday = (p?.dateOfBirth || '').toString();
    let sex = (p?.gender || '').toString();
    if (sex === 'Other') sex = '';
    this.editSex = sex;
    if (!this.editNickname.trim()) {
      const guess = `${this.editFirstName} ${this.editLastName}`.trim();
      if (guess) this.editNickname = guess;
    }
  }

  cancelEditPatient() {
    if (this.isSavingPatient) return;
    void this.maybeDiscardEditPatient();
  }

  private hasEditDraft(): boolean {
    const nick = (this.editNickname || '').trim();
    const fn = (this.editFirstName || '').trim();
    const ln = (this.editLastName || '').trim();
    const dob = (this.editBirthday || '').trim();
    const sex = (this.editSex || '').trim();
    const p = this.patientInfo || {};
    return (
      nick !== ((p.nickname || '').toString().trim()) ||
      fn !== ((p.firstName || '').toString().trim()) ||
      ln !== ((p.lastName || '').toString().trim()) ||
      dob !== ((p.dateOfBirth || '').toString().trim()) ||
      sex !== ((p.gender || '').toString().trim())
    );
  }

  private async maybeDiscardEditPatient() {
    if (!this.hasEditDraft()) {
      this.isEditingPatient = false;
      return;
    }
    const discard = await this.confirmService.confirm({
      title: 'Discard changes?',
      message: 'Are you sure you want to discard your edits?',
      confirmText: 'Yes',
      cancelText: 'No'
    });
    if (!discard) return;
    this.isEditingPatient = false;
  }

  async saveEditedPatient() {
    if (this.isSavingPatient) return;
    let nickname = (this.editNickname || '').trim();
    const firstName = (this.editFirstName || '').trim();
    const lastName = (this.editLastName || '').trim();
    const dateOfBirth = (this.editBirthday || '').trim();
    const sex = (this.editSex || '').trim();

    if (!nickname) nickname = `${firstName} ${lastName}`.trim();
    if (!nickname) {
      await this.confirmService.notify(
        'Please enter a display name (or first and last name).',
        'Missing information'
      );
      return;
    }
    if (!firstName) return;
    if (!lastName) return;
    if (!dateOfBirth) return;

    const ok = await this.confirmService.confirm({
      title: 'Save changes?',
      message: 'Save updates to this patient profile?',
      confirmText: 'Save',
      cancelText: 'Cancel'
    });
    if (!ok) return;

    this.isSavingPatient = true;
    try {
      await this.firebaseService.savePatientDetails(
        { firstName, lastName, dateOfBirth, sex, nickname },
        this.patientDocId
      );

      this.patientInfo = {
        ...(this.patientInfo || {}),
        nickname,
        firstName,
        lastName,
        dateOfBirth,
        name: `${lastName}, ${firstName}`,
        gender: sex
      };

      // If viewing own patient info, keep local cache in sync for instant UI
      const selectedPatientId = localStorage.getItem('selectedPatientId');
      if (!selectedPatientId) {
        localStorage.setItem('patientDetails', JSON.stringify({
          firstName,
          lastName,
          dateOfBirth,
          name: `${lastName}, ${firstName}`,
          nickname,
          sex,
          photo: this.patientInfo?.photo || ''
        }));
      }

      this.isEditingPatient = false;
      await this.loadPatientInfo();

      await this.confirmService.notify('Patient profile updated successfully.', 'Saved');
    } catch (err: any) {
      console.error('Error saving edited patient:', err);
      await this.confirmService.notify(err?.message || 'Failed to save changes.', 'Couldn’t save');
    } finally {
      this.isSavingPatient = false;
    }
  }

  private checkPatientMode() {
    
    const patientMode = localStorage.getItem('patientMode');
    this.isPatientMode = patientMode === 'true';
  }

  private async loadPatientAccessJoinCode(): Promise<void> {
    this.patientAccessJoinCode = '';
    if (this.isPatientMode) return;
    try {
      const code = await this.firebaseService.getPatientJoinCodeForOwningCaregiverProfile();
      this.patientAccessJoinCode = (code || '').trim();
    } catch {
      this.patientAccessJoinCode = '';
    }
  }

  async copyPatientAccessJoinCode(): Promise<void> {
    const c = (this.patientAccessJoinCode || '').trim();
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c);
      await this.confirmService.notify('Code copied to clipboard.', 'Copied');
    } catch {
      await this.confirmService.notify('Could not copy automatically. Select and copy the code.', 'Copy');
    }
  }
}
