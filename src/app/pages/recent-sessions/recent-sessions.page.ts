import { Component, OnInit } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import { Location } from '@angular/common';

@Component({
  selector: 'app-recent-sessions',
  templateUrl: './recent-sessions.page.html',
  styleUrls: ['./recent-sessions.page.scss'],
  standalone: false
})
export class RecentSessionsPage implements OnInit {
  isLoading = true;
  recentSessions: any[] = [];

  constructor(
    private firebaseService: FirebaseService,
    private location: Location
  ) {}

  async ngOnInit() {
    await this.loadRecentSessions();
    this.isLoading = false;
  }

  async loadRecentSessions() {
    try {
      const sessions = await this.firebaseService.getUserGameSessions();
      this.processRecentSessions(sessions);
    } catch (error) {
      console.error('Error loading recent sessions:', error);
      
      const uid = localStorage.getItem('userId');
      const key = uid ? `gameSessions:${uid}` : 'gameSessions';
      const sessionsData = localStorage.getItem(key);
      if (sessionsData) {
        const sessions = JSON.parse(sessionsData);
        this.processRecentSessions(sessions);
      }
    }
  }

  processRecentSessions(sessions: any[]) {
    
    const sortedSessions = sessions
      .filter(session => session.timestamp)
      .sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 20);

    this.recentSessions = sortedSessions.map(session => ({
      ...session,
      date: new Date(session.timestamp),
      accuracy: this.calculateSessionAccuracy(session),
      duration: Math.floor((session.totalTime || 0) / 60)
    }));
  }

  calculateSessionAccuracy(session: any): number {
    if (!session.totalQuestions || session.totalQuestions === 0) return 0;
    return Math.round(((session.correctAnswers || 0) / session.totalQuestions) * 100);
  }

  getAccuracyClass(accuracy: number): string {
    if (accuracy >= 80) return 'excellent';
    if (accuracy >= 60) return 'good';
    if (accuracy >= 40) return 'fair';
    return 'poor';
  }

  goBack() {
    this.location.back();
  }
}

