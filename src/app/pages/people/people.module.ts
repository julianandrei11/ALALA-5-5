import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PeoplePageRoutingModule } from './people-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { PeoplePage } from './people.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    PeoplePageRoutingModule
  ],
  declarations: [PeoplePage]
})
export class PeoplePageModule {}
