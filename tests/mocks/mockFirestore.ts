// Lightweight in-memory Firestore mock for integration tests
export function createMockFirestore() {
  const store = new Map<string, any>();

  const makePath = (...parts: string[]) => parts.filter(Boolean).join('/');

  const getDocsInCollection = (path: string) => {
    const docs: Array<{ id: string; data: any }> = [];
    for (const [k, v] of store.entries()) {
      if (k.startsWith(path + '/')) {
        const id = k.slice(path.length + 1);
        docs.push({ id, data: v });
      }
    }
    return docs;
  };

  const collection = (path: string) => ({
    path,
    orderBy: (field: string, dir?: string) => ({
      limit: (n: number) => ({
        get: async () => {
          const docs = getDocsInCollection(path).map(d => ({ id: d.id, data: () => d.data, ref: { id: d.id, update: async (u: any) => { store.set(`${path}/${d.id}`, { ...d.data, ...u }); }, get: async () => ({ exists: store.has(`${path}/${d.id}`), id: d.id, data: () => store.get(`${path}/${d.id}`) }) } }));
          return { empty: docs.length === 0, docs: docs.slice(0, n) };
        }
      })
    }),
    add: async (data: any) => {
      const id = Math.random().toString(36).slice(2, 10);
      const p = `${path}/${id}`;
      store.set(p, data);
      return { id };
    },
    doc: (id?: string) => {
      const docId = id || Math.random().toString(36).slice(2, 10);
      const docPath = `${path}/${docId}`;
      return {
        id: docId,
        set: async (data: any) => {
          store.set(docPath, data);
          return Promise.resolve();
        },
        update: async (data: any) => {
          const existing = store.get(docPath) || {};
          store.set(docPath, { ...existing, ...data });
          return Promise.resolve();
        },
        get: async () => ({ exists: store.has(docPath), id: docId, data: () => store.get(docPath) }),
        collection: (sub: string) => collection(`${docPath}/${sub}`),
        ref: {
          id: docId,
            update: async (u: any) => {
              const existing = store.get(docPath) || {};
              store.set(docPath, { ...existing, ...u });
            },
            get: async () => ({ exists: store.has(docPath), id: docId, data: () => store.get(docPath) })
        }
      };
    },
    get: async () => {
      const docs = getDocsInCollection(path).map(d => ({ id: d.id, data: () => d.data, ref: { id: d.id, update: async (u: any) => { store.set(`${path}/${d.id}`, { ...d.data, ...u }); }, get: async () => ({ exists: store.has(`${path}/${d.id}`), id: d.id, data: () => store.get(`${path}/${d.id}`) }) } }));
      return { empty: docs.length === 0, docs };
    },
    where: (field: string, op: string, value: any) => ({
      limit: (n: number) => ({
        get: async () => {
          const results: any[] = [];
          for (const [k, v] of store.entries()) {
            if (k.startsWith(path + '/')) {
              const candidate = v;
              const match = (candidate && ((candidate[field] === value) || (candidate?.business && candidate.business[field] === value)));
              if (match) {
                const id = k.slice(path.length + 1);
                results.push({ id, data: () => candidate, ref: { id, update: async (u: any) => { store.set(k, { ...candidate, ...u }); }, get: async () => ({ exists: store.has(k), id, data: () => store.get(k) }) } });
              }
            }
          }
          return { empty: results.length === 0, docs: results.slice(0, n) };
        }
      }),
      get: async () => {
        const results: any[] = [];
        for (const [k, v] of store.entries()) {
          if (k.startsWith(path + '/')) {
            const candidate = v;
            const match = (candidate && ((candidate[field] === value) || (candidate?.business && candidate.business[field] === value)));
            if (match) {
              const id = k.slice(path.length + 1);
              results.push({ id, data: () => candidate, ref: { id, update: async (u: any) => { store.set(k, { ...candidate, ...u }); }, get: async () => ({ exists: store.has(k), id, data: () => store.get(k) }) } });
            }
          }
        }
        return { empty: results.length === 0, docs: results };
      }
    })
  });

  return {
    collection,
    _getStore: () => store,
    getDocumentsAtPath: (path: string) => getDocsInCollection(path).map(d => ({ id: d.id, data: () => d.data })),
    settings: (opts: any) => { /* noop to mirror firestore.settings */ },
  };
}

export default createMockFirestore;
