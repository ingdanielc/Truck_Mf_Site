import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'g-camera',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-camera.component.html',
  styleUrls: ['./g-camera.component.scss'],
})
export class GCameraComponent implements OnInit, OnDestroy {
  @Output() capture = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();

  videoStream: MediaStream | null = null;
  devices: MediaDeviceInfo[] = [];
  selectedDeviceId: string = '';
  error: string | null = null;
  loading: boolean = true;

  constructor() {}

  async ngOnInit() {
    await this.initCamera();
  }

  async initCamera() {
    this.loading = true;
    this.error = null;
    try {
      // First, get list of video devices
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      this.devices = allDevices.filter(
        (device) => device.kind === 'videoinput',
      );

      // Prefer back camera if available (common for mobile)
      const backCamera = this.devices.find(
        (device) =>
          device.label.toLowerCase().includes('back') ||
          device.label.toLowerCase().includes('trasera'),
      );
      this.selectedDeviceId = backCamera
        ? backCamera.deviceId
        : this.devices[0]?.deviceId || '';

      await this.startStream();
    } catch (err) {
      this.error =
        'No se pudo acceder a la cámara. Por favor verifica los permisos.';
      console.error('Camera init error:', err);
    } finally {
      this.loading = false;
    }
  }

  async startStream() {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((track) => track.stop());
    }

    const constraints = {
      video: {
        deviceId: this.selectedDeviceId
          ? { exact: this.selectedDeviceId }
          : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: this.selectedDeviceId ? undefined : 'user',
      },
    };

    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoElement = document.querySelector('video');
      if (videoElement) {
        videoElement.srcObject = this.videoStream;
      }
    } catch (err) {
      this.error = 'Error al iniciar el flujo de video.';
      console.error('Stream start error:', err);
    }
  }

  async switchCamera() {
    if (this.devices.length < 2) return;

    const currentIndex = this.devices.findIndex(
      (d) => d.deviceId === this.selectedDeviceId,
    );
    const nextIndex = (currentIndex + 1) % this.devices.length;
    this.selectedDeviceId = this.devices[nextIndex].deviceId;
    await this.startStream();
  }

  capturePhoto() {
    const video = document.querySelector('video');
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) return;

    // Center crop to square if possible for profile photo
    const size = Math.min(video.videoWidth, video.videoHeight);
    const x = (video.videoWidth - size) / 2;
    const y = (video.videoHeight - size) / 2;

    canvas.width = 600; // Standard size for profile photo
    canvas.height = 600;

    context.drawImage(video, x, y, size, size, 0, 0, 600, 600);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    this.capture.emit(dataUrl);
    this.stopCamera();
  }

  stopCamera() {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((track) => track.stop());
      this.videoStream = null;
    }
  }

  onClose() {
    this.stopCamera();
    this.close.emit();
  }

  ngOnDestroy() {
    this.stopCamera();
  }
}
