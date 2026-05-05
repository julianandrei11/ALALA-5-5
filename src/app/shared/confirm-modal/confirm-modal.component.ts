import { Component, Input } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';

export type ConfirmModalRole = 'confirm' | 'cancel';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.scss']
})
export class ConfirmModalComponent {
  /** Dialog title; omit in callers with empty string for message-only notices. */
  @Input() title = '';
  @Input() message = '';
  @Input() confirmText = 'OK';
  /** Dismiss action (left, outline): Cancel, Close, or Decline — keep wording consistent per flow. */
  @Input() cancelText = 'Cancel';
  @Input() tone: 'default' | 'danger' = 'default';
  /** When false, only the primary button is shown (typical for simple notices). */
  @Input() showDismiss = true;

  constructor(private modalCtrl: ModalController) {}

  cancel() {
    void this.modalCtrl.dismiss(false, 'cancel' satisfies ConfirmModalRole);
  }

  confirm() {
    void this.modalCtrl.dismiss(true, 'confirm' satisfies ConfirmModalRole);
  }
}

