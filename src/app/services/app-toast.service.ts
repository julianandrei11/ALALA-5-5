import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class AppToastService {
  constructor(private toastCtrl: ToastController) {}

  async show(message: string, opts?: { duration?: number; color?: string; position?: 'top' | 'middle' | 'bottom' }): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: opts?.duration ?? 2800,
      position: opts?.position ?? 'top',
      color: opts?.color ?? 'success',
      cssClass: 'app-toast'
    });
    await toast.present();
  }
}
