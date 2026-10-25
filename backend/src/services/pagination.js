const { fail } = require('./jpt');
function pageOptions(query = {}) {
  const read = (key, fallback, max) => {
    const raw = query[key] ?? fallback;
    fail((typeof raw === 'string' || typeof raw === 'number') && /^\d+$/.test(String(raw)) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0 && Number(raw) <= max, `${key === 'page' ? 'Page' : 'Limit'} is outside the allowed range`);
    return Number(raw);
  };
  return { page: read('page', 1, 1000000), limit: read('limit', 20, 200) };
}
function pageMeta(total, query = {}) {
  const { page, limit } = pageOptions(query); const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page: Math.min(page, pages), limit, pages };
}
async function listPage(model, options, query) {
  pageOptions(query); // Reject bad input before querying the database.
  const meta = pageMeta(await model.count({ where: options.where }), query);
  const data = await model.findMany({ ...options, skip: (meta.page - 1) * meta.limit, take: meta.limit });
  return { data, ...meta };
}
function arrayPage(rows, query) {
  const meta = pageMeta(rows.length, query);
  return { data: rows.slice((meta.page - 1) * meta.limit, meta.page * meta.limit), ...meta };
}
module.exports = { pageOptions, pageMeta, listPage, arrayPage };
