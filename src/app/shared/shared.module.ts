import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { GlobalHeaderComponent } from './global-header/global-header.component';
import { ConfirmModalComponent } from './confirm-modal/confirm-modal.component';

@NgModule({
  imports: [CommonModule, IonicModule, GlobalHeaderComponent, ConfirmModalComponent],
  exports: [GlobalHeaderComponent, ConfirmModalComponent],
})
export class SharedModule {}
