import { OKR } from '../domain';
import { randomUUID } from 'crypto';

const okrs: OKR[] = [];

export const okrService = {
  list(): OKR[] {
    return okrs;
  },
  create(data: Omit<OKR, 'id' | 'status'>): OKR {
    const okr: OKR = {
      id: randomUUID(),
      status: 'draft',
      ...data,
    };
    okrs.push(okr);
    return okr;
  }
};
