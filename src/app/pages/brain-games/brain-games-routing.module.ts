import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { BrainGamesPage } from './brain-games.page';

const routes: Routes = [
  {
    path: '',
    component: BrainGamesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BrainGamesPageRoutingModule {}

