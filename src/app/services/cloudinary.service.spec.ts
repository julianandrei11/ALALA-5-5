import { TestBed } from '@angular/core/testing';

import { CloudinaryService } from '../services/cloudinary.service';

describe('CloudinaryService', () => {
  let service: CloudinaryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CloudinaryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
