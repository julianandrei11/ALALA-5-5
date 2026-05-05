import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MiniGamesPageRoutingModule } from './mini-games-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { MiniGamesPage } from './mini-games.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    MiniGamesPageRoutingModule
  ],
  declarations: [MiniGamesPage]
})
export class MiniGamesPageModule {}
