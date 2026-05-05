import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PatientsDashboardPage } from './patients-dashboard.page';

const routes: Routes = [
  {
    path: '',
    component: PatientsDashboardPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PatientsDashboardPageRoutingModule {}
