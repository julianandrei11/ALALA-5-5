import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SharedModule } from '../../shared/shared.module';
import { BrainGameCategorySelectPageRoutingModule } from './brain-game-category-select-routing.module';
import { BrainGameCategorySelectPage } from './brain-game-category-select.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    BrainGameCategorySelectPageRoutingModule,
  ],
  declarations: [BrainGameCategorySelectPage],
})
export class BrainGameCategorySelectPageModule {}
