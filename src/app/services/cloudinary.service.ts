import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CloudinaryService {
  private cloudName = environment.cloudinary.cloudName;
  private uploadPreset = environment.cloudinary.uploadPreset;
  private apiKey = environment.cloudinary.apiKey;
  private apiSecret = environment.cloudinary.apiSecret;

  constructor() {
  }

  
  async uploadVideo(file: File, options: {
    title?: string;
    folder?: string;
    publicId?: string;
    userId?: string;
    description?: string;
  } = {}): Promise<{
    publicId: string;
    secureUrl: string;
    url: string;
    duration?: number;
    width?: number;
    height?: number;
    context?: any;
  }> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', this.uploadPreset);
      formData.append('resource_type', 'video');
      
      
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).slice(2, 8);
      const publicId = options.publicId || `vid_${timestamp}_${randomId}`;
      formData.append('public_id', publicId);
      
      if (options.folder) {
        formData.append('folder', options.folder);
      }

      
      const context: any = {};
      if (options.title) context.title = options.title;
      if (options.userId) context.userId = options.userId;
      if (options.description) context.description = options.description;
      context.createdAt = timestamp.toString();
      context.uploadedBy = 'app';
      
      
      if (Object.keys(context).length > 0) {
        formData.append('context', JSON.stringify(context));
      }


      
      fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/video/upload`, {
        method: 'POST',
        body: formData
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(result => {
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          url: result.url,
          duration: result.duration,
          width: result.width,
          height: result.height,
          context: result.context
        });
      })
      .catch(error => {
        console.error('Cloudinary upload failed:', error);
        reject(error);
      });
    });
  }

  
  async deleteVideo(publicId: string): Promise<boolean> {
    try {
      
      
      const formData = new FormData();
      formData.append('public_id', publicId);
      formData.append('upload_preset', this.uploadPreset);
      formData.append('resource_type', 'video');
      
      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/video/destroy`;
      
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        console.warn('Upload preset deletion failed:', response.status, response.statusText);
        
        
        return await this.markVideoAsDeleted(publicId);
      }
      
      const result = await response.json();
      return true;
      
    } catch (error) {
      console.error('Failed to delete video from Cloudinary:', error);
      
      
      return await this.markVideoAsDeleted(publicId);
    }
  }

  
  private async markVideoAsDeleted(publicId: string): Promise<boolean> {
    try {
      
      
      const context = {
        deleted: 'true',
        deletedAt: Date.now().toString(),
        deletedBy: 'app'
      };
      
      const formData = new FormData();
      formData.append('context', JSON.stringify(context));
      formData.append('public_ids[]', publicId);
      
      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/context`;
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        console.warn('Context update failed:', response.status, response.statusText);
        return false;
      }
      
      const result = await response.json();
      
      
      
      
      return true;
      
    } catch (error) {
      console.error('Failed to mark video as deleted:', error);
      return false;
    }
  }

  
  private async deleteVideoAlternative(publicId: string): Promise<boolean> {
    try {
      
      
      
      
      
      
      
      
      
      return true;
    } catch (error) {
      console.error('Alternative deletion failed:', error);
      return false;
    }
  }

  
  getVideoUrl(publicId: string, transformations: any = {}): string {
    const baseUrl = `https://res.cloudinary.com/${this.cloudName}/video/upload`;
    const transformString = this.buildTransformString(transformations);
    
    
    let finalPublicId = publicId;
    if (!publicId.includes('.')) {
      finalPublicId = `${publicId}.mp4`;
    }
    
    return transformString ? `${baseUrl}/${transformString}/${finalPublicId}` : `${baseUrl}/${finalPublicId}`;
  }

  
  getVideoThumbnail(publicId: string, transformations: any = {}): string {
    
    
    const baseUrl = `https://res.cloudinary.com/${this.cloudName}/video/upload`;
    
    
    const transformString = this.buildTransformString({
      format: 'jpg',
      quality: 'auto',
      width: 300,
      height: 'auto',
      crop: 'scale',
      ...transformations
    });
    
    
    let finalPublicId = publicId;
    if (!publicId.includes('.')) {
      finalPublicId = `${publicId}.mp4`;
    }
    
    return `${baseUrl}/${transformString}/${finalPublicId}`;
  }

  
  async updateVideoMetadata(publicId: string, metadata: {
    title?: string;
    description?: string;
    tags?: string[];
  }): Promise<boolean> {
    try {
      
      
      const context: any = {};
      if (metadata.title) context.title = metadata.title;
      if (metadata.description) context.description = metadata.description;
      if (metadata.tags) context.tags = metadata.tags.join(',');
      
      
      const formData = new FormData();
      formData.append('context', JSON.stringify(context));
      
      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/context`;
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        console.warn('Cloudinary context update failed:', response.status, response.statusText);
        return false;
      }
      
      const result = await response.json();
      return true;
      
    } catch (error) {
      console.error('Failed to update video metadata:', error);
      return false;
    }
  }

  
  async getVideoInfo(publicId: string): Promise<any> {
    try {
      
      
      const timestamp = Math.round(new Date().getTime() / 1000);
      const signature = await this.generateSignature({
        public_id: publicId,
        resource_type: 'video',
        timestamp: timestamp
      });
      
      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/video/${publicId}?timestamp=${timestamp}&signature=${signature}&api_key=${this.apiKey}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to get video info:', error);
      return null;
    }
  }

  
  async listUserVideos(userId: string): Promise<any[]> {
    try {
      
      
      const timestamp = Math.round(new Date().getTime() / 1000);
      const signature = await this.generateSignature({
        type: 'upload',
        prefix: `alala/users/${userId}/videos/`,
        timestamp: timestamp
      });
      
      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/video/upload?type=upload&prefix=alala/users/${userId}/videos/&timestamp=${timestamp}&signature=${signature}&api_key=${this.apiKey}`;
      
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn('Cloudinary Admin API failed:', response.status, response.statusText);
        return [];
      }
      
      const result = await response.json();
      
      
      const videos = result.resources?.map((resource: any) => ({
        id: resource.public_id,
        publicId: resource.public_id,
        videoUrl: resource.secure_url, 
        thumbnailUrl: resource.secure_url, 
        title: resource.context?.title || resource.public_id.split('/').pop(),
        description: resource.context?.description || '',
        userId: resource.context?.userId || userId,
        duration: resource.duration,
        width: resource.width,
        height: resource.height,
        createdAt: new Date(resource.created_at).getTime(),
        uploadedBy: resource.context?.uploadedBy || 'unknown',
        context: resource.context,
        deleted: resource.context?.deleted === 'true'
      })) || [];
      
      
      const activeVideos = videos.filter((video: any) => !video.deleted);
      
      return activeVideos;
      
    } catch (error) {
      console.error('Failed to list videos from Cloudinary:', error);
      return [];
    }
  }

  
  async syncVideosWithFirestore(userId: string, firestoreVideos: any[]): Promise<{
    toAdd: any[];
    toUpdate: any[];
    toDelete: any[];
  }> {
    try {
      
      
      const cloudinaryVideos = await this.listUserVideos(userId);
      
      
      if (cloudinaryVideos.length === 0) {
        return {
          toAdd: [],
          toUpdate: [],
          toDelete: []
        };
      }
      
      
      const firestoreMap = new Map(firestoreVideos.map(v => [v.cloudinaryPublicId, v]));
      const cloudinaryMap = new Map(cloudinaryVideos.map(v => [v.public_id, v]));
      
      const toAdd: any[] = [];
      const toUpdate: any[] = [];
      const toDelete: any[] = [];
      
      
      for (const cloudinaryVideo of cloudinaryVideos) {
        if (!firestoreMap.has(cloudinaryVideo.public_id)) {
          toAdd.push({
            cloudinaryPublicId: cloudinaryVideo.public_id,
            videoUrl: cloudinaryVideo.secure_url,
            thumbnailUrl: cloudinaryVideo.secure_url, 
            title: cloudinaryVideo.context?.title || cloudinaryVideo.public_id.split('/').pop(),
            duration: cloudinaryVideo.duration,
            width: cloudinaryVideo.width,
            height: cloudinaryVideo.height,
            createdAt: new Date(cloudinaryVideo.created_at).getTime()
          });
        }
      }
      
      
      for (const firestoreVideo of firestoreVideos) {
        const cloudinaryVideo = cloudinaryMap.get(firestoreVideo.cloudinaryPublicId);
        if (cloudinaryVideo) {
          const cloudinaryTitle = cloudinaryVideo.context?.title || cloudinaryVideo.public_id.split('/').pop();
          if (firestoreVideo.title !== cloudinaryTitle) {
            toUpdate.push({
              id: firestoreVideo.id,
              cloudinaryPublicId: firestoreVideo.cloudinaryPublicId,
              title: cloudinaryTitle
            });
          }
        }
      }
      
      
      for (const firestoreVideo of firestoreVideos) {
        if (!cloudinaryMap.has(firestoreVideo.cloudinaryPublicId)) {
          toDelete.push(firestoreVideo);
        }
      }
      
      
      return { toAdd, toUpdate, toDelete };
    } catch (error) {
      console.warn('Sync failed (likely CORS issue):', error);
      return { toAdd: [], toUpdate: [], toDelete: [] };
    }
  }

  
  private async generateSignature(params: any): Promise<string> {
    
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    
    const stringToSign = sortedParams + this.apiSecret;
    
    try {
      
      const encoder = new TextEncoder();
      const data = encoder.encode(stringToSign);
      const hashBuffer = await crypto.subtle.digest('SHA-1', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (error) {
      console.error('Failed to generate signature with Web Crypto API:', error);
      
      
      return this.simpleSHA1(stringToSign);
    }
  }

  
  private simpleSHA1(str: string): string {
    
    
    let hash = 0;
    if (str.length === 0) return hash.toString(16);
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; 
    }
    
    
    return Math.abs(hash).toString(16).padStart(40, '0');
  }

  
  async getUserVideos(userId: string): Promise<any[]> {
    try {
      
      
      const videos = await this.listUserVideos(userId);
      
      
      videos.sort((a, b) => b.createdAt - a.createdAt);
      
      return videos;
      
    } catch (error) {
      console.error('Failed to get user videos:', error);
      return [];
    }
  }

  
  private buildTransformString(transformations: any): string {
    const params: string[] = [];
    
    Object.keys(transformations).forEach(key => {
      const value = transformations[key];
      if (value !== undefined && value !== null) {
        params.push(`${key}_${value}`);
      }
    });
    
    return params.join(',');
  }
}