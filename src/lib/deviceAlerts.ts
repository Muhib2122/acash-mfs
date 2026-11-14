import { Language } from '../types/acash';
import {
  getVoiceMuted,
  isAudioContextUnlocked,
  playNotificationChime,
  setVoiceMuted,
  unlockSoundAndVoiceGesture,
} from './soundbox';

const OS_NOTIF_PREF_KEY = 'acash_os_notif_enabled_v1';
const HAPTICS_PREF_KEY = 'acash_haptics_enabled_v1';

export type HapticKind = 'tap' | 'success' | 'warning' | 'alert';

export interface DeviceAlertStatus {
  notificationSupported: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  osNotifEnabled: boolean;
  hapticsSupported: boolean;
  hapticsEnabled: boolean;
  audioUnlocked: boolean;
  voiceMuted: boolean;
  isStandalone: boolean;
}

export function isOsNotificationEnabled(): boolean {
  try {
    const raw = localStorage.getItem(OS_NOTIF_PREF_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function setOsNotificationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(OS_NOTIF_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}

export function isHapticsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(HAPTICS_PREF_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTICS_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}

export function getDeviceAlertStatus(): DeviceAlertStatus {
  const notificationSupported =
    typeof window !== 'undefined' && 'Notification' in window;
  const notificationPermission: NotificationPermission | 'unsupported' =
    notificationSupported ? window.Notification.permission : 'unsupported';
  const hapticsSupported =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);

  return {
    notificationSupported,
    notificationPermission,
    osNotifEnabled: isOsNotificationEnabled(),
    hapticsSupported,
    hapticsEnabled: isHapticsEnabled(),
    audioUnlocked: isAudioContextUnlocked(),
    voiceMuted: getVoiceMuted(),
    isStandalone,
  };
}

export function triggerHapticGesture(kind: HapticKind = 'tap'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (!isHapticsEnabled()) return;
  try {
    if (kind === 'tap') {
      navigator.vibrate(14);
    } else if (kind === 'success') {
      navigator.vibrate([35, 35, 60]);
    } else if (kind === 'warning') {
      navigator.vibrate([80, 45, 80]);
    } else {
      navigator.vibrate([130, 60, 130, 60, 140]);
    }
  } catch {
    // ignore unsupported device policies
  }
}

async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (window.Notification.permission === 'granted') return 'granted';
  try {
    const result = await new Promise<NotificationPermission>((resolve) => {
      const maybePromise = window.Notification.requestPermission((cbPerm) => {
        resolve(cbPerm);
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve).catch(() => resolve(window.Notification.permission));
      }
    });
    return result;
  } catch {
    return window.Notification.permission;
  }
}

export interface DispatchSystemNotifParams {
  title: string;
  body: string;
  tag?: string;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  silent?: boolean;
  onClick?: () => void;
}

export async function dispatchSystemNotification(
  params: DispatchSystemNotifParams
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isOsNotificationEnabled()) return false;
  if (!('Notification' in window) || window.Notification.permission !== 'granted') {
    return false;
  }

  const vibratePattern =
    params.severity === 'critical'
      ? [140, 60, 140, 60, 140]
      : params.severity === 'warning'
        ? [90, 50, 90]
        : [50, 30, 70];

  const notifOptions: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
  } = {
    body: params.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: params.tag || `acash-${Date.now()}`,
    renotify: Boolean(params.tag),
    silent: Boolean(params.silent),
    requireInteraction: params.severity === 'critical',
    vibrate: vibratePattern,
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 600)),
      ]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(params.title, notifOptions);
        return true;
      }
    }
  } catch {
    // Fallback to Window Notification API below
  }

  try {
    const n = new window.Notification(params.title, notifOptions);
    if (params.onClick) {
      n.onclick = () => {
        try {
          window.focus();
          params.onClick?.();
          n.close();
        } catch {
          // ignore
        }
      };
    }
    return true;
  } catch {
    return false;
  }
}

export async function requestNativeAlertGestureAccess(
  lang: Language = 'en'
): Promise<{
  permission: NotificationPermission | 'unsupported';
  audioUnlocked: boolean;
  hapticTriggered: boolean;
}> {
  // Always unlock sound & haptic feedback inside the active user gesture
  setVoiceMuted(false);
  setOsNotificationEnabled(true);
  setHapticsEnabled(true);

  const audioOk = await unlockSoundAndVoiceGesture(true);
  triggerHapticGesture('success');

  const permission = await requestBrowserNotificationPermission();

  if (permission === 'granted') {
    await dispatchSystemNotification({
      title:
        lang === 'bn'
          ? 'Acash নোটিফিকেশন ও সাউন্ড সক্রিয় হয়েছে'
          : 'Acash Notifications & Sound Enabled',
      body:
        lang === 'bn'
          ? 'এখন থেকে লেনদেন, গিফট কার্ড ও নিরাপত্তা সতর্কতা সাথে সাথে আপনার ফোন বা পিসিতে পৌঁছাবে।'
          : 'Live transactions, security alerts & festive cards will now alert your phone or PC instantly.',
      tag: 'acash-gesture-enabled',
      severity: 'success',
    });
  }

  return {
    permission,
    audioUnlocked: audioOk,
    hapticTriggered:
      typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  };
}

export async function sendTestDeviceAlert(lang: Language = 'en'): Promise<boolean> {
  await unlockSoundAndVoiceGesture(false);
  playNotificationChime('credit');
  triggerHapticGesture('success');
  return dispatchSystemNotification({
    title:
      lang === 'bn'
        ? 'Acash টেস্ট নোটিফিকেশন'
        : 'Acash Device Alert Test',
    body:
      lang === 'bn'
        ? 'আপনার ডিভাইসের নোটিফিকেশন, সাউন্ড এবং ভাইব্রেশন জেসচার সঠিকভাবে কাজ করছে।'
        : 'Your phone/PC notification gesture, sound chime, and haptic alert are active.',
    tag: 'acash-test-alert',
    severity: 'info',
  });
}
