import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { PlacesPageRoutingModule } from './places-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { PlacesPage } from './places.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    PlacesPageRoutingModule
  ],
  declarations: [PlacesPage]
})
export class PlacesPageModule {}
