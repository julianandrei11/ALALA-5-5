import { Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { ConfirmModalComponent } from '../shared/confirm-modal/confirm-modal.component';

/** Optional hook after the confirm/notice modal is dismissed (OK, Cancel, or backdrop). */
export type ConfirmNotifyOptions = {
  afterDismiss?: () => void;
};

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  constructor(private modalCtrl: ModalController) {}

  async confirm(opts: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    tone?: 'default' | 'danger';
    /** Set false for a single primary button (e.g. acknowledge-only). Default true. */
    showDismiss?: boolean;
    /** Runs after the modal closes (any outcome). */
    afterDismiss?: (confirmed: boolean) => void;
  }): Promise<boolean> {
    const modal = await this.modalCtrl.create({
      component: ConfirmModalComponent,
      cssClass: 'app-confirm-modal',
      backdropDismiss: true,
      componentProps: {
        title: opts.title,
        message: opts.message,
        confirmText: opts.confirmText ?? 'OK',
        cancelText: opts.cancelText ?? 'Cancel',
        tone: opts.tone ?? 'default',
        showDismiss: opts.showDismiss !== false
      }
    });

    await modal.present();
    const result = await modal.onWillDismiss<boolean>();
    const ok = result.role !== 'backdrop' && !!result.data;
    try {
      opts.afterDismiss?.(ok);
    } catch {
      /* ignore */
    }
    return ok;
  }

  /**
   * One-button acknowledgment. Primary **OK** on the right (solid).
   * Optional `afterDismiss` runs after the user dismisses the modal (use to clear related inputs).
   */
  async notify(message: string, title = 'Notice', opts?: ConfirmNotifyOptions): Promise<void> {
    await this.confirm({
      title,
      message,
      confirmText: 'OK',
      showDismiss: false,
      afterDismiss: (_confirmed: boolean) => {
        try {
          opts?.afterDismiss?.();
        } catch {
          /* ignore */
        }
      }
    });
  }
}
