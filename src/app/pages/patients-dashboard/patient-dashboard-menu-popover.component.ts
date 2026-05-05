import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, PopoverController } from '@ionic/angular';

export type PatientDashboardMenuAction =
  | 'edit'
  | 'delete'
  | 'invite'
  | 'removeAccess'
  | 'upload'
  | 'camera'
  | 'gallery'
  | 'cancel';

@Component({
  selector: 'app-patient-dashboard-menu-popover',
  standalone: true,
  imports: [CommonModule, IonicModule],
  template: `
    <ion-list lines="none" class="patient-dash-menu-list">
      <ng-container *ngIf="variant === 'row'">
        <ion-item button detail="false" class="patient-dash-menu-list__pill" (click)="pick('edit')">Edit</ion-item>
        <ion-item *ngIf="showInviteTrustedMember" button detail="false" class="patient-dash-menu-list__pill" (click)="pick('invite')">
          Invite trusted family
        </ion-item>
        <ion-item
          *ngIf="showRemoveTrustedAccess"
          button
          detail="false"
          class="patient-dash-menu-list__pill patient-dash-menu-list__danger"
          (click)="pick('removeAccess')">
          Remove access
        </ion-item>
        <ion-item
          *ngIf="showDeletePatient"
          button
          detail="false"
          class="patient-dash-menu-list__pill patient-dash-menu-list__danger"
          (click)="pick('delete')">
          Delete
        </ion-item>
        <ion-item button detail="false" lines="none" class="patient-dash-menu-list__pill patient-dash-menu-list__muted" (click)="pick('cancel')">Cancel</ion-item>
      </ng-container>
      <ng-container *ngIf="variant === 'profile'">
        <ion-item button detail="false" class="patient-dash-menu-list__pill" (click)="pick('edit')">Edit patient info</ion-item>
        <ion-item button detail="false" lines="none" class="patient-dash-menu-list__pill patient-dash-menu-list__muted" (click)="pick('cancel')">Cancel</ion-item>
      </ng-container>
      <ng-container *ngIf="variant === 'photo'">
        <ion-item *ngIf="!hasPhoto" button detail="false" class="patient-dash-menu-list__pill" (click)="pick('upload')">Upload photo</ion-item>
        <ion-item button detail="false" class="patient-dash-menu-list__pill" (click)="pick('camera')">Use camera</ion-item>
        <ion-item button detail="false" class="patient-dash-menu-list__pill" (click)="pick('gallery')">Choose from gallery</ion-item>
        <ion-item button detail="false" lines="none" class="patient-dash-menu-list__pill patient-dash-menu-list__muted" (click)="pick('cancel')">Cancel</ion-item>
      </ng-container>
    </ion-list>
  `,
  styles: [
    `
      .patient-dash-menu-list {
        margin: 0;
        padding: 10px;
        background: transparent;
      }
      .patient-dash-menu-list ion-item {
        --background: #f3f4f6;
        --color: #111827;
        --min-height: 44px;
        --border-radius: 999px;
        --padding-start: 18px;
        --padding-end: 18px;
        margin: 0 0 8px;
        font-size: 15px;
        font-weight: 500;
      }
      .patient-dash-menu-list ion-item:last-child {
        margin-bottom: 0;
      }
      .patient-dash-menu-list__danger {
        --color: #dc2626 !important;
        --background: #fef2f2;
      }
      .patient-dash-menu-list__muted {
        --color: #6b7280 !important;
        --background: #f9fafb;
      }
    `
  ]
})
export class PatientDashboardMenuPopoverComponent {
  @Input() variant: 'row' | 'photo' | 'profile' = 'row';
  @Input() hasPhoto = false;
  @Input() showInviteTrustedMember = false;
  @Input() showDeletePatient = true;
  @Input() showRemoveTrustedAccess = false;

  constructor(private popoverCtrl: PopoverController) {}

  pick(action: PatientDashboardMenuAction): void {
    if (action === 'cancel') {
      void this.popoverCtrl.dismiss();
      return;
    }
    void this.popoverCtrl.dismiss(action);
  }
}
