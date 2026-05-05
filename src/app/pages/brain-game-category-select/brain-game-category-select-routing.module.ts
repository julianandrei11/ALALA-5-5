import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BrainGameCategorySelectPage } from './brain-game-category-select.page';

const routes: Routes = [
  {
    path: '',
    component: BrainGameCategorySelectPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BrainGameCategorySelectPageRoutingModule {}
