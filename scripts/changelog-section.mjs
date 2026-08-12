#!/usr/bin/env node
// Imprime las novedades de una versión, para que el workflow las use como
// cuerpo de la release y —lo que importa— como campo `notes` del latest.json.
//
// FALLA si la sección no existe. Publicar una versión con las novedades vacías
// significa que todo el mundo ve un cartel sin texto y nadie se entera hasta
// que ya está publicado; es mejor que se caiga el build.
import { readFileSync } from 'node:fs';
import { changelogSection } from '../src/lib/desktop/update-check.js';

const version = process.argv[2];
if (!version) {
	console.error('Uso: node scripts/changelog-section.mjs <version>');
	process.exit(1);
}

const section = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version);
if (!section) {
	console.error(`CHANGELOG.md no tiene una sección "## ${version}". Escribila antes de taguear.`);
	process.exit(1);
}

process.stdout.write(section);
