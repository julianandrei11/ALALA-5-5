import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: false
})
export class SignupPage implements ViewWillEnter {
  email: string = '';
  lastName: string = '';
  firstName: string = '';
  phoneNumber: string = '';
  password: string = '';
  confirmPassword: string = '';
  /** Set after user picks on the role sheet. */
  accountRole: 'caregiver' | 'family_member' | null = null;
  isLoading: boolean = false;

  constructor(
    private router: Router,
    private firebaseService: FirebaseService
  ) {}

  /** Show role picker whenever the user opens Sign up (landing or deep link). */
  ionViewWillEnter(): void {
    this.accountRole = null;
    this.email = '';
    this.lastName = '';
    this.firstName = '';
    this.phoneNumber = '';
    this.password = '';
    this.confirmPassword = '';
  }

  pickAccountRole(role: 'caregiver' | 'family_member'): void {
    this.accountRole = role;
  }

  changeAccountType(): void {
    this.accountRole = null;
  }

  async signup() {
    const email = (this.email || '').trim().toLowerCase();
    const lastName = (this.lastName || '').trim();
    const firstName = (this.firstName || '').trim();
    const phoneNumber = (this.phoneNumber || '').trim();
    const password = this.password || '';
    const confirmPassword = this.confirmPassword || '';

    if (!email) {
      alert('Please enter your email');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      alert('Please enter a valid email address');
      return;
    }
    if (!lastName) {
      alert('Please enter your last name');
      return;
    }
    if (!firstName) {
      alert('Please enter your first name');
      return;
    }
    if (!phoneNumber) {
      alert('Please enter your contact number');
      return;
    }
    if (!password) {
      alert('Please enter a password');
      return;
    }
    if (!confirmPassword) {
      alert('Please confirm your password');
      return;
    }

    const phoneDigitsOnly = phoneNumber.replace(/\D/g, '');
    if (phoneDigitsOnly.length < 10) {
      alert('Please enter a valid contact number (at least 10 digits)');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    if (this.accountRole !== 'caregiver' && this.accountRole !== 'family_member') {
      return;
    }

    const displayName = `${lastName}, ${firstName}`;

    this.isLoading = true;

    try {
      const user = await this.firebaseService.signup(
        email,
        password,
        displayName,
        phoneNumber,
        {
          firstName,
          lastName
        },
        undefined,
        undefined,
        this.accountRole as 'caregiver' | 'family_member'
      );

      const userData = {
        firstName,
        lastName,
        name: displayName,
        email,
        phoneNumber,
        createdAt: new Date().toISOString()
      };

      localStorage.setItem('userData', JSON.stringify(userData));
      localStorage.setItem('userLoggedIn', 'true');
      localStorage.setItem('userEmail', email);
      localStorage.setItem('userId', user.uid);

      try {
        localStorage.removeItem('patientDetails');
        ['peopleCards', 'placesCards', 'objectsCards'].forEach(k => localStorage.removeItem(k));
        ['peopleCards_' + user.uid, 'placesCards_' + user.uid, 'objectsCards_' + user.uid].forEach(k =>
          localStorage.removeItem(k)
        );
      } catch {}

      this.router.navigate(['/patients-dashboard'], {
        queryParams: { first: '1' }
      });
    } catch (error: any) {
      console.error('Signup error:', error);
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use') {
        alert('This email is already registered. Please log in.');
      } else if (code === 'auth/weak-password') {
        alert('Password is too weak. Please use a stronger password.');
      } else if (code === 'auth/invalid-email') {
        alert('Invalid email format. Please try again.');
      } else if (error?.message?.includes('Missing or insufficient permissions')) {
        alert('Permission denied. Firestore rules may not be configured correctly. Please contact support.');
      } else {
        alert(error.message || 'Signup failed. Please try again.');
      }
    } finally {
      this.isLoading = false;
    }
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goToLanding() {
    this.router.navigate(['/']);
  }
}
