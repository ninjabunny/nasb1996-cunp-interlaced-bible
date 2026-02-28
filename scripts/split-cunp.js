#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const ROOT_DIR = process.cwd();
const INPUT_PATH = path.join(ROOT_DIR, 'CUNP.json');
const OUTPUT_ROOT = path.join(ROOT_DIR, 'assets', 'cunp');
const BOOKS_ROOT = path.join(OUTPUT_ROOT, 'books');

function padId(value) {
  return String(value).padStart(2, '0');
}

function ensureInteger(value, field, index) {
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid ${field} at row ${index}: expected integer, got ${value}`);
  }
}

function ensureString(value, field, index) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field} at row ${index}: expected string`);
  }
}

function normalizeVerse(row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`Invalid row at index ${index}: expected object`);
  }

  const requiredFields = ['pk', 'translation', 'book', 'chapter', 'verse', 'text'];
  for (const field of requiredFields) {
    if (!(field in row)) {
      throw new Error(`Missing ${field} at row ${index}`);
    }
  }

  ensureInteger(row.pk, 'pk', index);
  ensureInteger(row.book, 'book', index);
  ensureInteger(row.chapter, 'chapter', index);
  ensureInteger(row.verse, 'verse', index);
  ensureString(row.translation, 'translation', index);
  ensureString(row.text, 'text', index);
  if (Object.prototype.hasOwnProperty.call(row, 'comment') && row.comment !== null && typeof row.comment !== 'string') {
    throw new Error(`Invalid comment at row ${index}: expected string or null`);
  }

  return {
    pk: row.pk,
    translation: row.translation,
    book: row.book,
    chapter: row.chapter,
    verse: row.verse,
    text: row.text,
    ...(Object.prototype.hasOwnProperty.call(row, 'comment') ? { comment: row.comment } : {}),
  };
}

function sortVerses(a, b) {
  return a.book - b.book || a.chapter - b.chapter || a.verse - b.verse || a.pk - b.pk;
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('CUNP.json must contain a top-level array');
  }

  const verses = parsed.map(normalizeVerse).sort(sortVerses);
  if (verses.length === 0) {
    throw new Error('CUNP.json contains no verses');
  }

  const translationSet = new Set(verses.map((v) => v.translation));
  if (translationSet.size !== 1 || !translationSet.has('CUNP')) {
    throw new Error(`Expected exactly one translation "CUNP", got: ${[...translationSet].join(', ')}`);
  }

  await fs.mkdir(BOOKS_ROOT, { recursive: true });

  const booksMap = new Map();
  for (const verse of verses) {
    if (!booksMap.has(verse.book)) {
      booksMap.set(verse.book, new Map());
    }
    const chaptersMap = booksMap.get(verse.book);
    if (!chaptersMap.has(verse.chapter)) {
      chaptersMap.set(verse.chapter, []);
    }
    chaptersMap.get(verse.chapter).push(verse);
  }

  const bookIds = [...booksMap.keys()].sort((a, b) => a - b);

  const index = {
    translation: 'CUNP',
    sourceFile: 'CUNP.json',
    bookCount: bookIds.length,
    chapterCount: 0,
    verseCount: verses.length,
    books: [],
  };

  for (const book of bookIds) {
    const bookId = padId(book);
    const bookDir = path.join(BOOKS_ROOT, bookId);
    await fs.mkdir(bookDir, { recursive: true });

    const chaptersMap = booksMap.get(book);
    const chapterIds = [...chaptersMap.keys()].sort((a, b) => a - b);

    const bookRecord = {
      translation: 'CUNP',
      book,
      chapters: [],
    };

    const indexBook = {
      book,
      bookId,
      chapterCount: chapterIds.length,
      chapters: [],
      bookPath: path.posix.join('books', bookId, 'book.json'),
    };

    for (const chapter of chapterIds) {
      const chapterId = padId(chapter);
      const chapterVerses = chaptersMap.get(chapter).slice().sort((a, b) => a.verse - b.verse || a.pk - b.pk);

      const chapterPath = path.join(bookDir, `${chapterId}.json`);
      await writeJson(chapterPath, chapterVerses);

      bookRecord.chapters.push({
        chapter,
        verses: chapterVerses,
      });

      indexBook.chapters.push({
        chapter,
        chapterId,
        verseCount: chapterVerses.length,
        path: path.posix.join('books', bookId, `${chapterId}.json`),
      });

      index.chapterCount += 1;
    }

    await writeJson(path.join(bookDir, 'book.json'), bookRecord);
    index.books.push(indexBook);
  }

  await writeJson(path.join(OUTPUT_ROOT, 'index.json'), index);

  console.log(`Generated ${index.chapterCount} chapter files across ${index.bookCount} books in assets/cunp`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
