import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MemoryCategoriesPage } from './memory-categories.page';

const routes: Routes = [
  {
    path: '',
    component: MemoryCategoriesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MemoryCategoriesPageRoutingModule {}

