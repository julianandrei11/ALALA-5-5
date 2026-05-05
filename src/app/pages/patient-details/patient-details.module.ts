import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PatientDetailsPageRoutingModule } from './patient-details-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { PatientDetailsPage } from './patient-details.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    PatientDetailsPageRoutingModule
  ],
  declarations: [ PatientDetailsPage ]
})
export class PatientDetailsPageModule { }

