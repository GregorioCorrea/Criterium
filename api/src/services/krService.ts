import { KeyResult } from '../domain';
import { randomUUID } from 'crypto';

const krs: KeyResult[] = [];

export const krService = {
  list(): KeyResult[] {
    return krs;
  },
  create(data: Omit<KeyResult, 'id' | 'status' | 'currentValue'>): KeyResult {
    const kr: KeyResult = {
      id: randomUUID(),
      status: 'planned',
      currentValue: 0,
      ...data,
    };
    krs.push(kr);
    return kr;
  }
};
