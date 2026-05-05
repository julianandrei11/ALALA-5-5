import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { GuessTheSilhouettesPage } from './guess-the-silhouettes.page';

const routes: Routes = [
  {
    path: '',
    component: GuessTheSilhouettesPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GuessTheSilhouettesPageRoutingModule {}
