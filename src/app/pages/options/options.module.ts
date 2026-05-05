import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { OptionsPageRoutingModule } from './options-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { OptionsPage } from './options.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    OptionsPageRoutingModule
  ],
  declarations: [OptionsPage]
})
export class OptionsPageModule {}
