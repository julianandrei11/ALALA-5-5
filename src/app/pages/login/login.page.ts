import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService, PATIENT_OWNER_CAREGIVER_LS_KEY } from '../../services/firebase.service';
import { resolveAuthEmailOrPhone } from '../../utils/auth-email.utils';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false
})
export class LoginPage {
  email: string = '';
  password: string = '';
  isLoading: boolean = false;

  constructor(
    private router: Router,
    private firebaseService: FirebaseService
  ) {}

  async login() {
    if (!this.email || !this.password) {
      alert('Please enter email or contact number and password');
      return;
    }

    const authEmail = resolveAuthEmailOrPhone(this.email);
    if (!authEmail) {
      alert('Please enter a valid email or contact number');
      return;
    }

    this.isLoading = true;

    try {
      const user = await this.firebaseService.login(authEmail, this.password);
      const userData = await this.firebaseService.getUserData(user.uid);

      try {
        const lastUid = localStorage.getItem('userId');
        localStorage.removeItem('gameSessions');
        if (lastUid) localStorage.removeItem(`gameSessions:${lastUid}`);
        localStorage.removeItem('patientDetails');
        localStorage.removeItem('selectedPatientId');
        localStorage.removeItem(PATIENT_OWNER_CAREGIVER_LS_KEY);
        ['peopleCards','placesCards','objectsCards'].forEach(k => localStorage.removeItem(k));
      } catch {}

      localStorage.setItem('userLoggedIn', 'true');
      localStorage.setItem('userEmail', authEmail);
      localStorage.setItem('userId', user.uid);
      if (userData) {
        localStorage.setItem('userData', JSON.stringify(userData));
      }

      try { await this.firebaseService.ensureProgressInitialized(); } catch {}

      const userProfile = await this.firebaseService.getUserProfile(user.uid);
      if (
        userProfile?.role === 'caregiver' ||
        userProfile?.role === 'family_member' ||
        !userProfile?.role ||
        userProfile?.role === 'standard'
      ) {
        this.router.navigate(['/patients-dashboard']);
      } else {
        this.router.navigate(['/home']);
      }
    } catch (error: any) {
      alert('Wrong email, contact number, or password. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  async onForgotPassword() {
    const email = resolveAuthEmailOrPhone(this.email || '');
    if (!email) { alert('Enter your email or contact number first.'); return; }
    try {
      await this.firebaseService.sendPasswordReset(email);
      alert('Password reset email sent. Check your inbox.');
    } catch (e: any) {
      alert(e?.message || 'Could not send reset email.');
    }
  }

  goToLanding() {
    this.router.navigate(['/']);
  }

  goToSignup() {
    void this.router.navigate(['/signup']);
  }
}
