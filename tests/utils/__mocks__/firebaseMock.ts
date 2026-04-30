export const dbMock = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      collection: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ empty: true, docs: [] }) }))
        })),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] })
      })),
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(null)
    })),
    get: jest.fn().mockResolvedValue({ empty: true, docs: [] })
  }))
};

export default dbMock;
