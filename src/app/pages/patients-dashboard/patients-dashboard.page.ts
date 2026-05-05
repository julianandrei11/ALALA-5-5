import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, LoadingController, PopoverController } from '@ionic/angular';
import { PatientDashboardMenuPopoverComponent } from './patient-dashboard-menu-popover.component';
import {
  FirebaseService,
  PATIENT_OWNER_CAREGIVER_LS_KEY,
  TrustedPatientInvite,
  PatientFamilyAccessRequest
} from '../../services/firebase.service';
import { AppToastService } from '../../services/app-toast.service';
import type { Unsubscribe } from '@firebase/firestore';
import { ConfirmService } from '../../services/confirm.service';
import { MediaService } from '../../services/media.service';
import { birthdayPopoverViewportEvent } from '../../utils/compact-birthday-popover.utils';
import {
  PATIENT_MIN_BIRTH_YMD,
  formatUsDateFromYmd,
  isoNoonFromYmd,
  normalizeDateOnlyFromIso,
  parseManualPatientBirthday,
  patientBirthdayForSave
} from '../../utils/patient-birthday.utils';

interface Patient {
  id: string;
  name?: string;
  nickname?: string;
  photo?: string;
  age?: number;
  gender?: string;
  dateOfBirth?: string;
  /** Caregiver UID who owns this patient in Firestore (required for trusted family). */
  ownerCaregiverId?: string;
}

@Component({
  selector: 'app-patients-dashboard',
  templateUrl: './patients-dashboard.page.html',
  styleUrls: ['./patients-dashboard.page.scss'],
  standalone: false
})
export class PatientsDashboardPage implements OnInit, OnDestroy {
  patients: Patient[] = [];
  displayPatients: Patient[] = [];
  isLoading = false;
  private patientsUnsub?: Unsubscribe;

  // Inline add-patient form state
  showAddForm = false;
  newPatientFirstName = '';
  newPatientLastName = '';
  newPatientNickname = '';
  /** ISO for ion-datetime */
  newPatientBirthday = '';
  /** MM/DD/YYYY manual entry */
  newPatientBirthdayDisplay = '';
  newPatientBirthdayPopoverOpen = false;
  newPatientBirthdayPopoverEvent: Event | undefined;
  newPatientSex = '';
  isSavingPatient = false;

  readonly newPatientMaxBirth = new Date().toISOString();
  readonly newPatientMinBirth = PATIENT_MIN_BIRTH_YMD;

  private get newPatientMaxBirthDate(): Date {
    return new Date(this.newPatientMaxBirth);
  }

  private get newPatientMinBirthDate(): Date {
    return new Date(this.newPatientMinBirth + 'T12:00:00.000Z');
  }

  /** Primary caregiver: can add/delete patients and send invitations. */
  isPrimaryCaregiver = true;
  isTrustedFamilyMember = false;
  pendingTrustedInvites: TrustedPatientInvite[] = [];

  /** Join-code access requests pending caregiver action. */
  pendingFamilyAccessRequests: PatientFamilyAccessRequest[] = [];
  private pendingFamilyAccessUnsub?: Unsubscribe;
  private myFamilyAccessUnsub?: Unsubscribe;

  /** Trusted family: join-code field + live list of own requests. */
  familyJoinCodeInput = '';
  isSubmittingJoinCode = false;
  myFamilyAccessRequests: PatientFamilyAccessRequest[] = [];

  notificationCenterOpen = false;
  notificationCenterTab: 'pending' | 'history' = 'pending';
  notificationHistoryRows: PatientFamilyAccessRequest[] = [];
  isLoadingNotificationHistory = false;

  patientSearch = '';
  genderFilter: 'all' | 'Male' | 'Female' = 'all';
  showGenderFilters = false;
  private patientPhotoUploadBusy = false;

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private popoverCtrl: PopoverController,
    private loadingCtrl: LoadingController,
    private firebaseService: FirebaseService,
    private confirmService: ConfirmService,
    private mediaService: MediaService,
    private appToast: AppToastService
  ) {}

  async ngOnInit() {
    await this.initAccountRoleAndInvites();
    this.setupAccessRequestListeners();
    this.loadPatients();
    this.subscribeToPatients();
  }

  private async initAccountRoleAndInvites(): Promise<void> {
    try {
      const uid = localStorage.getItem('userId');
      if (!uid) return;
      const profile = await this.firebaseService.getUserProfile(uid);
      const role = profile?.role;
      this.isTrustedFamilyMember = role === 'family_member';
      this.isPrimaryCaregiver = role !== 'patient' && role !== 'family_member';
      if (this.isTrustedFamilyMember) {
        this.pendingTrustedInvites = await this.firebaseService.listPendingTrustedPatientInvites();
      } else {
        this.pendingTrustedInvites = [];
      }
    } catch (e) {
      console.warn('initAccountRoleAndInvites:', e);
      this.isPrimaryCaregiver = true;
      this.isTrustedFamilyMember = false;
    }
  }

  private setupAccessRequestListeners(): void {
    try {
      this.pendingFamilyAccessUnsub?.();
      this.myFamilyAccessUnsub?.();
    } catch {
      /* ignore */
    }

    if (this.isPrimaryCaregiver && !this.isTrustedFamilyMember) {
      this.pendingFamilyAccessUnsub = this.firebaseService.subscribePendingPatientFamilyAccessRequests((rows) => {
        this.pendingFamilyAccessRequests = rows;
      });
    }

    if (this.isTrustedFamilyMember) {
      this.myFamilyAccessUnsub = this.firebaseService.subscribeMyPatientFamilyAccessRequestsAsRequester(
        (rows) => {
          this.myFamilyAccessRequests = rows;
        },
        (kind) => {
          void this.appToast.show(
            kind === 'approved'
              ? 'Your access request was approved.'
              : 'Your access request was declined.',
            { color: kind === 'approved' ? 'success' : 'medium' }
          );
          void this.loadPatients();
        }
      );
    }
  }

  get notificationBadgeCount(): number {
    if (this.isTrustedFamilyMember) {
      return this.pendingTrustedInvites.length + this.myFamilyAccessRequests.filter((r) => r.status === 'pending').length;
    }
    return this.pendingFamilyAccessRequests.length;
  }

  async openNotificationCenter(): Promise<void> {
    this.notificationCenterOpen = true;
    this.notificationCenterTab = 'pending';
    await this.refreshNotificationCenterHistory();
  }

  closeNotificationCenter(): void {
    this.notificationCenterOpen = false;
  }

  async onNotificationCenterSegmentChange(ev: Event): Promise<void> {
    const detail = (ev as CustomEvent<{ value?: string }>).detail;
    const v = String(detail?.value || '');
    if (v !== 'pending' && v !== 'history') return;
    this.notificationCenterTab = v;
    if (this.notificationCenterTab === 'history') {
      await this.refreshNotificationCenterHistory();
    }
  }

  async refreshNotificationCenterHistory(): Promise<void> {
    this.isLoadingNotificationHistory = true;
    try {
      if (this.isTrustedFamilyMember) {
        this.notificationHistoryRows = await this.firebaseService.listMyPatientFamilyAccessRequestsAsRequester(50);
      } else {
        this.notificationHistoryRows = await this.firebaseService.listPatientFamilyAccessRequestHistoryForCaregiver(50);
      }
    } catch (e) {
      console.warn('refreshNotificationCenterHistory:', e);
      this.notificationHistoryRows = [];
    } finally {
      this.isLoadingNotificationHistory = false;
    }
  }

  get notificationPendingRows(): PatientFamilyAccessRequest[] {
    if (this.isTrustedFamilyMember) {
      return this.myFamilyAccessRequests.filter((r) => r.status === 'pending');
    }
    return this.pendingFamilyAccessRequests;
  }

  get notificationHistoryFiltered(): PatientFamilyAccessRequest[] {
    return (this.notificationHistoryRows || []).filter((r) => r.status === 'approved' || r.status === 'rejected');
  }

  familyAccessRequestMessage(r: PatientFamilyAccessRequest): string {
    const who = (r.requesterName || 'Someone').trim();
    const patient = (r.patientName || 'this patient').trim();
    return `${who} has requested to be a trusted family member for patient ${patient}.`;
  }

  async submitFamilyJoinCodeRequest(): Promise<void> {
    if (!this.isTrustedFamilyMember) return;
    const raw = (this.familyJoinCodeInput || '').trim();
    this.isSubmittingJoinCode = true;
    try {
      if (!raw) {
        await this.confirmService.notify('Enter the patient code you received from the caregiver.', 'Missing code');
        return;
      }
      await this.firebaseService.submitPatientAccessRequestByJoinCode(raw);
      await this.appToast.show('Request sent successfully');
    } catch (e: any) {
      await this.confirmService.notify(e?.message || 'Could not send request.', 'Error');
    } finally {
      this.familyJoinCodeInput = '';
      this.isSubmittingJoinCode = false;
    }
  }

  async approveFamilyAccessRequest(req: PatientFamilyAccessRequest): Promise<void> {
    const loading = await this.loadingCtrl.create({ message: 'Approving…' });
    await loading.present();
    try {
      await this.firebaseService.approvePatientFamilyAccessRequest(req.id);
      await this.appToast.show('Access granted', { color: 'success' });
      await this.refreshNotificationCenterHistory();
    } catch (e: any) {
      await this.confirmService.notify(e?.message || 'Something went wrong.', 'Couldn’t approve');
    } finally {
      await loading.dismiss();
    }
  }

  async rejectFamilyAccessRequest(req: PatientFamilyAccessRequest): Promise<void> {
    const ok = await this.confirmService.confirm({
      title: 'Decline request?',
      message: 'This trusted family member will not get access.',
      confirmText: 'Decline',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;
    const loading = await this.loadingCtrl.create({ message: 'Updating…' });
    await loading.present();
    try {
      await this.firebaseService.rejectPatientFamilyAccessRequest(req.id);
      await this.appToast.show('Request declined', { color: 'medium' });
      await this.refreshNotificationCenterHistory();
    } catch (e: any) {
      await this.confirmService.notify(e?.message || 'Something went wrong.', 'Couldn’t update');
    } finally {
      await loading.dismiss();
    }
  }

  async refreshPendingInvites(): Promise<void> {
    if (!this.isTrustedFamilyMember) return;
    try {
      this.pendingTrustedInvites = await this.firebaseService.listPendingTrustedPatientInvites();
    } catch {
      /* ignore */
    }
  }

  private applyPatientScope(patient: Patient): void {
    const uid = localStorage.getItem('userId') || '';
    const owner =
      (patient.ownerCaregiverId && patient.ownerCaregiverId.trim()) || uid;
    localStorage.setItem('selectedPatientId', patient.id);
    localStorage.setItem(PATIENT_OWNER_CAREGIVER_LS_KEY, owner);
  }

  async acceptPendingInvite(inv: TrustedPatientInvite): Promise<void> {
    const loading = await this.loadingCtrl.create({ message: 'Accepting…' });
    await loading.present();
    try {
      await this.firebaseService.acceptTrustedPatientInvite(inv.id);
      await this.refreshPendingInvites();
      await this.loadPatients();
    } catch (e: any) {
      await this.confirmService.notify(e?.message || 'Something went wrong.', 'Couldn’t accept');
    } finally {
      await loading.dismiss();
    }
  }

  async declinePendingInvite(inv: TrustedPatientInvite): Promise<void> {
    const ok = await this.confirmService.confirm({
      title: 'Decline access?',
      message: `Decline access to ${inv.patientName || 'this patient'}?`,
      confirmText: 'Decline',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;
    const loading = await this.loadingCtrl.create({ message: 'Updating…' });
    await loading.present();
    try {
      await this.firebaseService.declineTrustedPatientInvite(inv.id);
      await this.refreshPendingInvites();
    } catch (e: any) {
      await this.confirmService.notify(e?.message || 'Something went wrong.', 'Couldn’t update');
    } finally {
      await loading.dismiss();
    }
  }

  async presentInviteTrustedMember(patient: Patient): Promise<void> {
    if (!this.isPrimaryCaregiver || !patient?.id) return;

    const alert = await this.alertCtrl.create({
      header: 'Invite trusted family member',
      message:
        'Enter the email or contact number they used to sign up. They must choose “Trusted family” when creating their account.',
      cssClass: 'alala-ion-alert',
      inputs: [
        {
          name: 'contact',
          type: 'text',
          placeholder: 'Email or contact number'
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Send invitation',
          handler: (data) => {
            const c = (data?.contact || '').trim();
            if (!c) {
              void this.confirmService.notify('Enter an email or contact number.', 'Missing');
              return false;
            }
            void this.sendTrustedInvite(patient, c);
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  private async sendTrustedInvite(patient: Patient, contact: string): Promise<void> {
    const loading = await this.loadingCtrl.create({ message: 'Sending…' });
    await loading.present();
    try {
      await this.firebaseService.sendTrustedPatientAccessInvite(patient.id, contact);
      await this.confirmService.notify(
        'They will see a request on their My Patients screen.',
        'Invitation sent'
      );
    } catch (e: any) {
      await this.confirmService.notify(e?.message || 'Please try again.', 'Couldn’t invite');
    } finally {
      await loading.dismiss();
    }
  }

  ngOnDestroy() {
    try {
      this.patientsUnsub?.();
    } catch {}
    try {
      this.pendingFamilyAccessUnsub?.();
    } catch {}
    try {
      this.myFamilyAccessUnsub?.();
    } catch {}
  }

  async loadPatients() {
    this.isLoading = true;
    try {
      const patientsList = await this.firebaseService.getPatients();
      console.log('Loaded patients:', patientsList);
      this.setPatients(patientsList);
      
      if (this.displayPatients.length === 0) {
        console.log('No patients found for this caregiver');
      }
    } catch (error: any) {
      console.error('Error loading patients:', error);
      await this.confirmService.notify(error.message || 'Failed to load patients.', 'Couldn’t load');
      this.patients = [];
    } finally {
      this.isLoading = false;
    }
  }

  subscribeToPatients() {
    this.patientsUnsub = this.firebaseService.subscribeToPatients((patients) => {
      this.setPatients(patients);
    });
  }

  private setPatients(patients: Patient[]) {
    this.patients = patients || [];
    this.displayPatients = this.patients.filter(p => !!(p.name || '').toString().trim());
  }

  get filteredPatients(): Patient[] {
    let list = this.displayPatients;
    const q = (this.patientSearch || '').trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) || (p.nickname || '').toLowerCase().includes(q)
      );
    }
    if (this.genderFilter !== 'all') {
      list = list.filter((p) => (p.gender || '').toLowerCase() === this.genderFilter.toLowerCase());
    }
    return list;
  }

  get previewPatient(): Patient | null {
    return this.filteredPatients.length ? this.filteredPatients[0] : null;
  }

  trackByPatientId(_i: number, p: Patient): string {
    return p.id;
  }

  toggleGenderFilters(): void {
    this.showGenderFilters = !this.showGenderFilters;
  }

  setGenderFilter(v: 'Male' | 'Female'): void {
    if (this.genderFilter === v) {
      this.genderFilter = 'all';
    } else {
      this.genderFilter = v;
    }
  }

  /** Primary list title: display name (nickname), required for new patients; legacy may fall back to legal name. */
  getPatientDisplayName(p: Patient): string {
    const nick = (p.nickname || '').trim();
    if (nick) return nick;
    return (p.name || '').trim() || 'Patient';
  }

  /** Second line: legal name when display name is the nickname. */
  getPatientLegalLine(p: Patient): string | null {
    const legal = (p.name || '').trim();
    if (!legal) return null;
    if ((p.nickname || '').trim()) return legal;
    return null;
  }

  genderIconName(patient: Patient): string {
    const g = (patient.gender || '').toLowerCase();
    if (g === 'male' || g === 'm') return 'male-outline';
    if (g === 'female' || g === 'f') return 'female-outline';
    return 'male-female-outline';
  }

  getPatientPhoto(patient: Patient): string {
    return (patient.photo || '').trim();
  }

  onPatientAvatarClick(patient: Patient, ev: Event): void {
    ev.stopPropagation();
    void this.presentPatientPhotoActionSheet(patient, ev);
  }

  async openPatientRowMenu(patient: Patient, ev: Event): Promise<void> {
    ev.stopPropagation();
    const pop = await this.popoverCtrl.create({
      component: PatientDashboardMenuPopoverComponent,
      componentProps: {
        variant: 'row',
        showInviteTrustedMember: this.isPrimaryCaregiver,
        showDeletePatient: this.isPrimaryCaregiver,
        showRemoveTrustedAccess: this.isTrustedFamilyMember
      },
      event: ev,
      showBackdrop: true,
      translucent: true,
      dismissOnSelect: true,
      arrow: true,
      cssClass: 'patient-dashboard-menu-popover'
    });
    await pop.present();
    const { data } = await pop.onDidDismiss<string>();
    if (data === 'edit') void this.goEditPatient(patient);
    else if (data === 'invite') void this.presentInviteTrustedMember(patient);
    else if (data === 'delete') void this.confirmAndDeletePatient(patient);
    else if (data === 'removeAccess') void this.confirmAndRemoveTrustedAccess(patient);
  }

  private goEditPatient(patient: Patient): void {
    if (!patient?.id) return;
    this.applyPatientScope(patient);
    void this.router.navigate(['/profile'], { queryParams: { edit: '1' } });
  }

  private async presentPatientPhotoActionSheet(patient: Patient, ev: Event): Promise<void> {
    if (!patient?.id || this.patientPhotoUploadBusy) return;

    const hasPhoto = !!this.getPatientPhoto(patient);
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
    if (data === 'upload') void this.savePatientPhotoFromSource(patient, 'file');
    else if (data === 'camera') void this.savePatientPhotoFromSource(patient, 'camera');
    else if (data === 'gallery') void this.savePatientPhotoFromSource(patient, 'gallery');
  }

  private async savePatientPhotoFromSource(
    patient: Patient,
    source: 'camera' | 'gallery' | 'file'
  ): Promise<void> {
    if (!patient?.id || this.patientPhotoUploadBusy) return;

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
      await this.firebaseService.updatePatientProfilePhoto(patient.id, dataUrl);
    } catch (error: any) {
      await this.confirmService.notify(
        error?.message || 'Failed to upload profile photo.',
        'Couldn’t save photo'
      );
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

  addPatient() {
    this.showAddForm = true;
  }

  cancelAddPatient() {
    if (this.isSavingPatient) return;
    void this.maybeDiscardAddPatient();
  }

  private hasAddPatientDraft(): boolean {
    return !!(
      (this.newPatientFirstName || '').trim() ||
      (this.newPatientLastName || '').trim() ||
      (this.newPatientNickname || '').trim() ||
      (this.newPatientBirthdayDisplay || '').trim() ||
      (this.newPatientBirthday || '').trim() ||
      (this.newPatientSex || '').trim()
    );
  }

  private async maybeDiscardAddPatient() {
    if (!this.hasAddPatientDraft()) {
      this.resetAddPatientForm();
      return;
    }
    const discard = await this.confirmService.confirm({
      title: 'Discard changes?',
      message: 'Are you sure you want to discard the patient details you entered?',
      confirmText: 'Yes',
      cancelText: 'No'
    });
    if (!discard) return;
    this.resetAddPatientForm();
  }

  private resetAddPatientForm() {
    this.showAddForm = false;
    this.clearAddPatientFormFieldsKeepOpen();
  }

  /** Clear add-patient inputs but keep the modal open (e.g. after a save error). */
  private clearAddPatientFormFieldsKeepOpen(): void {
    this.newPatientFirstName = '';
    this.newPatientLastName = '';
    this.newPatientNickname = '';
    this.newPatientBirthday = '';
    this.newPatientBirthdayDisplay = '';
    this.newPatientBirthdayPopoverOpen = false;
    this.newPatientBirthdayPopoverEvent = undefined;
    this.newPatientSex = '';
  }

  openNewPatientBirthdayPopover(ev: Event): void {
    const parsed = parseManualPatientBirthday(
      (this.newPatientBirthdayDisplay || '').trim(),
      this.newPatientMaxBirthDate,
      this.newPatientMinBirthDate
    );
    if (parsed) {
      this.newPatientBirthday = isoNoonFromYmd(parsed);
    } else if (!this.newPatientBirthday) {
      this.newPatientBirthday = isoNoonFromYmd(
        normalizeDateOnlyFromIso(new Date().toISOString())
      );
    }
    this.newPatientBirthdayPopoverEvent = birthdayPopoverViewportEvent(ev);
    this.newPatientBirthdayPopoverOpen = true;
  }

  closeNewPatientBirthdayPopover(): void {
    this.newPatientBirthdayPopoverOpen = false;
  }

  confirmNewPatientBirthdayPopover(): void {
    const ymd = normalizeDateOnlyFromIso((this.newPatientBirthday || '').toString().trim());
    if (ymd.length >= 10) {
      this.newPatientBirthdayDisplay = formatUsDateFromYmd(ymd.slice(0, 10));
    }
    this.newPatientBirthdayPopoverOpen = false;
  }

  onNewPatientBirthdayPopoverDismiss(): void {
    this.newPatientBirthdayPopoverOpen = false;
    this.newPatientBirthdayPopoverEvent = undefined;
  }

  onNewPatientBirthdayBlur(): void {
    const ymd = parseManualPatientBirthday(
      (this.newPatientBirthdayDisplay || '').trim(),
      this.newPatientMaxBirthDate,
      this.newPatientMinBirthDate
    );
    if (ymd) {
      this.newPatientBirthday = isoNoonFromYmd(ymd);
      this.newPatientBirthdayDisplay = formatUsDateFromYmd(ymd);
    }
  }

  async saveNewPatient() {
    const firstName = (this.newPatientFirstName ?? '').toString().trim();
    const lastName = (this.newPatientLastName ?? '').toString().trim();
    const dateOfBirth = patientBirthdayForSave(
      this.newPatientBirthdayDisplay,
      this.newPatientBirthday,
      this.newPatientMaxBirthDate,
      this.newPatientMinBirthDate
    );
    const sex = (this.newPatientSex ?? '').toString().trim();

    if (!firstName) {
      await this.confirmService.notify('Please enter the patient\'s first name', 'Missing information');
      return;
    }

    if (!lastName) {
      await this.confirmService.notify('Please enter the patient\'s last name', 'Missing information');
      return;
    }

    if (!dateOfBirth) {
      await this.confirmService.notify(
        'Please enter a valid birthday (MM/DD/YYYY) or pick a date from the calendar.',
        'Missing information'
      );
      return;
    }

    if (!sex) {
      await this.confirmService.notify('Please select the patient’s sex.', 'Missing information');
      return;
    }

    const nickname = (this.newPatientNickname || '').trim();
    if (!nickname) {
      await this.confirmService.notify('Please enter a display name.', 'Missing information');
      return;
    }

    this.isSavingPatient = true;

    try {
      const ok = await this.confirmService.confirm({
        title: 'Add patient?',
        message: 'Add this patient to your list?',
        confirmText: 'Add',
        cancelText: 'Cancel'
      });
      if (!ok) return;

      const patientId = await this.firebaseService.addPatient({
        firstName,
        lastName,
        dateOfBirth,
        gender: sex,
        nickname
      });

      localStorage.setItem('selectedPatientId', patientId);
      const uid = localStorage.getItem('userId') || '';
      if (uid) localStorage.setItem(PATIENT_OWNER_CAREGIVER_LS_KEY, uid);
      await this.confirmService.notify('Patient added successfully.', 'Saved', {
        afterDismiss: () => this.resetAddPatientForm()
      });

      // Force reload patients list to ensure it appears on mobile
      await this.loadPatients();
    } catch (error: any) {
      console.error('Error adding patient:', error);
      await this.confirmService.notify(
        error?.message || 'Failed to add patient. Please try again.',
        'Couldn’t save',
        {
          afterDismiss: () => this.clearAddPatientFormFieldsKeepOpen()
        }
      );
    } finally {
      this.isSavingPatient = false;
    }
  }

  selectPatient(patient: Patient) {
    if (!patient || !patient.id) {
      console.error('Invalid patient selected');
      return;
    }

    this.applyPatientScope(patient);
    console.log('Selected patient:', patient.id, patient.name);
    
    // Navigate to home page
    this.router.navigate(['/home']).then(() => {
      console.log('Navigated to home page');
    }).catch((error) => {
      console.error('Navigation error:', error);
      void this.confirmService.notify('Failed to navigate to home', 'Could not navigate');
    });
  }

  async confirmAndRemoveTrustedAccess(patient: Patient): Promise<void> {
    if (!patient?.id || !this.isTrustedFamilyMember) return;
    const owner =
      (patient.ownerCaregiverId && patient.ownerCaregiverId.trim()) ||
      localStorage.getItem(PATIENT_OWNER_CAREGIVER_LS_KEY) ||
      '';
    if (!owner) {
      await this.confirmService.notify('Could not determine the caregiver for this patient.', 'Error');
      return;
    }

    const ok = await this.confirmService.confirm({
      title: 'Remove access?',
      message: `You will no longer see ${this.getPatientDisplayName(patient)} on My Patients until the caregiver shares access again.`,
      confirmText: 'Remove access',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    const loading = await this.loadingCtrl.create({ message: 'Removing…' });
    await loading.present();
    try {
      await this.firebaseService.revokeMyPatientAccessGrant(owner, patient.id);
      const selected = localStorage.getItem('selectedPatientId');
      if (selected === patient.id) {
        localStorage.removeItem('selectedPatientId');
        localStorage.removeItem(PATIENT_OWNER_CAREGIVER_LS_KEY);
      }
      await this.appToast.show('Access removed', { color: 'medium' });
      await this.loadPatients();
    } catch (e: any) {
      await this.confirmService.notify(e?.message || 'Could not remove access.', 'Error');
    } finally {
      await loading.dismiss();
    }
  }

  async confirmAndDeletePatient(patient: Patient) {
    if (!patient?.id) return;
    if (!this.isPrimaryCaregiver) {
      await this.confirmService.notify(
        'Only the primary caregiver can remove a patient record.',
        'Not allowed'
      );
      return;
    }

    const ok = await this.confirmService.confirm({
      title: 'Delete patient?',
      message: `Delete ${this.getPatientDisplayName(patient)}? This can’t be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      await this.firebaseService.deletePatient(patient.id);
      await this.confirmService.notify('Patient deleted successfully.', 'Deleted');
      await this.loadPatients();
    } catch (error: any) {
      await this.confirmService.notify(error?.message || 'Failed to delete patient.', 'Couldn’t delete');
    }
  }

}
