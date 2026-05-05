import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PhotoMemoriesPageRoutingModule } from './photo-memories-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { PhotoMemoriesPage } from './photo-memories.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    PhotoMemoriesPageRoutingModule
  ],
  declarations: [PhotoMemoriesPage]
})
export class PhotoMemoriesPageModule {}
