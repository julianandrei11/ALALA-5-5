import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ProgressPage } from '../progress/progress.page';

interface ColorButton {
  color: string;
  isActive: boolean;
  sound?: string;
}

@Component({
  selector: 'app-color-sequence',
  templateUrl: './color-sequence.page.html',
  styleUrls: ['./color-sequence.page.scss'],
  standalone: false
})
export class ColorSequencePage implements OnInit {
  colors: ColorButton[] = [
    { color: '#ff6b6b', isActive: false }, 
    { color: '#4ecdc4', isActive: false }, 
    { color: '#45b7d1', isActive: false }, 
    { color: '#96ceb4', isActive: false }, 
    { color: '#feca57', isActive: false }, 
    { color: '#ff9ff3', isActive: false }  
  ];

  gameSequence: number[] = [];
  playerSequence: number[] = [];
  currentLevel: number = 1;
  score: number = 0;
  gameStarted: boolean = false;
  gameOver: boolean = false;
  gameWon: boolean = false;
  showingSequence: boolean = false;
  playerTurn: boolean = false;
  sequenceIndex: number = 0;

  constructor(private router: Router, private firebaseService: FirebaseService) { }

  ngOnInit() {
  }

  startGame() {
    this.gameStarted = true;
    this.resetGame();
    this.nextLevel();
  }

  resetGame() {
    this.gameSequence = [];
    this.playerSequence = [];
    this.currentLevel = 1;
    this.score = 0;
    this.gameOver = false;
    this.gameWon = false;
    this.showingSequence = false;
    this.playerTurn = false;
    this.sequenceIndex = 0;
  }

  nextLevel() {
    this.currentLevel++;
    this.playerSequence = [];
    this.addToSequence();
    this.showSequence();
  }

  addToSequence() {
    const randomColor = Math.floor(Math.random() * this.colors.length);
    this.gameSequence.push(randomColor);
  }

  async showSequence() {
    this.showingSequence = true;
    this.playerTurn = false;
    this.sequenceIndex = 0;

    
    await this.delay(1000);

    for (let i = 0; i < this.gameSequence.length; i++) {
      await this.highlightColor(this.gameSequence[i]);
      await this.delay(600);
    }

    this.showingSequence = false;
    this.playerTurn = true;
  }

  async highlightColor(colorIndex: number) {
    this.colors[colorIndex].isActive = true;
    await this.delay(400);
    this.colors[colorIndex].isActive = false;
  }

  playerSelectColor(colorIndex: number) {
    if (!this.playerTurn || this.showingSequence) return;

    this.playerSequence.push(colorIndex);
    this.highlightColor(colorIndex);

    
    const currentStep = this.playerSequence.length - 1;
    if (this.playerSequence[currentStep] !== this.gameSequence[currentStep]) {
      
      this.endGame(false);
      return;
    }

    
    if (this.playerSequence.length === this.gameSequence.length) {
      
      this.score += this.currentLevel * 100;
      this.playerTurn = false;

      if (this.currentLevel >= 10) {
        
        this.endGame(true);
      } else {
        
        setTimeout(() => {
          this.nextLevel();
        }, 1000);
      }
    }
  }

  async endGame(won: boolean) {
    this.gameOver = true;
    this.gameWon = won;
    this.playerTurn = false;
    this.showingSequence = false;

    
    const sessionData = {
      category: 'color-sequence',
      totalQuestions: this.currentLevel,
      correctAnswers: won ? this.currentLevel : this.currentLevel - 1,
      skipped: 0, 
      totalTime: 0, 
      timestamp: Date.now()
    };

    
    try {
      await ProgressPage.saveGameSession(this.firebaseService, sessionData);
      
    } catch (error) {
      console.error('Error saving Color Sequence session:', error);
    }
  }

  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  goHome() {
    this.router.navigate(['/mini-games']);
  }
}
