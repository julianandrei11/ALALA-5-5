import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ProgressPage } from '../progress/progress.page';

interface Card {
  emoji: string;
  isFlipped: boolean;
  isMatched: boolean;
  id: number;
}

@Component({
  selector: 'app-memory-matching',
  templateUrl: './memory-matching.page.html',
  styleUrls: ['./memory-matching.page.scss'],
  standalone: false
})
export class MemoryMatchingPage implements OnInit {
  cards: Card[] = [];
  flippedCards: number[] = [];
  moves: number = 0;
  score: number = 0;
  matchedPairs: number = 0;
  totalPairs: number = 6;
  gameStarted: boolean = false;
  gameCompleted: boolean = false;

  
  cardEmojis = ['', '', '', '', '', ''];

  constructor(private router: Router, private firebaseService: FirebaseService) { }

  ngOnInit() {
    this.initializeCards();
  }

  initializeCards() {
    this.cards = [];
    const emojis = this.cardEmojis.slice(0, this.totalPairs);
    
    
    emojis.forEach((emoji, index) => {
      this.cards.push({
        emoji: emoji,
        isFlipped: false,
        isMatched: false,
        id: index
      });
      this.cards.push({
        emoji: emoji,
        isFlipped: false,
        isMatched: false,
        id: index
      });
    });

    
    this.shuffleCards();
  }

  shuffleCards() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  startGame() {
    this.gameStarted = true;
    this.resetGame();
  }

  flipCard(index: number) {
    if (this.flippedCards.length >= 2 || 
        this.cards[index].isFlipped || 
        this.cards[index].isMatched) {
      return;
    }

    this.cards[index].isFlipped = true;
    this.flippedCards.push(index);

    if (this.flippedCards.length === 2) {
      this.moves++;
      this.checkForMatch();
    }
  }

  checkForMatch() {
    const [firstIndex, secondIndex] = this.flippedCards;
    const firstCard = this.cards[firstIndex];
    const secondCard = this.cards[secondIndex];

    if (firstCard.emoji === secondCard.emoji) {
      
      setTimeout(() => {
        firstCard.isMatched = true;
        secondCard.isMatched = true;
        this.matchedPairs++;
        this.score += 100;
        this.flippedCards = [];
        
        if (this.matchedPairs === this.totalPairs) {
          this.gameCompleted = true;
          this.calculateFinalScore();
        }
      }, 500);
    } else {
      
      setTimeout(() => {
        firstCard.isFlipped = false;
        secondCard.isFlipped = false;
        this.flippedCards = [];
      }, 1000);
    }
  }

  async calculateFinalScore() {
    
    const efficiency = Math.max(0, 50 - this.moves);
    this.score += efficiency * 10;

    
    const sessionData = {
      category: 'memory-matching',
      totalQuestions: this.totalPairs,
      correctAnswers: this.matchedPairs,
      skipped: 0, 
      totalTime: 0, 
      timestamp: Date.now()
    };

    
    try {
      await ProgressPage.saveGameSession(this.firebaseService, sessionData);
      
    } catch (error) {
      console.error('Error saving Memory Matching session:', error);
    }
  }

  resetGame() {
    this.moves = 0;
    this.score = 0;
    this.matchedPairs = 0;
    this.flippedCards = [];
    this.gameCompleted = false;
    this.initializeCards();
  }

  goHome() {
    this.router.navigate(['/mini-games']);
  }
}
