import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { BrainGamesPageRoutingModule } from './brain-games-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { BrainGamesPage } from './brain-games.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    BrainGamesPageRoutingModule
  ],
  declarations: [BrainGamesPage]
})
export class BrainGamesPageModule {}

