import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';

@Component({
  selector: 'app-brain-games',
  templateUrl: './brain-games.page.html',
  styleUrls: ['./brain-games.page.scss'],
  standalone: false,
})
export class BrainGamesPage implements OnInit, ViewWillEnter {
  isPatientMode = false;
  greetingName = 'there';
  streakDays = 0;

  constructor(
    private router: Router,
    private firebaseService: FirebaseService,
  ) {}

  ngOnInit() {
    this.loadPatientMode();
    this.refreshStreak();
    void this.loadGreetingName();
  }

  ionViewWillEnter() {
    this.refreshStreak();
    void this.loadGreetingName();
  }

  goBack() {
    void this.router.navigate(['/home']);
  }

  loadPatientMode() {
    const savedMode = localStorage.getItem('patientMode');
    this.isPatientMode = savedMode === 'true';
  }

  private refreshStreak() {
    this.streakDays = this.firebaseService.getBrainStreakDisplayCount();
  }

  private async loadGreetingName() {
    try {
      this.greetingName = await this.firebaseService.getSelectedPatientDisplayName();
    } catch {
      this.greetingName = 'there';
    }
  }

  onPatientModeToggle() {
    this.isPatientMode = !this.isPatientMode;
    localStorage.setItem('patientMode', this.isPatientMode.toString());

    if (this.isPatientMode) {
      void this.router.navigate(['/home']);
    }

    window.dispatchEvent(
      new CustomEvent('patientModeChanged', {
        detail: { isPatientMode: this.isPatientMode },
      }),
    );
  }
}
