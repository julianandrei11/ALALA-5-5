import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MemoryRecallChallengePageRoutingModule } from './memory-recall-challenge-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { MemoryRecallChallengePage } from './memory-recall-challenge.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    MemoryRecallChallengePageRoutingModule,
  ],
  declarations: [MemoryRecallChallengePage],
})
export class MemoryRecallChallengePageModule {}

