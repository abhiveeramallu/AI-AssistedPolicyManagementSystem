const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const dbFilePath = env.localDbPath;

const collections = {
  PolicyProposal: new Map(),
  EncryptedFile: new Map(),
  TokenLog: new Map(),
  AuditLog: new Map()
};

let isInitialized = false;

const reviveDateIfNeeded = (key, value) => {
  if (typeof value !== 'string') return value;

  if (!/(At|Date)$/i.test(key)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed;
};

const reviveObject = (input) => {
  if (Array.isArray(input)) {
    return input.map((item) => reviveObject(item));
  }

  if (!input || typeof input !== 'object') {
    return input;
  }

  return Object.entries(input).reduce((acc, [key, value]) => {
    if (value && typeof value === 'object') {
      acc[key] = reviveObject(value);
      return acc;
    }

    acc[key] = reviveDateIfNeeded(key, value);
    return acc;
  }, {});
};

const ensureInitialized = () => {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

  if (isInitialized) return;

  const hasFile = fs.existsSync(dbFilePath);
  if (!hasFile) {
    isInitialized = true;
    return;
  }

  const serialized = fs.readFileSync(dbFilePath, 'utf8');
  if (!serialized.trim()) {
    isInitialized = true;
    return;
  }

  const parsed = JSON.parse(serialized);

  Object.keys(collections).forEach((name) => {
    const entries = parsed[name] || [];
    entries.forEach((entry) => {
      const revived = reviveObject(entry);
      collections[name].set(revived._id, revived);
    });
  });

  isInitialized = true;
};

const persistToDisk = () => {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

  const output = {};

  Object.entries(collections).forEach(([name, collection]) => {
    output[name] = Array.from(collection.values());
  });

  fs.writeFileSync(dbFilePath, JSON.stringify(output, null, 2), 'utf8');
};

const matchesQuery = (document, query = {}) => {
  return Object.entries(query).every(([key, expected]) => {
    const actual = document[key];

    if (actual instanceof Date || expected instanceof Date) {
      return new Date(actual).getTime() === new Date(expected).getTime();
    }

    if (typeof actual === 'object' || typeof expected === 'object') {
      return JSON.stringify(actual) === JSON.stringify(expected);
    }

    return String(actual) === String(expected);
  });
};

const compareValues = (left, right) => {
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;

  if (leftValue === rightValue) return 0;
  return leftValue > rightValue ? 1 : -1;
};

class QueryBuilder {
  constructor(items) {
    this.items = items;
  }

  sort(spec = {}) {
    const [field, direction] = Object.entries(spec)[0] || [];

    if (!field) return this;

    this.items.sort((a, b) => {
      const order = compareValues(a[field], b[field]);
      return direction === -1 ? -order : order;
    });

    return this;
  }

  limit(limitCount) {
    return Promise.resolve(this.items.slice(0, limitCount));
  }

  then(resolve, reject) {
    return Promise.resolve(this.items).then(resolve, reject);
  }
}

const attachDocumentMethods = (collectionName, document) => {
  if (!Object.getOwnPropertyDescriptor(document, 'id')) {
    Object.defineProperty(document, 'id', {
      enumerable: true,
      configurable: true,
      get() {
        return this._id;
      }
    });
  }

  document.save = async function save() {
    ensureInitialized();
    this.updatedAt = new Date();
    collections[collectionName].set(this._id, this);
    persistToDisk();
    return this;
  };

  return document;
};

const createModel = (collectionName) => {
  const collection = collections[collectionName];

  const findOneInternal = (query = {}) => {
    ensureInitialized();

    for (const document of collection.values()) {
      if (matchesQuery(document, query)) {
        return document;
      }
    }
    return null;
  };

  return {
    create: async (payload) => {
      ensureInitialized();

      const document = {
        ...payload,
        _id: payload._id || crypto.randomBytes(12).toString('hex'),
        createdAt: payload.createdAt || new Date(),
        updatedAt: payload.updatedAt || new Date()
      };

      attachDocumentMethods(collectionName, document);
      collection.set(document._id, document);
      persistToDisk();

      return document;
    },

    findById: async (id) => {
      ensureInitialized();
      const document = collection.get(String(id));

      if (!document) return null;
      attachDocumentMethods(collectionName, document);
      return document;
    },

    findOne: async (query = {}) => {
      const document = findOneInternal(query);
      if (!document) return null;
      attachDocumentMethods(collectionName, document);
      return document;
    },

    find: (query = {}) => {
      ensureInitialized();
      const items = Array.from(collection.values())
        .filter((document) => matchesQuery(document, query))
        .map((document) => attachDocumentMethods(collectionName, document));

      return new QueryBuilder(items);
    },

    deleteOne: async (query = {}) => {
      const target = findOneInternal(query);
      if (!target) return { deletedCount: 0 };

      collection.delete(target._id);
      persistToDisk();

      return { deletedCount: 1 };
    }
  };
};

const resetInMemoryStore = () => {
  Object.values(collections).forEach((collection) => collection.clear());
  persistToDisk();
};

module.exports = {
  createModel,
  resetInMemoryStore
};
