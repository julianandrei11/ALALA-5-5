import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';

@Component({
  selector: 'app-media-albums',
  templateUrl: './media-albums.page.html',
  styleUrls: ['./media-albums.page.scss'],
  standalone: false
})
export class MediaAlbumsPage implements OnInit {

  isPatientMode: boolean = false;

  constructor(private router: Router, private location: Location) {}

  ngOnInit() {
    this.loadPatientMode();
  }

  goBack() {
    this.location.back();
  }

  loadPatientMode() {
    const savedMode = localStorage.getItem('patientMode');
    this.isPatientMode = savedMode === 'true';
  }
}
