import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { MemoryCategoriesPageRoutingModule } from './memory-categories-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { MemoryCategoriesPage } from './memory-categories.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    MemoryCategoriesPageRoutingModule
  ],
  declarations: [MemoryCategoriesPage]
})
export class MemoryCategoriesPageModule {}

