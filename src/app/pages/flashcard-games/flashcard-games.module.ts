import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { FlashcardGamesPageRoutingModule } from './flashcard-games-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { FlashcardGamesPage } from './flashcard-games.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    FlashcardGamesPageRoutingModule
  ],
  declarations: [FlashcardGamesPage]
})
export class FlashcardGamesPageModule {}
