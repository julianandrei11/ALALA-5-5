import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { VideoMemoriesPageRoutingModule } from './video-memories-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { VideoMemoriesPage } from './video-memories.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    VideoMemoriesPageRoutingModule
  ],
  declarations: [VideoMemoriesPage]
})
export class VideoMemoriesPageModule {}
