import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MemoryRecallChallengePage } from './memory-recall-challenge.page';

const routes: Routes = [
  {
    path: '',
    component: MemoryRecallChallengePage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MemoryRecallChallengePageRoutingModule {}

