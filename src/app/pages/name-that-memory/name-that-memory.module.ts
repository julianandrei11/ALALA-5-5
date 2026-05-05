import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { NameThatMemoryPageRoutingModule } from './name-that-memory-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { NameThatMemoryPage } from './name-that-memory.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    NameThatMemoryPageRoutingModule
  ],
  declarations: [NameThatMemoryPage]
})
export class NameThatMemoryPageModule {}
