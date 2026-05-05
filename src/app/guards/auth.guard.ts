import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  
  constructor(
    private router: Router,
    private firebaseService: FirebaseService
  ) {}
  
  canActivate(): boolean {
    const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
    const storedUserId = localStorage.getItem('userId');
    const currentUser = this.firebaseService.getCurrentUser();
    
    
    
    if (isLoggedIn && storedUserId) {
      return true;
    }
    
    
    if (!isLoggedIn || !currentUser) {
      this.router.navigate(['/']);
      return false;
    }
    
    return true;
  }
}
