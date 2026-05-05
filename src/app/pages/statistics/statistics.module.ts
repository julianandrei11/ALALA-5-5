import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from '../../shared/shared.module';
import { StatisticsPageRoutingModule } from './statistics-routing.module';
import { StatisticsPage } from './statistics.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, SharedModule, StatisticsPageRoutingModule],
  declarations: [StatisticsPage],
})
export class StatisticsPageModule {}

