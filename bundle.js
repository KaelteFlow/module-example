#!/usr/bin/env node

/**
 * Modul-Bundle-Skript für KaelteFlow Module
 * 
 * Bündelt den kompilierten Build-Output von Backend und Frontend
 * sowie die manifest.json in einen gemeinsamen Ausgabeordner (dist/<manifest.id>).
 */

const fs = require('fs');
const path = require('path');
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

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--build' || arg === '-b') {
    shouldBuild = true;
  } else if ((arg === '--out' || arg === '-o') && args[i + 1]) {
    baseOutputDir = path.resolve(args[++i]);
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Verwendung: node bundle.js [Optionen] [Zielordner]

Optionen:
  -o, --out <ordner>   Basis-Zielordner für das Bundle (Standard: dist)
  -b, --build          Führt vor dem Bündeln die Builds für Backend & Frontend aus
  -h, --help           Zeigt diese Hilfe an
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
 * Führt einen Shell-Befehl im angegebenen Verzeichnis aus.
 */
function runCommand(command, cwd) {
  console.log(`[BUILD] Führe aus: "${command}" in ${cwd}`);
  try {
    execSync(command, { cwd, stdio: 'inherit' });
  } catch (error) {
    console.error(`[ERROR] Fehler beim Ausführen von "${command}":`, error.message);
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
 * Kopiert den Build-Output eines Submoduls (Backend/Frontend).
 * Erkennt automatisch, ob TypeScript verschachtelte Ordner (wie dist/backend/src oder dist/backend) erzeugt hat,
 * und platziert die kompilierten Artefakte sauber im Zielordner.
 */
function copyBuildOutput(moduleType, sourceDir, targetDir) {
  const distDir = path.join(sourceDir, 'dist');
  if (!fs.existsSync(distDir)) {
    console.warn(`[WARN] Kein 'dist'-Ordner in ${sourceDir} gefunden.`);
    return false;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  // Prüfen auf verschachtelte TS-Ausgabe (z.B. dist/backend/src oder dist/frontend/src durch rootDir: "..")
  const nestedTypeDir = path.join(distDir, moduleType);
  const nestedSrcDir = path.join(nestedTypeDir, 'src');

  if (fs.existsSync(nestedSrcDir)) {
    // Falls dist/backend/src existiert, kopiere dessen Inhalt direkt nach targetDir
    copyDirectoryContents(nestedSrcDir, targetDir);
    // Falls zusätzliche Dateien in dist/backend liegen
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
    // Falls dist/backend existiert
    copyDirectoryContents(nestedTypeDir, targetDir);
  } else {
    // Standard: Gesamten Inhalt von dist/ kopieren
    copyDirectoryContents(distDir, targetDir);
  }

  // Falls package.json im Submodul existiert, ebenfalls mitnehmen (optional hilfreich für Metadaten)
  const subPackageJson = path.join(sourceDir, 'package.json');
  if (fs.existsSync(subPackageJson) && !fs.existsSync(path.join(targetDir, 'package.json'))) {
    fs.copyFileSync(subPackageJson, path.join(targetDir, 'package.json'));
  }

  console.log(`[OK] ${moduleType.toUpperCase()} Build-Output kopiert nach -> ${targetDir}`);
  return true;
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
    console.log(`[1/4] Baue Backend...`);
    if (fs.existsSync(BACKEND_DIR)) {
      runCommand('npm run build', BACKEND_DIR);
    }

    console.log(`\n[2/4] Baue Frontend...`);
    if (fs.existsSync(FRONTEND_DIR)) {
      runCommand('npm run build', FRONTEND_DIR);
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

  // 2. Frontend Build-Output kopieren
  const targetFrontendDir = path.join(outputDir, 'frontend');
  if (fs.existsSync(FRONTEND_DIR)) {
    copyBuildOutput('frontend', FRONTEND_DIR, targetFrontendDir);
  }

  // 3. manifest.json kopieren (im Wurzelverzeichnis des Bundles)
  const targetManifestPath = path.join(outputDir, 'manifest.json');
  if (fs.existsSync(MANIFEST_SRC_PATH)) {
    fs.copyFileSync(MANIFEST_SRC_PATH, targetManifestPath);
    console.log(`[OK] manifest.json kopiert nach -> ${targetManifestPath}`);
  } else {
    console.error(`[ERROR] manifest.json wurde weder in 'src/' noch im Root-Verzeichnis gefunden!`);
  }

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
