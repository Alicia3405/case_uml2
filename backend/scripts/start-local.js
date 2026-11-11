/**
 * Arranca el backend NestJS en modo desarrollo local.
 * - Si backend/.env ya tiene MONGODB_URI real, lo respeta sin cambios.
 * - Si no hay MONGODB_URI ni MongoDB escuchando en 127.0.0.1:27017,
 *   inicia automáticamente el binario `mongod` en caché (mongodb-memory-server)
 *   con persistencia en %LOCALAPPDATA%/case-studio-mongo.
 * No afecta scripts de producción (`start:prod`, `build` ni Dockerfile/EC2).
 */
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(BACKEND_ROOT, '.env');
const DEFAULT_MONGO_PORT = 27017;
const DEFAULT_MONGO_HOST = '127.0.0.1';
const DEFAULT_DB_NAME = 'case_studio_ai';

function readEnvFileKeys(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function hasConfiguredMongoUri(envMap) {
  const raw = (
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    envMap.MONGODB_URI ||
    envMap.MONGO_URI ||
    ''
  ).trim();
  if (!raw) return false;
  if (raw.includes('<usuario>') || raw.includes('<password>') || raw.includes('<cluster>')) {
    return false;
  }
  return true;
}

function isPortOpen(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

async function waitForPort(host, port, maxWaitMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    if (await isPortOpen(host, port, 500)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function resolveMongodExecutable() {
  const cacheRoot = path.join(BACKEND_ROOT, 'node_modules', '.cache', 'mongodb-memory-server');
  if (fs.existsSync(cacheRoot)) {
    const entries = fs.readdirSync(cacheRoot);
    const cachedExe = entries.find((name) => /^mongod/i.test(name) && (process.platform !== 'win32' || name.endsWith('.exe')));
    if (cachedExe) {
      return path.join(cacheRoot, cachedExe);
    }
  }

  const { MongoBinary } = require('mongodb-memory-server');
  return MongoBinary.getPath();
}

async function ensureLocalMongoIfNeeded(envMap) {
  if (hasConfiguredMongoUri(envMap)) {
    console.log('ℹ️  Usando MONGODB_URI configurado en entorno / .env.');
    return { mongodProc: null, useLocalUri: false };
  }

  const alreadyOpen = await isPortOpen(DEFAULT_MONGO_HOST, DEFAULT_MONGO_PORT);
  if (alreadyOpen) {
    console.log(`ℹ️  MongoDB ya está activo en ${DEFAULT_MONGO_HOST}:${DEFAULT_MONGO_PORT}.`);
    return { mongodProc: null, useLocalUri: true };
  }

  const dbPath = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'case-studio-mongo');
  fs.mkdirSync(dbPath, { recursive: true });

  console.log('🗄️  Iniciando MongoDB local persistente para desarrollo...');
  const mongodBin = await resolveMongodExecutable();
  const mongodProc = spawn(
    mongodBin,
    ['--dbpath', dbPath, '--port', String(DEFAULT_MONGO_PORT), '--bind_ip', DEFAULT_MONGO_HOST],
    {
      cwd: BACKEND_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );

  let earlyError = '';
  mongodProc.stderr.on('data', (chunk) => {
    earlyError += chunk.toString();
  });
  mongodProc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    if (/error|exception|failed/i.test(text)) {
      earlyError += text;
    }
  });

  const ready = await waitForPort(DEFAULT_MONGO_HOST, DEFAULT_MONGO_PORT, 25000);
  if (!ready) {
    try {
      mongodProc.kill();
    } catch (_) {}
    throw new Error(
      `No se pudo iniciar MongoDB local en ${DEFAULT_MONGO_HOST}:${DEFAULT_MONGO_PORT}.\n${earlyError.slice(-800)}`,
    );
  }

  console.log(`✅ MongoDB local listo en mongodb://${DEFAULT_MONGO_HOST}:${DEFAULT_MONGO_PORT}/${DEFAULT_DB_NAME}`);
  console.log(`📁 Carpeta de datos local: ${dbPath}`);
  return { mongodProc, useLocalUri: true };
}

async function main() {
  const envMap = readEnvFileKeys(ENV_PATH);
  const { mongodProc, useLocalUri } = await ensureLocalMongoIfNeeded(envMap);

  const nestCli = path.join(BACKEND_ROOT, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
  if (!fs.existsSync(nestCli)) {
    throw new Error(`No se encontró @nestjs/cli en ${nestCli}. Ejecuta "npm install" en backend/.`);
  }

  const childEnv = { ...process.env };
  if (useLocalUri) {
    childEnv.MONGODB_URI = `mongodb://${DEFAULT_MONGO_HOST}:${DEFAULT_MONGO_PORT}`;
    if (!envMap.MONGODB_DB_NAME && !process.env.MONGODB_DB_NAME) {
      childEnv.MONGODB_DB_NAME = DEFAULT_DB_NAME;
    }
    if (!envMap.MONGODB_AUTO_INDEX && !process.env.MONGODB_AUTO_INDEX) {
      childEnv.MONGODB_AUTO_INDEX = 'true';
    }
  }

  console.log('🚀 Iniciando backend NestJS (watch)...');
  const nestProc = spawn(process.execPath, [nestCli, 'start', '--watch'], {
    cwd: BACKEND_ROOT,
    env: childEnv,
    stdio: 'inherit',
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      nestProc.kill(signal);
    } catch (_) {}
    if (mongodProc && !mongodProc.killed) {
      try {
        mongodProc.kill();
      } catch (_) {}
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  nestProc.on('exit', (code) => {
    if (mongodProc && !mongodProc.killed) {
      try {
        mongodProc.kill();
      } catch (_) {}
    }
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('❌ Error al iniciar entorno local:', err?.message || err);
  process.exit(1);
});

