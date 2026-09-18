/**
 * Entity Master API — /api/entities/
 * Foundation layer for multi-entity hierarchy and roll-up filters.
 */

import { apiUrl } from './apiBase';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ariav_auth_token');
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(
      (data as { detail?: string })?.detail
        || JSON.stringify(data)
        || `HTTP ${res.status}`,
    );
    (error as Error & { data: unknown; status: number }).data = data;
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return data as T;
}

export const ENTITY_TYPES = ['Head Office', 'Regional', 'Branch'] as const;
export type EntityTypeName = (typeof ENTITY_TYPES)[number];
export type EntityStatus = 'Active' | 'Inactive';

export interface EntityRow {
  id: number;
  short_code: string;
  entity_name: string;
  entity_type: EntityTypeName | string;
  parent_entity_id: number | null;
  cash_code: string;
  invoice_series: string;
  status: EntityStatus;
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  created_by_name?: string;
  address_line_1: string;
  street: string;
  address_line_2: string;
  area: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  district: string;
  zone: string;
  contact_person: string;
  phone: string;
  mobile: string;
  fax: string;
  email: string;
  website: string;
  std_code: string;
  pan_no: string;
  gst_no: string;
  cst_tin: string;
  licence_no: string;
  ecc: string;
  division: string;
  range: string;
  other_1: string;
  other_2: string;
  active_children_count: number;
  children_count: number;
}

export interface EntityTreeNode {
  id: number;
  short_code: string;
  entity_name: string;
  entity_type: string;
  parent_entity_id: number | null;
  status: EntityStatus;
  city: string;
  state: string;
  active_children_count: number;
  context_only?: boolean;
  children: EntityTreeNode[];
}

export interface EntityDetail extends EntityRow {
  parent: { id: number; short_code: string; entity_name: string; entity_type: string; status: EntityStatus } | null;
  children: { id: number; short_code: string; entity_name: string; entity_type: string; status: EntityStatus }[];
  ancestor_ids: number[];
  descendant_ids: number[];
}

export const emptyEntity = (): Partial<EntityRow> => ({
  short_code: '',
  entity_name: '',
  entity_type: 'Branch',
  parent_entity_id: null,
  cash_code: '',
  invoice_series: '',
  status: 'Active',
  address_line_1: '',
  street: '',
  address_line_2: '',
  area: '',
  city: '',
  state: 'Gujarat',
  country: 'India',
  pin_code: '',
  district: '',
  zone: '',
  contact_person: '',
  phone: '',
  mobile: '',
  fax: '',
  email: '',
  website: '',
  std_code: '',
  pan_no: '',
  gst_no: '',
  cst_tin: '',
  licence_no: '',
  ecc: '',
  division: '',
  range: '',
  other_1: '',
  other_2: '',
});

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const entitiesApi = {
  list: (params: { status?: string; parent_entity_id?: number | 'null'; search?: string } = {}) =>
    request<EntityRow[]>(`/api/entities/${qs(params)}`),
  tree: (params: { status?: string } = {}) =>
    request<EntityTreeNode[]>(`/api/entities/${qs({ ...params, tree: 1 })}`),
  retrieve: (id: number) => request<EntityDetail>(`/api/entities/${id}/`),
  descendantTree: (id: number) => request<EntityTreeNode>(`/api/entities/${id}/tree/`),
  create: (body: unknown) => request<EntityRow>('/api/entities/', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: unknown) =>
    request<EntityRow>(`/api/entities/${id}/`, { method: 'PUT', body: JSON.stringify(body) }),
  deactivate: (id: number) => request<EntityRow>(`/api/entities/${id}/`, { method: 'DELETE' }),
};

/** IDs for a report/filter: this entity only, or this entity plus descendants (roll-up). */
export function entityScopeIds(
  rootId: number,
  nodes: EntityTreeNode[],
  includeSubEntities: boolean,
): number[] {
  if (!includeSubEntities) return [rootId];
  const byParent = new Map<number | null, EntityTreeNode[]>();
  const walk = (list: EntityTreeNode[]) => {
    for (const n of list) {
      const pid = n.parent_entity_id;
      const arr = byParent.get(pid) || [];
      arr.push(n);
      byParent.set(pid, arr);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  const ids = [rootId];
  const queue = [rootId];
  const flat: EntityTreeNode[] = [];
  const collect = (list: EntityTreeNode[]) => {
    for (const n of list) {
      flat.push(n);
      if (n.children?.length) collect(n.children);
    }
  };
  collect(nodes);
  const kidsOf = (id: number) => flat.filter(n => n.parent_entity_id === id);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const child of kidsOf(cur)) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}
