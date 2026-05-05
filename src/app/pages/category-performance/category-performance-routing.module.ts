import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CategoryPerformancePage } from './category-performance.page';

const routes: Routes = [
  {
    path: '',
    component: CategoryPerformancePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CategoryPerformancePageRoutingModule {}

