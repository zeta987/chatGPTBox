/* global process */

import archiver from 'archiver'
import fs from 'fs-extra'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SOURCE_REVIEW_TEXT = `Required System:
Windows 10/ Windows 11. Otherwise, the newline character in the output will be different.

Build steps:
npm ci
npm run build

firefox.zip is the output addon
please unzip it and compare its contents with the submitted files, ensuring that the contents are consistent
`

const REQUIRED_PATHS = [
  'src',
  'tests',
  'safari',
  '.github/workflows/scripts',
  'build.mjs',
  'package.json',
  'package-lock.json',
  '.nvmrc',
  '.prettierrc',
  '.eslintrc.json',
  'README.md',
  'AGENTS.md',
  'CURRENT_CHANGE.md',
  'SOURCE_CODE_REVIEW.md',
]

const EXCLUDED_ROOTS = new Set([
  'node_modules',
  'build',
  '.git',
  '.idea',
  '.cache',
  'coverage',
  '.tmp-audit',
])

export function shouldExcludeSourcePath(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/')
  const [firstPart] = normalized.split('/')
  if (EXCLUDED_ROOTS.has(firstPart)) return true
  return normalized.endsWith('.zip')
}

async function collectFiles(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, relativePath)
  const stat = await fs.stat(absolutePath)

  if (stat.isFile()) {
    return shouldExcludeSourcePath(relativePath) ? [] : [relativePath]
  }

  const entries = await fs.readdir(absolutePath)
  const files = []

  for (const entry of entries) {
    const childPath = path.join(relativePath, entry).replaceAll('\\', '/')
    if (shouldExcludeSourcePath(childPath)) continue
    files.push(...(await collectFiles(rootDir, childPath)))
  }

  return files
}

export async function buildFirefoxSourcesZip({
  rootDir = process.cwd(),
  outputPath = path.join(process.cwd(), 'build', 'firefox-sources.zip'),
} = {}) {
  const missing = []

  for (const relativePath of REQUIRED_PATHS) {
    if (!(await fs.pathExists(path.join(rootDir, relativePath)))) {
      missing.push(relativePath)
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required source review files: ${missing.join(', ')}`)
  }

  const sourceReviewPath = path.join(rootDir, 'SOURCE_CODE_REVIEW.md')
  const sourceReviewText = await fs.readFile(sourceReviewPath, 'utf8')
  if (sourceReviewText.replace(/\r\n/g, '\n') !== SOURCE_REVIEW_TEXT) {
    throw new Error('SOURCE_CODE_REVIEW.md does not match the required AMO instructions')
  }

  const files = []
  for (const relativePath of REQUIRED_PATHS) {
    files.push(...(await collectFiles(rootDir, relativePath)))
  }

  const uniqueFiles = Array.from(new Set(files)).sort()
  await fs.ensureDir(path.dirname(outputPath))

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.once('close', resolve)
    output.once('error', reject)
    archive.once('error', reject)
    archive.pipe(output)

    for (const relativePath of uniqueFiles) {
      archive.file(path.join(rootDir, relativePath), { name: relativePath })
    }

    archive.finalize()
  })

  const { size } = await fs.stat(outputPath)
  return {
    outputPath,
    fileCount: uniqueFiles.length,
    size,
  }
}

async function main() {
  const result = await buildFirefoxSourcesZip()
  console.log(`Created ${result.outputPath} (${result.fileCount} files, ${result.size} bytes)`)
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
