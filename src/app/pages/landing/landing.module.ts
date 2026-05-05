import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { LandingPageRoutingModule } from './landing-routing.module';
import { LandingPage } from './landing.page';

@NgModule({
  imports: [CommonModule, IonicModule, LandingPageRoutingModule],
  declarations: [LandingPage]
})
export class LandingPageModule {}
