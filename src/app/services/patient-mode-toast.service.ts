import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';

/**
 * Top toasts for Patient Mode / Standard Mode (replaces full-screen “Done” modals).
 */
@Injectable({ providedIn: 'root' })
export class PatientModeToastService {
  constructor(private toastCtrl: ToastController) {}

  async showPatientModeOn(message = 'Patient Mode is on.'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2600,
      position: 'top',
      cssClass: 'app-toast-patient-mode-on',
    });
    await toast.present();
  }

  async showStandardModeOn(message = 'Standard Mode is on.'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2600,
      position: 'top',
      cssClass: 'app-toast-standard-mode-on',
    });
    await toast.present();
  }
}
