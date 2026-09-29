'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useRouter } from 'next/navigation';
import { Camera, ImageUp, X } from 'lucide-react';
import { isDemo, uuidPattern } from '@/lib/config';

const readerId = 'table-qr-reader';
const fileReaderId = 'table-qr-file-reader';

function tableMenuPath(decodedText: string) {
  const url = new URL(decodedText.trim(), window.location.origin);
  const parts = url.pathname.split('/').filter(Boolean);
  const currentQr = parts.length === 2 && parts[0] === 'menu' && uuidPattern.test(parts[1]);
  const publicRedirectQr = parts.length === 2 && parts[0] === 'q' && uuidPattern.test(parts[1]);
  const legacyQr = parts.length === 3 && parts[1] === 'menu' && uuidPattern.test(parts[0]) && uuidPattern.test(parts[2]);

  if (currentQr) return url.pathname;
  if (publicRedirectQr) return `/menu/${parts[1]}`;
  if (isDemo && legacyQr) return url.pathname;
  throw new Error('Invalid table QR code');
}

function cameraErrorMessage(error: unknown) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/notallowed|permission|denied/i.test(message)) {
    return 'Camera permission is blocked. Allow camera access for this site in your browser settings, then try again.';
  }
  if (/notfound|devicesnotfound|no camera/i.test(message)) {
    return 'No camera was found on this device. You can scan a saved QR image instead.';
  }
  if (/notreadable|trackstart|could not start/i.test(message)) {
    return 'The camera is being used by another app. Close that app and try again.';
  }
  if (/timed out|timeout/i.test(message)) {
    return 'The camera permission request timed out. Allow camera access and try again, or select a QR image.';
  }
  return 'The camera could not start. Try selecting a QR image instead.';
}

function newScanner(elementId: string) {
  return new Html5Qrcode(elementId, {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    useBarCodeDetectorIfSupported: true,
    verbose: false,
  });
}

export default function QRScanner() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [error, setError] = useState('');
  const cameraScannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);

  const stopCamera = async () => {
    const scanner = cameraScannerRef.current;
    cameraScannerRef.current = null;
    if (scanner) {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    }
    setIsCameraActive(false);
  };

  useEffect(() => () => {
    const scanner = cameraScannerRef.current;
    cameraScannerRef.current = null;
    if (scanner?.isScanning) void scanner.stop().then(() => scanner.clear()).catch(() => undefined);
    else scanner?.clear();
  }, []);

  const openQr = (decodedText: string) => {
    if (handledRef.current) return;
    try {
      const path = tableMenuPath(decodedText);
      handledRef.current = true;
      void stopCamera().finally(() => {
        setIsOpen(false);
        router.push(path);
      });
    } catch {
      setError('That is not a valid table QR code for this restaurant app.');
    }
  };

  const startCamera = async () => {
    setError('');
    handledRef.current = false;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Live camera scanning requires HTTPS on mobile. Use the deployed HTTPS site, or select a QR image below.');
      return;
    }

    setIsStarting(true);
    const scanner = newScanner(readerId);
    cameraScannerRef.current = scanner;

    try {
      const cameras = await Promise.race([
        Html5Qrcode.getCameras(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Camera request timed out')), 8000)),
      ]);
      const rearCamera = cameras.find(camera => /back|rear|environment/i.test(camera.label)) ?? cameras.at(-1);
      if (!rearCamera) throw new Error('No camera found');

      await scanner.start(
        rearCamera.id,
        { fps: 12, qrbox: { width: 250, height: 250 } },
        decodedText => openQr(decodedText),
        () => undefined,
      );
      setIsCameraActive(true);
    } catch (startError) {
      cameraScannerRef.current = null;
      scanner.clear();
      setError(cameraErrorMessage(startError));
    } finally {
      setIsStarting(false);
    }
  };

  const closeScanner = async () => {
    await stopCamera().catch(() => undefined);
    setError('');
    setIsOpen(false);
  };

  const scanImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    await stopCamera().catch(() => undefined);
    setError('');
    setIsReadingFile(true);
    handledRef.current = false;
    const imageScanner = newScanner(fileReaderId);

    try {
      const decodedText = await imageScanner.scanFile(file, false);
      openQr(decodedText);
    } catch {
      setError('No readable table QR code was found in that image. Try a sharper photo.');
    } finally {
      imageScanner.clear();
      setIsReadingFile(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => { setError(''); setIsOpen(true); }}
        className="w-full bg-slate-900 text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-xl"
      >
        <Camera className="w-5 h-5" />
        Scan Table QR Code
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
      <div className="p-4 flex justify-between items-center bg-slate-900 text-white">
        <h2 className="font-bold text-lg">Scan QR Code</h2>
        <button onClick={() => void closeScanner()} aria-label="Close scanner" className="p-2 bg-slate-800 rounded-full">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-4">
        <div id={readerId} className="w-full max-w-sm min-h-64 rounded-2xl overflow-hidden bg-black border-2 border-slate-700 shadow-2xl" />
        <div id={fileReaderId} className="hidden" />

        {!isCameraActive && (
          <button
            onClick={() => void startCamera()}
            disabled={isStarting}
            className="mt-5 flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white disabled:opacity-60"
          >
            <Camera className="h-5 w-5" />
            {isStarting ? 'Starting camera…' : 'Start camera'}
          </button>
        )}

        {error && <p role="alert" className="mt-4 max-w-sm rounded-xl bg-red-950/70 px-4 py-3 text-center text-sm text-red-100">{error}</p>}
        <p className="text-slate-300 mt-4 text-center text-sm max-w-xs">
          Point the rear camera at the table QR. You can also scan a QR image saved on this phone.
        </p>
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-3 font-semibold text-white">
          <ImageUp className="h-5 w-5" />
          {isReadingFile ? 'Reading image…' : 'Select QR image'}
          <input type="file" accept="image/*" onChange={scanImage} disabled={isReadingFile} className="sr-only" />
        </label>
      </div>
    </div>
  );
}
