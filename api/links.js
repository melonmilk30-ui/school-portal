// 수업 링크 저장소 (Vercel Serverless Function + Vercel Blob)
//
// GET  /api/links  -> { links: [...] }  (만료되지 않은 링크만)
// POST /api/links  -> { action: 'create' | 'delete', password, ... }
//
// 필요한 환경변수 (Vercel 프로젝트 Settings > Environment Variables)
//   TEACHER_PASSWORD      : 교사 공용 비밀번호
//   BLOB_READ_WRITE_TOKEN : Vercel Blob 스토어를 연결하면 자동으로 주입됨

import { put, list } from '@vercel/blob';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';

const BLOB_PATH = 'class-links.json';
const TTL_MS = 4 * 60 * 60 * 1000; // 4시간 뒤 자동 삭제
const MAX_LINKS = 50;

// ── Blob 읽기/쓰기 ────────────────────────────────────────────────
// 읽기는 공개 URL을 직접 가져온다(=Blob 작업 횟수를 쓰지 않음).
// 공개 URL의 호스트는 토큰(vercel_blob_rw_<storeId>_<secret>)에서 뽑아낸다.
let baseUrlCache = null;

function deriveBaseUrl() {
  const parts = (process.env.BLOB_READ_WRITE_TOKEN || '').split('_');
  return parts.length >= 5 && parts[3]
    ? `https://${parts[3]}.public.blob.vercel-storage.com`
    : null;
}

async function getBaseUrl() {
  if (baseUrlCache) return baseUrlCache;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null; // Blob 스토어 미연결
  baseUrlCache = deriveBaseUrl();
  if (baseUrlCache) return baseUrlCache;
  // 토큰 형식이 바뀐 경우에만 쓰이는 예비 경로
  const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
  if (blobs.length) baseUrlCache = new URL(blobs[0].url).origin;
  return baseUrlCache;
}

async function readLinks() {
  const base = await getBaseUrl();
  if (!base) return []; // Blob 스토어가 아직 연결되지 않은 상태
  const res = await fetch(`${base}/${BLOB_PATH}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return []; // 첫 등록 전에는 파일이 없음(404)
  try {
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeLinks(items) {
  await put(BLOB_PATH, JSON.stringify(items), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
}

const notExpired = (items) => {
  const now = Date.now();
  return items.filter((i) => i && typeof i.expiresAt === 'number' && i.expiresAt > now);
};

// ── 비밀번호 ──────────────────────────────────────────────────────
function passwordOk(given) {
  const expected = process.env.TEACHER_PASSWORD;
  if (!expected || typeof given !== 'string') return false;
  // 길이가 달라도 비교 시간이 같도록 해시로 맞춘 뒤 비교
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// ── 입력값 검증 ───────────────────────────────────────────────────
function validate(body) {
  const grade = Number(body.grade);
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return { error: '학년을 확인해 주세요.' };

  const classNo = Number(body.classNo);
  if (!Number.isInteger(classNo) || classNo < 1 || classNo > 20) return { error: '반을 확인해 주세요.' };

  const subject = String(body.subject ?? '').trim();
  if (!subject || subject.length > 8) return { error: '과목은 8자 이내로 입력해 주세요.' };

  const title = String(body.title ?? '').trim();
  if (!title || title.length > 30) return { error: '링크 제목은 30자 이내로 입력해 주세요.' };

  let url;
  try {
    url = new URL(String(body.url ?? '').trim());
  } catch {
    return { error: '올바른 주소(URL)를 입력해 주세요. 예) https://...' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'http 또는 https 주소만 등록할 수 있습니다.' };
  }
  if (url.href.length > 500) return { error: '주소가 너무 깁니다.' };

  return { value: { grade, classNo, subject, title, url: url.href } };
}

// ── 핸들러 ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ links: notExpired(await readLinks()) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      if (!process.env.TEACHER_PASSWORD) {
        return res.status(500).json({ error: '서버에 TEACHER_PASSWORD 환경변수가 설정되지 않았습니다.' });
      }
      if (!passwordOk(body.password)) {
        return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
      }

      let items = notExpired(await readLinks());

      if (body.action === 'delete') {
        const id = String(body.id ?? '');
        const before = items.length;
        items = items.filter((i) => i.id !== id);
        if (items.length === before) return res.status(200).json({ links: items });
      } else {
        const { error, value } = validate(body);
        if (error) return res.status(400).json({ error });
        if (items.length >= MAX_LINKS) {
          return res.status(400).json({ error: '등록된 링크가 너무 많습니다. 오래된 링크를 먼저 삭제해 주세요.' });
        }
        const now = Date.now();
        items.push({ id: randomUUID(), ...value, createdAt: now, expiresAt: now + TTL_MS });
      }

      await writeLinks(items);
      return res.status(200).json({ links: items });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/links]', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}
