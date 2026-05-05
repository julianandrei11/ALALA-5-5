import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { GuessTheSilhouettesPageRoutingModule } from './guess-the-silhouettes-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { GuessTheSilhouettesPage } from './guess-the-silhouettes.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    GuessTheSilhouettesPageRoutingModule,
  ],
  declarations: [GuessTheSilhouettesPage],
})
export class GuessTheSilhouettesPageModule {}
