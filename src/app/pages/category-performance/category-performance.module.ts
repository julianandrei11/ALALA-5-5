import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { CategoryPerformancePageRoutingModule } from './category-performance-routing.module';
import { CategoryPerformancePage } from './category-performance.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CategoryPerformancePageRoutingModule
  ],
  declarations: [CategoryPerformancePage]
})
export class CategoryPerformancePageModule {}

