import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ProfilePageRoutingModule } from './profile-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { ProfilePage } from './profile.page';
import { PatientDashboardMenuPopoverComponent } from '../patients-dashboard/patient-dashboard-menu-popover.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    ProfilePageRoutingModule,
    PatientDashboardMenuPopoverComponent
  ],
  declarations: [ProfilePage]
})
export class ProfilePageModule {}
