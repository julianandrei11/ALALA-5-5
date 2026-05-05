import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { RecentSessionsPage } from './recent-sessions.page';

const routes: Routes = [
  {
    path: '',
    component: RecentSessionsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RecentSessionsPageRoutingModule {}
