
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, screen, session, Tray } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppCommand, AppSnapshot } from '../renderer/shared/types/index.ts';

const animationMode = process.argv.includes('--animation');
const APP_URL = 'app://chiipt/index.html' + (animationMode ? '?animation=1' : '');
const RENDERER_ROOT = path.resolve(__dirname, '../renderer');

let window: BrowserWindow | null = null;
let tray: Tray | null = null;

let snapshot: AppSnapshot = {
  mode: 'posture',
  character: 'Awake',
  camera: { status: 'stopped', error: null },
  selectedDeviceId: '',
  devices: []
};

const FILES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream'
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

function trusted(contents: Electron.WebContents | null, url: string): boolean {
  return !!window && contents === window.webContents && url === APP_URL;
}

function validSender(event: Electron.IpcMainEvent): boolean {
  return trusted(event.sender, event.senderFrame?.url ?? '')
    && event.senderFrame === event.sender.mainFrame;
}

function isSnapshot(value: unknown): value is AppSnapshot {
  if (!value || typeof value !== 'object') return false;

  const v = value as AppSnapshot;

  return ['Awake', 'FallingAsleep', 'Sleep', 'WakingUp'].includes(v.character)
    && ['posture', 'healing', 'off'].includes(v.mode)
    && (v.walkOn === undefined || typeof v.walkOn === 'boolean')
    && !!v.camera
    && ['stopped', 'starting', 'running', 'error'].includes(v.camera.status)
    && (v.camera.error === null || (typeof v.camera.error === 'string' && v.camera.error.length <= 500))
    && typeof v.selectedDeviceId === 'string'
    && v.selectedDeviceId.length <= 512
    && Array.isArray(v.devices)
    && v.devices.length <= 32
    && v.devices.every(d =>
      !!d
      && typeof d.deviceId === 'string'
      && d.deviceId.length <= 512
      && typeof d.label === 'string'
      && d.label.length <= 200
    );
}

function send(command: AppCommand): void {
  window?.webContents.send('app:command', command);
}

function menu(): Menu {
  const awake = snapshot.character === 'Awake';

  return Menu.buildFromTemplate([
    {
      label: 'ChiiPT · 자세 / 힐링 모드',
      enabled: false
    },
    {
      label: `${snapshot.character} / 카메라 ${snapshot.camera.status}`,
      enabled: false
    },
    { type: 'separator' },
    { label: '기능 선택', enabled: !animationMode, submenu: [
      { label: '자세 모드', type: 'radio', checked: snapshot.mode === 'posture', click: () => send({ type: 'select-mode', mode: 'posture' }) },
      { label: '힐링 모드', type: 'radio', checked: snapshot.mode === 'healing', click: () => send({ type: 'select-mode', mode: 'healing' }) },
      { label: '모두 끄기', type: 'radio', checked: snapshot.mode === 'off', click: () => send({ type: 'select-mode', mode: 'off' }) }
    ] },
    { label: '산책 (마우스 따라가기)', type: 'checkbox', checked: snapshot.walkOn === true, enabled: awake && snapshot.mode === 'healing', click: item => send({ type: 'set-walk', on: item.checked }) },
    { label: '지금 스트레칭', enabled: awake, click: () => send({ type: 'stretch' }) },
    {
      label: '카메라 시작 / 재시도',
      enabled: !animationMode && snapshot.mode !== 'off' && awake && snapshot.camera.status !== 'running' && snapshot.camera.status !== 'starting',
      click: () => send({ type: 'camera-start' })
    },
    {
      label: '카메라 중단',
      click: () => send({ type: 'camera-stop' })
    },
    {
      label: '카메라 선택',
      submenu: [
        {
          label: '시스템 기본 카메라',
          type: 'radio',
          checked: !snapshot.selectedDeviceId,
          click: () => send({ type: 'select-camera', deviceId: '' })
        },
        ...snapshot.devices.filter(device => device.deviceId).map(device => ({
          label: device.label,
          type: 'radio' as const,
          checked: snapshot.selectedDeviceId === device.deviceId,
          click: () => send({ type: 'select-camera', deviceId: device.deviceId })
        })),
        { type: 'separator' },
        {
          label: '장치 목록 새로고침',
          click: () => send({ type: 'refresh-devices' })
        }
      ]
    },
    {
      label: '수면',
      enabled: awake,
      click: () => send({ type: 'sleep' })
    },
    {
      label: '기상',
      enabled: snapshot.character === 'Sleep',
      click: () => send({ type: 'wake' })
    },
    ...(process.argv.includes('--dev')
      ? [
          {
            label: '개발자 도구',
            click: () => window?.webContents.openDevTools({ mode: 'detach' })
          }
        ]
      : []),
    { type: 'separator' },
    {
      label: '종료',
      click: () => app.quit()
    }
  ]);
}

app.whenReady().then(async () => {

  // Serve the renderer entry files and approved application assets.
  protocol.handle('app', async request => {
    try {
      const url = new URL(request.url);

      if (url.host !== 'chiipt' || request.method !== 'GET') {
        return new Response('', { status: 404 });
      }

      const pathname = decodeURIComponent(url.pathname);

      const isEntryFile = [
        '/index.html',
        '/index.js',
        '/styles.css'
      ].includes(pathname);

      const isAssetFile = pathname.startsWith('/assets/');

      if (!isEntryFile && !isAssetFile) {
        return new Response('', { status: 404 });
      }

      const relativePath = pathname.slice(1);
      const filePath = path.resolve(RENDERER_ROOT, relativePath);

      // Prevent access outside the renderer directory.
      if (!filePath.startsWith(`${RENDERER_ROOT}${path.sep}`)) {
        return new Response('', { status: 404 });
      }

      const extension = path.extname(filePath).toLowerCase();
      const mime = FILES[extension];

      if (!mime) {
        return new Response('', { status: 404 });
      }

      const content = await readFile(filePath);

      console.log('[Electron] Asset loaded:', pathname);

      return new Response(content, {
        headers: {
          'Content-Type': mime,
          'X-Content-Type-Options': 'nosniff'
        }
      });

    } catch (error) {
      console.error('[Electron] Resource loading failed:', error);

      return new Response('', { status: 404 });
    }
  });

  let cameraAllowed = false;

  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, _origin, details) =>
      !animationMode && permission === 'media'
      && details.mediaType === 'video'
      && cameraAllowed
      && trusted(contents, contents?.getURL() ?? '')
  );

  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      if (
        animationMode || !trusted(contents, details.requestingUrl)
        || !details.isMainFrame
        || permission !== 'media'
        || !('mediaTypes' in details)
        || !details.mediaTypes
        || details.mediaTypes.length !== 1
        || details.mediaTypes[0] !== 'video'
      ) {
        callback(false);
        return;
      }

      if (cameraAllowed) {
        callback(true);
        return;
      }

      void dialog.showMessageBox(window!, {
        type: 'question',
        title: 'ChiiPT 카메라 권한',
        message: '선택한 웹캠 사용을 허용하시겠습니까?',
        detail: '영상은 저장하거나 전송하지 않습니다. MediaPipe로 선택한 기능의 랜드마크를 기기 안에서 처리합니다.',
        buttons: ['허용', '취소'],
        defaultId: 1,
        cancelId: 1
      }).then(result => {
        cameraAllowed = result.response === 0;
        callback(cameraAllowed);
      }).catch(() => callback(false));
    }
  );

  window = new BrowserWindow({
    ...screen.getPrimaryDisplay().workArea,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    ...(animationMode ? { frame: true, transparent: false, alwaysOnTop: false, resizable: true, movable: true, skipTaskbar: false, backgroundColor: '#f4f2eb' } : {}),

    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      backgroundThrottling: false,
      devTools: process.argv.includes('--dev')
    }
  });

  window.setIgnoreMouseEvents(!animationMode, { forward: true });

  window.webContents.setWindowOpenHandler(() => ({
    action: 'deny'
  }));

  window.webContents.on('will-navigate', event => {
    event.preventDefault();
  });

  window.webContents.on('will-attach-webview', event => {
    event.preventDefault();
  });

  window.webContents.on('render-process-gone', () => {
    app.quit();
  });

  window.on('closed', () => {
    window = null;
  });

  window.once('ready-to-show', () => {
    if (animationMode) window?.show(); else window?.showInactive();
  });

  screen.on('display-metrics-changed', () => {
    if (!animationMode) window?.setBounds(screen.getPrimaryDisplay().workArea);
  });

  ipcMain.on('overlay:interactive', (event, interactive: unknown) => {
    if (!animationMode && validSender(event) && typeof interactive === 'boolean') {
      window?.setIgnoreMouseEvents(!interactive, { forward: true });
    }
  });

  ipcMain.on('overlay:menu', event => {
    if (validSender(event) && window) {
      menu().popup({ window });
    }
  });

  ipcMain.on('app:snapshot', (event, value: unknown) => {
    if (!validSender(event) || !isSnapshot(value)) return;

    snapshot = value;
    tray?.setContextMenu(menu());
  });

  // A generated solid icon avoids introducing an image library or final character asset.
  const icon = nativeImage.createFromBitmap(
    Buffer.from(
      Array(16 * 16)
        .fill([204, 226, 165, 255])
        .flat()
    ),
    { width: 16, height: 16 }
  );

  tray = new Tray(icon);

  tray.setToolTip('ChiiPT · 우클릭으로 카메라 / 수면 / 종료');
  tray.setContextMenu(menu());

  await window.loadURL(APP_URL);

}).catch(error => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  tray?.destroy();
  tray = null;
});
