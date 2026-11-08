#!/usr/bin/env node

/**
 * Modul-Bundle-Skript für KaelteFlow Module
 * 
 * Bündelt den kompilierten Build-Output von Backend, packt das Frontend in eine ZIP-Datei (frontend.zip),
 * kopiert die manifest.json und generiert eine JSON-Integritätsdatei (integrity.json) mit SHA-256 Hashes
 * aller enthaltenen Dateien zur Manipulations- und Integritätsprüfung.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { execSync } = require('child_process');

// Pfade definieren
const MODULE_ROOT = path.resolve(__dirname);
const BACKEND_DIR = path.join(MODULE_ROOT, 'backend');
const FRONTEND_DIR = path.join(MODULE_ROOT, 'frontend');
const SRC_DIR = path.join(MODULE_ROOT, 'src');

// Manifest-Pfad (kann in src/ oder im Root liegen)
const MANIFEST_SRC_PATH = fs.existsSync(path.join(SRC_DIR, 'manifest.json'))
  ? path.join(SRC_DIR, 'manifest.json')
  : path.join(MODULE_ROOT, 'manifest.json');

// Modul-ID aus der manifest.json auslesen
let manifestData = {};
if (fs.existsSync(MANIFEST_SRC_PATH)) {
  try {
    manifestData = JSON.parse(fs.readFileSync(MANIFEST_SRC_PATH, 'utf-8'));
  } catch (error) {
    console.warn(`[WARN] Konnte manifest.json nicht parsen: ${error.message}`);
  }
}

const moduleId = manifestData.id;
if (!moduleId) {
  console.error(`[ERROR] Keine 'id' in manifest.json (${MANIFEST_SRC_PATH}) gefunden.`);
  process.exit(1);
}

// CLI-Argumente parsen
const args = process.argv.slice(2);
let baseOutputDir = path.join(MODULE_ROOT, 'dist');
let shouldBuild = false;
let hashAlgorithm = 'sha256';
let integrityFileName = 'integrity.json';

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--build' || arg === '-b') {
    shouldBuild = true;
  } else if ((arg === '--out' || arg === '-o') && args[i + 1]) {
    baseOutputDir = path.resolve(args[++i]);
  } else if (arg === '--algo' && args[i + 1]) {
    hashAlgorithm = args[++i];
  } else if (arg === '--integrity-file' && args[i + 1]) {
    integrityFileName = args[++i];
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Verwendung: node bundle.js [Optionen] [Zielordner]

Optionen:
  -o, --out <ordner>           Basis-Zielordner für das Bundle (Standard: dist)
  -b, --build                  Führt vor dem Bündeln die Builds für Backend & Frontend aus
  --algo <algorithmus>         Hash-Algorithmus für Integritätsdatei (Standard: sha256)
  --integrity-file <dateiname> Dateiname für die Hashes (Standard: integrity.json)
  -h, --help                   Zeigt diese Hilfe an
`);
    process.exit(0);
  } else if (!arg.startsWith('-')) {
    baseOutputDir = path.resolve(arg);
  }
}

// Finale Zielausgabe im Ordner der manifest.id (z. B. dist/<manifest.id>)
const outputDir = path.basename(baseOutputDir) === moduleId
  ? baseOutputDir
  : path.join(baseOutputDir, moduleId);

/**
 * Führt das 'build'-Skript aus der package.json des jeweiligen Verzeichnisses aus (z.B. ng-packagr für Frontend, tsc für Backend).
 */
function runPackageBuild(cwd, label) {
  console.log(`[BUILD] Führe 'npm run build' für ${label} aus (${cwd})...`);
  try {
    execSync('npm run build', { cwd, stdio: 'inherit' });
  } catch (error) {
    console.error(`[ERROR] Build für ${label} in ${cwd} fehlgeschlagen:`, error.message);
    throw error;
  }
}

/**
 * Kopiert Verzeichnisinhalte rekursiv.
 */
function copyDirectoryContents(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

/**
 * Erstellt ein standardkonformes ZIP-Archiv im Speicher (PKZip Format).
 * Benötigt keine externen npm-Abhängigkeiten.
 * 
 * @param {Array<{name: string, data: Buffer}>} files 
 * @returns {Buffer}
 */
function createZipBuffer(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8');
    const data = file.data;
    const crc = zlib.crc32 ? zlib.crc32(data) : 0;
    const compressed = zlib.deflateRawSync(data);
    const useCompressed = compressed.length < data.length;
    const finalData = useCompressed ? compressed : data;
    const method = useCompressed ? 8 : 0;

    // Local file header (30 Bytes + nameBuf.length)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signatur PK\x03\x04
    localHeader.writeUInt16LE(20, 4);         // Version (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // Flags (UTF-8)
    localHeader.writeUInt16LE(method, 8);     // Kompressionsmethode (8=Deflate, 0=Store)
    localHeader.writeUInt16LE(0, 10);         // Mod Zeit
    localHeader.writeUInt16LE(0, 12);         // Mod Datum
    localHeader.writeUInt32LE(crc, 14);       // CRC-32
    localHeader.writeUInt32LE(finalData.length, 18); // Komprimierte Größe
    localHeader.writeUInt32LE(data.length, 22);      // Unkomprimierte Größe
    localHeader.writeUInt16LE(nameBuf.length, 26);   // Dateinamenlänge
    localHeader.writeUInt16LE(0, 28);                // Extra field Länge
    nameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, finalData);

    // Central directory header (46 Bytes + nameBuf.length)
    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signatur PK\x01\x02
    centralHeader.writeUInt16LE(20, 4);         // Version made by
    centralHeader.writeUInt16LE(20, 6);         // Version needed
    centralHeader.writeUInt16LE(0x0800, 8);     // Flags (UTF-8)
    centralHeader.writeUInt16LE(method, 10);    // Kompressionsmethode
    centralHeader.writeUInt16LE(0, 12);         // Mod Zeit
    centralHeader.writeUInt16LE(0, 14);         // Mod Datum
    centralHeader.writeUInt32LE(crc, 16);       // CRC-32
    centralHeader.writeUInt32LE(finalData.length, 20); // Komprimierte Größe
    centralHeader.writeUInt32LE(data.length, 24);      // Unkomprimierte Größe
    centralHeader.writeUInt16LE(nameBuf.length, 28);   // Dateinamenlänge
    centralHeader.writeUInt16LE(0, 30);                // Extra field Länge
    centralHeader.writeUInt16LE(0, 32);                // File comment Länge
    centralHeader.writeUInt16LE(0, 34);                // Disk number start
    centralHeader.writeUInt16LE(0, 36);                // Internal attributes
    centralHeader.writeUInt32LE(0, 38);                // External attributes
    centralHeader.writeUInt32LE(offset, 42);           // Relativer Offset des Local Headers
    nameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + finalData.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  // End of central directory record (22 Bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Signatur PK\x05\x06
  eocd.writeUInt16LE(0, 4);          // Disk Nummer
  eocd.writeUInt16LE(0, 6);          // Start Disk
  eocd.writeUInt16LE(files.length, 8); // Einträge auf Disk
  eocd.writeUInt16LE(files.length, 10); // Gesamtanzahl Einträge
  eocd.writeUInt32LE(centralDirSize, 12); // Größe des Central Directory
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset des Central Directory
  eocd.writeUInt16LE(0, 20);         // Kommentar-Länge

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/**
 * Sammelt alle Dateien eines Ordners rekursiv als Liste von relativen Pfaden und Buffers.
 */
function collectFilesRecursively(baseDir, currentDir = baseDir) {
  const results = [];
  if (!fs.existsSync(currentDir)) return results;

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursively(baseDir, fullPath));
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push({
        name: relativePath,
        data: fs.readFileSync(fullPath)
      });
    }
  }
  return results;
}

/**
 * Kopiert den Build-Output eines Submoduls (Backend).
 */
function copyBuildOutput(moduleType, sourceDir, targetDir) {
  const distDir = path.join(sourceDir, 'dist');
  if (!fs.existsSync(distDir)) {
    console.warn(`[WARN] Kein 'dist'-Ordner in ${sourceDir} gefunden.`);
    return false;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const nestedTypeDir = path.join(distDir, moduleType);
  const nestedSrcDir = path.join(nestedTypeDir, 'src');

  if (fs.existsSync(nestedSrcDir)) {
    copyDirectoryContents(nestedSrcDir, targetDir);
    const otherItems = fs.readdirSync(nestedTypeDir).filter(f => f !== 'src');
    for (const item of otherItems) {
      const srcItem = path.join(nestedTypeDir, item);
      const destItem = path.join(targetDir, item);
      if (fs.statSync(srcItem).isDirectory()) {
        copyDirectoryContents(srcItem, destItem);
      } else {
        fs.copyFileSync(srcItem, destItem);
      }
    }
  } else if (fs.existsSync(nestedTypeDir)) {
    copyDirectoryContents(nestedTypeDir, targetDir);
  } else {
    copyDirectoryContents(distDir, targetDir);
  }

  const subPackageJson = path.join(sourceDir, 'package.json');
  if (fs.existsSync(subPackageJson) && !fs.existsSync(path.join(targetDir, 'package.json'))) {
    fs.copyFileSync(subPackageJson, path.join(targetDir, 'package.json'));
  }

  console.log(`[OK] ${moduleType.toUpperCase()} Build-Output kopiert nach -> ${targetDir}`);
  return true;
}

/**
 * Packt den Frontend-Build-Output (ng-packagr) in eine ZIP-Datei (frontend.zip).
 */
function zipFrontendOutput(sourceDir, targetZipPath) {
  const distDir = path.join(sourceDir, 'dist');
  if (!fs.existsSync(distDir)) {
    console.warn(`[WARN] Kein 'dist'-Ordner in ${sourceDir} gefunden.`);
    return false;
  }

  // ng-packagr erzeugt die Bundles direkt in dist/ (fesm2022, types, package.json etc.)
  let filesToZip = collectFilesRecursively(distDir);

  // Fallback: Falls package.json nicht im dist-Ordner liegt, aus dem Submodul-Root mitnehmen
  const subPackageJson = path.join(sourceDir, 'package.json');
  if (fs.existsSync(subPackageJson) && !filesToZip.some(f => f.name === 'package.json')) {
    filesToZip.push({ name: 'package.json', data: fs.readFileSync(subPackageJson) });
  }

  if (filesToZip.length === 0) {
    console.warn(`[WARN] Keine Frontend-Dateien zum Zippen gefunden.`);
    return false;
  }

  const zipBuffer = createZipBuffer(filesToZip);
  fs.writeFileSync(targetZipPath, zipBuffer);
  console.log(`[OK] FRONTEND ng-packagr Build-Output gezippt (${filesToZip.length} Dateien, ${(zipBuffer.length / 1024).toFixed(1)} KB) -> ${targetZipPath}`);
  return true;
}

/**
 * Generiert die JSON-Integritätsdatei mit Prüfsummen aller Dateien im Bundle.
 */
function generateIntegrityManifest(bundleDir, integrityFile, algorithm = 'sha256') {
  const allFiles = collectFilesRecursively(bundleDir);
  const fileHashes = {};

  for (const file of allFiles) {
    // Die Integritätsdatei selbst nicht in die Hash-Berechnung aufnehmen
    if (file.name === integrityFile) continue;

    const hash = crypto.createHash(algorithm).update(file.data).digest('hex');
    fileHashes[file.name] = hash;
  }

  const integrityData = {
    id: moduleId,
    version: manifestData.version || '1.0.0',
    algorithm: algorithm,
    createdAt: new Date().toISOString(),
    files: fileHashes
  };

  const integrityPath = path.join(bundleDir, integrityFile);
  fs.writeFileSync(integrityPath, JSON.stringify(integrityData, null, 2), 'utf-8');
  console.log(`[OK] Integritätsdatei (${Object.keys(fileHashes).length} Hashes, ${algorithm}) erstellt -> ${integrityPath}`);
  return integrityData;
}

/**
 * Hauptfunktion zum Erstellen des Bundles
 */
function createBundle() {
  console.log(`==================================================`);
  console.log(`KaelteFlow Modul-Bundler`);
  console.log(`Modul-Root:  ${MODULE_ROOT}`);
  console.log(`Modul-ID:    ${moduleId}`);
  console.log(`Zielordner:  ${outputDir}`);
  console.log(`==================================================\n`);

  // Optional: Vorher bauen
  if (shouldBuild) {
    console.log(`[1/4] Baue Backend (npm run build)...`);
    if (fs.existsSync(BACKEND_DIR)) {
      runPackageBuild(BACKEND_DIR, 'Backend');
    }

    console.log(`\n[2/4] Baue Frontend (npm run build mit ng-packagr)...`);
    if (fs.existsSync(FRONTEND_DIR)) {
      runPackageBuild(FRONTEND_DIR, 'Frontend');
    }
  }

  // Zielordner vorbereiten / bereinigen
  console.log(`\n[Vorbereitung] Bereinige Zielordner: ${outputDir}`);
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Backend Build-Output kopieren
  const targetBackendDir = path.join(outputDir, 'backend');
  if (fs.existsSync(BACKEND_DIR)) {
    copyBuildOutput('backend', BACKEND_DIR, targetBackendDir);
  }

  // 2. Frontend Build-Output als ZIP packen
  const targetFrontendZipPath = path.join(outputDir, 'frontend.zip');
  if (fs.existsSync(FRONTEND_DIR)) {
    zipFrontendOutput(FRONTEND_DIR, targetFrontendZipPath);
  }

  // 3. manifest.json kopieren (im Wurzelverzeichnis des Bundles)
  const targetManifestPath = path.join(outputDir, 'manifest.json');
  if (fs.existsSync(MANIFEST_SRC_PATH)) {
    fs.copyFileSync(MANIFEST_SRC_PATH, targetManifestPath);
    console.log(`[OK] manifest.json kopiert nach -> ${targetManifestPath}`);
  } else {
    console.error(`[ERROR] manifest.json wurde weder in 'src/' noch im Root-Verzeichnis gefunden!`);
  }

  // 4. Integritätsdatei (Hashes aller Bundle-Dateien inklusive manifest.json und frontend.zip) generieren
  generateIntegrityManifest(outputDir, integrityFileName, hashAlgorithm);

  console.log(`\n==================================================`);
  console.log(`Bundle erfolgreich erstellt in: ${outputDir}`);
  console.log(`Inhalt:`);
  if (fs.existsSync(outputDir)) {
    const items = fs.readdirSync(outputDir);
    items.forEach(item => {
      const itemPath = path.join(outputDir, item);
      const isDir = fs.statSync(itemPath).isDirectory();
      console.log(` - ${item}${isDir ? '/' : ''}`);
    });
  }
  console.log(`==================================================`);
}

createBundle();
