import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./pages/landing/landing.module').then(m => m.LandingPageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'signup',
    loadChildren: () => import('./pages/signup/signup.module').then(m => m.SignupPageModule)
  },
  {
    path: 'patient-details',
    loadChildren: () => import('./pages/patient-details/patient-details.module').then(m => m.PatientDetailsPageModule)
  },
  {
    path: 'home',
    loadChildren: () => import('./pages/home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'settings',
    loadChildren: () => import('./pages/settings/settings.module').then(m => m.SettingsPageModule)
  },
  {
    path: 'people',
    loadChildren: () => import('./pages/people/people.module').then( m => m.PeoplePageModule)
  },
  {
    path: 'objects',
    loadChildren: () => import('./pages/objects/objects.module').then( m => m.ObjectsPageModule)
  },
  {
    path: 'places',
    loadChildren: () => import('./pages/places/places.module').then( m => m.PlacesPageModule)
  },
  
    {
    path: 'progress',
    loadChildren: () => import('./pages/progress/progress.module').then( m => m.ProgressPageModule)
  },
  {
    path: 'mini-games',
    loadChildren: () => import('./pages/mini-games/mini-games.module').then( m => m.MiniGamesPageModule)
  },
  {
    path: 'memory-matching',
    loadChildren: () => import('./pages/memory-matching/memory-matching.module').then( m => m.MemoryMatchingPageModule)
  },
  {
    path: 'color-sequence',
    loadChildren: () => import('./pages/color-sequence/color-sequence.module').then( m => m.ColorSequencePageModule)
  },
  {
    path: 'word-association',
    loadChildren: () => import('./pages/word-association/word-association.module').then( m => m.WordAssociationPageModule)
  },
  {
    path: 'category-match',
    loadChildren: () => import('./pages/category-match/category-match.module').then( m => m.CategoryMatchPageModule)
  },
  {
    path: 'name-that-memory',
    loadChildren: () => import('./pages/name-that-memory/name-that-memory.module').then( m => m.NameThatMemoryPageModule)
  },
  {
    path: 'photo-memories',
    loadChildren: () => import('./pages/photo-memories/photo-memories.module').then( m => m.PhotoMemoriesPageModule)
  },
  {
    path: 'video-memories',
    loadChildren: () => import('./pages/video-memories/video-memories.module').then( m => m.VideoMemoriesPageModule)
  },
  {
    path: 'add-flashcard',
    loadChildren: () => import('./add-flashcard/add-flashcard.module').then( m => m.AddFlashcardPageModule)
  },
  { path: 'category/:id', loadChildren: () => import('./pages/custom-category/custom-category.module').then(m => m.CustomCategoryModule) },
  {
    path: 'options',
    loadChildren: () => import('./pages/options/options.module').then( m => m.OptionsPageModule)
  },
  {
    path: 'memory-categories',
    loadChildren: () => import('./pages/memory-categories/memory-categories.module').then( m => m.MemoryCategoriesPageModule)
  },
  {
    path: 'media-albums',
    loadChildren: () => import('./pages/media-albums/media-albums.module').then( m => m.MediaAlbumsPageModule)
  },
  {
    path: 'brain-games',
    loadChildren: () => import('./pages/brain-games/brain-games.module').then( m => m.BrainGamesPageModule)
  },
  {
    path: 'brain-game-category/:game',
    loadChildren: () => import('./pages/brain-game-category-select/brain-game-category-select.module').then(m => m.BrainGameCategorySelectPageModule)
  },
  {
    path: 'memory-recall-challenge',
    loadChildren: () => import('./pages/memory-recall-challenge/memory-recall-challenge.module').then(m => m.MemoryRecallChallengePageModule)
  },
  {
    path: 'guess-the-silhouettes',
    loadChildren: () =>
      import('./pages/guess-the-silhouettes/guess-the-silhouettes.module').then(
        (m) => m.GuessTheSilhouettesPageModule
      ),
  },
  {
    path: 'category-performance',
    loadChildren: () => import('./pages/category-performance/category-performance.module').then( m => m.CategoryPerformancePageModule)
  },
  {
    path: 'recent-sessions',
    loadChildren: () => import('./pages/recent-sessions/recent-sessions.module').then( m => m.RecentSessionsPageModule)
  },
  {
    path: 'statistics',
    loadChildren: () => import('./pages/statistics/statistics.module').then( m => m.StatisticsPageModule)
  },
  {
    path: 'profile',
    loadChildren: () => import('./pages/profile/profile.module').then( m => m.ProfilePageModule)
  },
  {
    path: 'patients-dashboard',
    loadChildren: () => import('./pages/patients-dashboard/patients-dashboard.module').then( m => m.PatientsDashboardPageModule)
  }





];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
