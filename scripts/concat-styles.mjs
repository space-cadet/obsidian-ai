import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'styles.css');
const partials = [
	'base',
	'chat',
	'tool-calls',
	'chat-extensions',
	'settings',
	'sync',
	'model-switcher',
];

const contents = await Promise.all(
	partials.map((name) => readFile(resolve(root, 'styles', `_${name}.css`), 'utf8')),
);
await writeFile(output, contents.join('\n'), 'utf8');
