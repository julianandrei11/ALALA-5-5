import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { RecentSessionsPageRoutingModule } from './recent-sessions-routing.module';
import { RecentSessionsPage } from './recent-sessions.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RecentSessionsPageRoutingModule
  ],
  declarations: [RecentSessionsPage]
})
export class RecentSessionsPageModule {}
