import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { VoiceRecorder } from '@jlnkern/capacitor-voice-recorder';

@Injectable({ providedIn: 'root' })
export class MediaService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: BlobPart[] = [];
  private isRecording = false;
  private stream: MediaStream | null = null;
  private webMime = 'audio/webm;codecs=opus';

  constructor() {}

  
  async takePhoto(): Promise<string> {
    try {
      
      const image = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        allowEditing: false,
        correctOrientation: true,
        saveToGallery: true 
      });
      
      return image.dataUrl!;
      
    } catch (error) {
      console.error('Camera photo failed:', error);
      throw new Error('Failed to take photo');
    }
  }

  async chooseFromGallery(): Promise<string> {
    try {
      // Always use Camera plugin with DataUrl for reliable persistence
      const image = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
        allowEditing: false,
        correctOrientation: true
      });
      
      return image.dataUrl!;
      
    } catch (error) {
      console.error('Gallery selection failed:', error);
      throw new Error('Failed to select image from gallery');
    }
  }

  
  async recordAudio(): Promise<void> {
  if (this.isRecording) throw new Error('Already recording');

  if (Capacitor.isNativePlatform()) {
    const perm = await VoiceRecorder.requestAudioRecordingPermission();
    if (!perm.value) throw new Error('Microphone permission denied');
    await VoiceRecorder.startRecording();       
    this.isRecording = true;
    return;                                     
  }

  
  const constraints: any = {
    audio: { 
      echoCancellation: { exact: true }, 
      noiseSuppression: { exact: true }, 
      autoGainControl: { exact: true }, 
      sampleRate: { ideal: 44100 }, 
      channelCount: { exact: 1 }, 
      
      googEchoCancellation: true, 
      googAutoGainControl: true, 
      googNoiseSuppression: true, 
      googHighpassFilter: true, 
      googTypingNoiseDetection: true, 
      googAudioMirroring: false 
    },
  };
  
  this.stream = await navigator.mediaDevices.getUserMedia(constraints);
  
  
  const audioTrack = this.stream.getAudioTracks()[0];
  const settings = audioTrack.getSettings();

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  const supported = candidates.find((c) => (window as any).MediaRecorder?.isTypeSupported?.(c));
  this.webMime = supported ?? 'audio/webm';

  this.mediaRecorder = new MediaRecorder(this.stream, { 
    mimeType: this.webMime,
    audioBitsPerSecond: 128000 
  });
  this.audioChunks = [];

  
  await new Promise<void>((resolve, reject) => {
    const onStart = () => {
      this.mediaRecorder!.removeEventListener('start', onStart);
      this.isRecording = true;
      resolve();
    };
    const onError = (e: any) => {
      this.mediaRecorder?.removeEventListener('start', onStart);
      console.error('MediaRecorder error', e);
      this.cleanup();
      reject(e);
    };

    this.mediaRecorder!.addEventListener('start', onStart);
    this.mediaRecorder!.addEventListener('error', onError);

    this.mediaRecorder!.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
    };

    try {
      this.mediaRecorder!.start(); 
    } catch (err) {
      onError(err);
    }
  });
}


  async stopRecording(): Promise<string> {
    if (!this.isRecording) throw new Error('Not currently recording');

    if (Capacitor.isNativePlatform()) {
      const result = await VoiceRecorder.stopRecording();
      this.isRecording = false;

      const b64 = result?.value?.recordDataBase64;
      const mime = result?.value?.mimeType || 'audio/aac';
      if (!b64) throw new Error('No audio captured');

      
      const dataUrl = `data:${mime};base64,${b64}`;

      
      try {
        const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : 'aac';
        await Filesystem.writeFile({
          path: `voice_recording_${Date.now()}.${ext}`,
          data: b64,
          directory: Directory.Data,
        });
      } catch {  }

      return dataUrl;
    }

    
    const dataUrl = await new Promise<string>((resolve, reject) => {
      if (!this.mediaRecorder) {
        this.cleanup();
        return reject(new Error('No active recorder'));
      }

      this.mediaRecorder.onstop = async () => {
        try {
          if (!this.audioChunks.length) throw new Error('No audio data recorded');
          const mime = this.webMime.includes('ogg') ? 'audio/ogg' : 'audio/webm';
          const blob = new Blob(this.audioChunks, { type: mime });

          
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            this.cleanup();
            resolve(result);
          };
          reader.onerror = (err) => {
            this.cleanup();
            reject(err);
          };
          reader.readAsDataURL(blob);
        } catch (err) {
          this.cleanup();
          reject(err);
        }
      };

      this.mediaRecorder!.stop();
    });

    return dataUrl;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  
  async pickAudioFile(): Promise<{ url: string; base64?: string; mimeType: string; fileName?: string }> {
    try {
      const result = await FilePicker.pickFiles({ 
        types: ['audio/*']
      });
      
      if (!result.files?.length) {
        throw new Error('No audio selected');
      }
      
      const f = result.files[0];

      
      if ((f as any).blob) {
        const blob: Blob = (f as any).blob;
        const base64 = await this.blobToDataUrl(blob);
        
        return { 
          url: base64, 
          base64, 
          mimeType: f.mimeType || blob.type || 'audio/mpeg', 
          fileName: f.name 
        };
      }

      
      if ((f as any).data) {
        const dataUrl = (f as any).data.startsWith('data:')
          ? (f as any).data
          : `data:${f.mimeType || 'audio/mpeg'};base64,${(f as any).data}`;
        return { 
          url: dataUrl, 
          base64: dataUrl, 
          mimeType: f.mimeType || 'audio/mpeg', 
          fileName: f.name 
        };
      }

      
      if (f.path) {
        const webviewUrl = Capacitor.convertFileSrc(f.path);
        return { 
          url: webviewUrl, 
          mimeType: f.mimeType || 'audio/mpeg', 
          fileName: f.name 
        };
      }

      console.error('Unsupported audio file payload:', f);
      throw new Error('Unsupported audio file payload from picker');
    } catch (error) {
      console.error('Audio file picker error:', error);
      throw error;
    }
  }

  
  async pickVideoFile(): Promise<{ url: string; base64?: string; mimeType: string; fileName?: string }> {
    try {
      const result = await FilePicker.pickFiles({ 
        types: ['video/*']
      });
      
      if (!result.files?.length) {
        throw new Error('No video selected');
      }
      
      const f = result.files[0];

      
      if ((f as any).blob) {
        const blob: Blob = (f as any).blob;
        const base64 = await this.blobToDataUrl(blob);
        
        return { 
          url: base64, 
          base64, 
          mimeType: f.mimeType || blob.type || 'video/mp4', 
          fileName: f.name 
        };
      }

      
      if ((f as any).data) {
        const dataUrl = (f as any).data.startsWith('data:')
          ? (f as any).data
          : `data:${f.mimeType || 'video/mp4'};base64,${(f as any).data}`;
        return { 
          url: dataUrl, 
          base64: dataUrl, 
          mimeType: f.mimeType || 'video/mp4', 
          fileName: f.name 
        };
      }

      
      if (f.path) {
        const webviewUrl = Capacitor.convertFileSrc(f.path);
        return { 
          url: webviewUrl, 
          mimeType: f.mimeType || 'video/mp4', 
          fileName: f.name 
        };
      }

      console.error('Unsupported video file payload:', f);
      throw new Error('Unsupported video file payload from picker');
    } catch (error) {
      console.error('Video file picker error:', error);
      throw error;
    }
  }

  
  private cleanup() {
    this.isRecording = false;
    this.audioChunks = [];
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return await res.blob();
  }
}
