import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MediaAlbumsPage } from './media-albums.page';

const routes: Routes = [
  {
    path: '',
    component: MediaAlbumsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MediaAlbumsPageRoutingModule {}

