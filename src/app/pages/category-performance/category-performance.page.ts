import { Component, OnInit } from '@angular/core';
import { FirebaseService } from '../../services/firebase.service';
import {
  buildGameCategoryStatsRows,
  emptyCategoryStatsRows,
  isRecordStatCategory as isRecordStatCategoryUtil,
} from '../../utils/game-category-stats';
import { Location } from '@angular/common';

@Component({
  selector: 'app-category-performance',
  templateUrl: './category-performance.page.html',
  styleUrls: ['./category-performance.page.scss'],
  standalone: false
})
export class CategoryPerformancePage implements OnInit {
  isLoading = true;
  categoryStats: any[] = emptyCategoryStatsRows();

  readonly isRecordStatCategory = isRecordStatCategoryUtil;

  constructor(
    private firebaseService: FirebaseService,
    private location: Location
  ) {}

  async ngOnInit() {
    await this.loadCategoryStats();
    this.isLoading = false;
  }

  async loadCategoryStats() {
    try {
      const sessions = await this.firebaseService.getUserGameSessions();
      this.calculateCategoryStats(sessions);
    } catch (error) {
      console.error('Error loading category stats:', error);
      
      const uid = localStorage.getItem('userId');
      const key = uid ? `gameSessions:${uid}` : 'gameSessions';
      const sessionsData = localStorage.getItem(key);
      if (sessionsData) {
        const sessions = JSON.parse(sessionsData);
        this.calculateCategoryStats(sessions);
      }
    }
  }

  calculateCategoryStats(sessions: any[]) {
    this.categoryStats = buildGameCategoryStatsRows(sessions);
  }

  goBack() {
    this.location.back();
  }
}

