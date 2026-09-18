/**
 * Shared DRF error parser for Ariav ERP.
 *
 * Future modules (Staff, Client, Purchase Orders, …) must use parseApiError /
 * notifyApiError from `notify.ts` instead of inline modal banners or raw JSON.
 *
 *   try {
 *     await api.create(payload);
 *     notifySuccess(`Brand '${name}' created successfully.`);
 *   } catch (err) {
 *     const parsed = notifyApiError(err);
 *     setFieldErrors(parsed.fields); // highlight inputs; keep the modal open
 *   }
 */

const GENERIC = 'Something went wrong. Please try again.';

const SKIP_KEYS = new Set([
  'success',
  'active_product_count',
  'active_children_count',
  'active_downstream_count',
  'downstream_count',
]);

const FIELD_LABELS: Record<string, string> = {
  category_code: 'Category code',
  category_name: 'Category name',
  parent_category_id: 'Parent category',
  brand_code: 'Brand code',
  brand_name: 'Brand name',
  brand_id: 'Brand',
  short_code: 'Short code',
  entity_name: 'Entity name',
  parent_entity_id: 'Parent entity',
  product_code: 'Product code',
  product_name: 'Product name',
  category_id: 'Category',
  customer_code: 'Customer code',
  customer_name: 'Customer name',
  customer_type: 'Customer type',
  entities: 'Entities',
  primary_entity_id: 'Primary entity',
  credit_limit: 'Credit limit',
  opening_balance: 'Opening balance',
  gst_no: 'GSTIN',
  gstin: 'GSTIN',
  pan_no: 'PAN',
  pan: 'PAN',
  phone: 'Phone',
  mobile: 'Mobile',
  email: 'Email',
  order_method: 'Order method',
  po_number: 'PO number',
  entity_id: 'Entity',
  customer_id: 'Customer',
  po_date: 'PO date',
  lines: 'Line items',
  quantity: 'Quantity',
  rate: 'Rate',
  status: 'Status',
  sku: 'SKU',
  code: 'Code',
  name: 'Name',
};

export interface ParsedApiError {
  message: string;
  fields: string[];
  status?: number;
}

function humanizeField(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/_id$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function asLines(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(asLines);
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(asLines);
  }
  return [String(value)];
}

function quoteCodes(text: string): string {
  return text.replace(/\b(code)\s+([A-Z0-9][A-Z0-9._/-]*)\b/gi, (_full, label: string, token: string) => {
    if (token.startsWith("'")) return `${label} ${token}`;
    return `${label} '${token}'`;
  });
}

function withUniquenessHint(field: string, text: string): string {
  if (!/already in use|already exists/i.test(text) || /try a different/i.test(text)) return text;
  const trimmed = text.replace(/\.+$/, '');
  if (/name/i.test(field) || /\bname\b/i.test(text)) return `${trimmed}. Try a different name.`;
  return `${trimmed}. Try a different code.`;
}

function polishFieldMessage(field: string, raw: string): string {
  let text = quoteCodes(raw.trim());
  text = withUniquenessHint(field, text);
  const label = humanizeField(field);
  const startsWithLabel = text.toLowerCase().startsWith(label.toLowerCase());
  if (!startsWithLabel && /required|this field/i.test(text)) {
    text = `${label}: ${text}`;
  }
  return text.endsWith('.') ? text : `${text}.`;
}

function payloadFromError(err: unknown): { data: Record<string, unknown> | null; status?: number } {
  if (err == null) return { data: null };
  const e = err as Error & {
    data?: unknown;
    status?: number;
    response?: { data?: unknown; status?: number };
  };
  const status = e.status ?? e.response?.status;
  let data: unknown = e.data ?? e.response?.data;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.startsWith('<') || trimmed.length > 400) return { data: null, status };
    try {
      data = JSON.parse(trimmed);
    } catch {
      return { data: { detail: trimmed }, status };
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return { data: data as Record<string, unknown>, status };
  }
  const msg = typeof e.message === 'string' ? e.message : '';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return { data: null, status };
  if (msg.startsWith('{')) {
    try {
      const parsed = JSON.parse(msg);
      if (parsed && typeof parsed === 'object') return { data: parsed as Record<string, unknown>, status };
    } catch {
      /* ignore */
    }
  }
  if (msg && !/^HTTP \d+/.test(msg) && msg.length < 240) {
    return { data: { detail: msg }, status };
  }
  return { data: null, status };
}

export function parseApiError(err: unknown, fallback = GENERIC): string {
  return parseApiErrorDetails(err, fallback).message;
}

export function parseApiErrorDetails(err: unknown, fallback = GENERIC): ParsedApiError {
  const { data, status } = payloadFromError(err);
  if (status && status >= 500) return { message: fallback, fields: [], status };

  if (!data) return { message: fallback, fields: [], status };

  if (typeof data.detail === 'string' && data.detail.trim()) {
    return { message: quoteCodes(data.detail.trim()), fields: [], status };
  }
  if (Array.isArray(data.detail)) {
    const joined = asLines(data.detail).join(' ');
    if (joined) return { message: quoteCodes(joined), fields: [], status };
  }

  const nonField = asLines(data.non_field_errors);
  const fields: string[] = [];
  const sentences: string[] = [...nonField.map(t => quoteCodes(t))];

  for (const [key, val] of Object.entries(data)) {
    if (SKIP_KEYS.has(key) || key === 'detail' || key === 'non_field_errors') continue;
    const lines = asLines(val);
    if (!lines.length) continue;
    fields.push(key);
    for (const line of lines) sentences.push(polishFieldMessage(key, line));
  }

  const message = sentences.join(' ').trim();
  if (!message || message.startsWith('{') || message.startsWith('[')) {
    return { message: fallback, fields, status };
  }
  return { message, fields, status };
}
